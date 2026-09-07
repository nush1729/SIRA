import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
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

    const calendarId = me.calendarId || me.email;

    const { googleCredentialsPresent } = await import('@/lib/adapters/google');
    const googleReady = process.env.PROVIDER_MODE === 'google' && googleCredentialsPresent();

    let events: CalendarEventDTO[];
    if (source === 'google' && googleReady) {
      /* Real Google Calendar is the single source of truth here — one real
       * event -> one row, using ITS OWN title (createEvent() already names
       * ours "Interview: <job> — <candidate>"; seeded busy-blocks are named
       * "Lunch", "Standups", etc). Previously this also layered a second,
       * DB-derived "Interview · ..." row on top of a generic "Busy" row for
       * the exact same real event — the same booking showing up twice with
       * different labels. Reading real events directly (the OAuth scope
       * minted is the full read/write "calendar" scope, so this has always
       * been available) removes that duplication structurally. */
      const { listEvents } = await import('@/lib/adapters/google');
      const real = await listEvents(calendarId, from, to);
      events = real.map((e) => ({ id: e.id, title: e.title, startUtc: e.startUtc, endUtc: e.endUtc, kind: e.kind }));
    } else {
      // Mock mode, or the "Google Calendar" tab picked without real
      // credentials configured: simulate from our own DB, since there's no
      // real external calendar to read from.
      const rows = await prisma.calendarBusy.findMany({
        where: { calendarId, startUtc: { lt: to }, endUtc: { gt: from } },
      });
      events = rows.map((r) => ({
        id: r.id,
        title: r.title,
        startUtc: r.startUtc.toISOString(),
        endUtc: r.endUtc.toISOString(),
        kind: 'BUSY',
      }));

      // Confirmed interviews this person is still expected to attend — only
      // needed on the simulated path. The real-Google branch above already
      // gets this for free from the real event's own title.
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
    }

    events.sort((x, y) => Date.parse(x.startUtc) - Date.parse(y.startUtc));
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
