import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { ApiOk, ApiErr, CalendarDTO, CalendarEventDTO, CalendarSource } from '@/lib/contracts';

/**
 * GET /api/calendar/mine?source=mock|google  →  CalendarDTO
 *
 * The signed-in interviewer's own week: the busy blocks SIRA schedules around,
 * plus the interviews it has booked for them. Interview events are derived from
 * live bookings, so declining or cancelling removes them with no bookkeeping.
 */
export async function GET(req: Request) {
  try {
    const session = await requireRole('INTERVIEWER', 'ADMIN');
    const url = new URL(req.url);
    const source: CalendarSource = url.searchParams.get('source') === 'google' ? 'google' : 'mock';

    const me = await prisma.user.findUnique({ where: { id: session.id } });
    if (!me) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // A two-week window either side of now covers the whole demo dataset.
    const from = new Date(Date.now() - 7 * 86_400_000);
    const to = new Date(Date.now() + 21 * 86_400_000);

    const adapter = getCalendarAdapter();
    const calendarId = me.calendarId || me.email;
    const busy = await adapter.getBusy(calendarId, from, to);

    const events: CalendarEventDTO[] = busy.map((b, i) => ({
      id: `busy_${i}_${b.start.getTime()}`,
      title: 'Busy',
      startUtc: b.start.toISOString(),
      endUtc: b.end.toISOString(),
      kind: 'BUSY',
    }));

    // Confirmed interviews this person is still expected to attend.
    const assignments = await prisma.panelAssignment.findMany({
      where: { interviewerId: me.id, status: { notIn: ['DECLINED', 'REPLACED'] } },
      include: {
        request: {
          include: { candidate: true, bookings: { where: { status: 'CONFIRMED' } } },
        },
      },
    });

    for (const a of assignments) {
      for (const booking of a.request.bookings) {
        events.push({
          id: `cal_int_${booking.id}`,
          title: `Interview · ${a.request.candidate.name} (${a.request.jobTitle})`,
          startUtc: booking.startUtc.toISOString(),
          endUtc: booking.endUtc.toISOString(),
          kind: 'INTERVIEW',
        });
      }
    }

    events.sort((x, y) => Date.parse(x.startUtc) - Date.parse(y.startUtc));

    const googleReady = process.env.PROVIDER_MODE === 'google';
    const data: CalendarDTO = {
      source,
      // In mock mode the Google option still renders — the rows are the same,
      // only the transport is simulated. That is stated in the UI, not hidden.
      connected: source === 'mock' ? true : Boolean(calendarId),
      accountLabel:
        source === 'google'
          ? `${calendarId}${googleReady ? '' : ' (PROVIDER_MODE=mock — transport simulated)'}`
          : 'Seeded demo calendar',
      timezone: me.timezone,
      events,
    };

    return NextResponse.json<ApiOk<CalendarDTO>>({ ok: true, data });
  } catch (err: unknown) {
    const e = err as { name?: string; code?: string; message?: string };
    if (e?.name === 'AuthError') {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: (e.code ?? 'UNAUTHORIZED') as ApiErr['error']['code'], message: e.message ?? '' } },
        { status: e.code === 'UNAUTHORIZED' ? 401 : 403 }
      );
    }
    return NextResponse.json<ApiErr>(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
