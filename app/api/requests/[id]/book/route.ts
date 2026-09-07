import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { generateSlotsFromPool } from '@/lib/engine';
import { buildSchedulingContext } from '@/lib/scheduling-context';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { reserveInterviewers, syncPanelToBooking, SlotTakenError } from '@/lib/booking';
import { sendNotification } from '@/lib/notify';
import { bookingConfirmed, interviewerAssigned } from '@/lib/email-templates';
import { z } from 'zod';

const bookSchema = z.object({
  startUtc: z.string().datetime(),
  endUtc: z.string().datetime(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('ADMIN');

    const { id } = await params;
    const body = await req.json();
    const parsed = bookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 });
    }

    const { startUtc, endUtc } = parsed.data;

    const request = await prisma.interviewRequest.findUnique({
      where: { id },
      include: { candidate: true, windows: true, panel: { include: { interviewer: true } } },
    });
    if (!request) {
      return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
    }

    /* -- Re-ask the engine, and take WHO from its answer -------------------
     * The client sends a time, never a person. Regenerating here also means a
     * slot that has gone stale since the page loaded is simply absent.        */
    const { config, candidate, pool } = await buildSchedulingContext(request);
    const fresh = generateSlotsFromPool(config, candidate, pool, request.panelSize);
    const slot = fresh.slots.find((s) => s.start === startUtc && s.end === endUtc);

    if (!slot) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'SLOT_NO_LONGER_VALID',
            message: 'That slot was just taken or is no longer valid. Refreshed options are available.',
          },
        },
        { status: 409 }
      );
    }

    const interviewerIds = slot.interviewerIds;
    const interviewers = await prisma.user.findMany({ where: { id: { in: interviewerIds } } });

    const bookingResult = await prisma.$transaction(async (tx) => {
      const currentReq = await tx.interviewRequest.findUnique({ where: { id } });
      if (currentReq?.status === 'CANCELLED') throw new Error('REQUEST_CANCELLED');
      // Deliberately NOT rejecting status === 'SCHEDULED' here: this route is also
      // how staff reschedule re-books a request that's already SCHEDULED, and the
      // supersede-old-booking step right below is exactly what's meant to handle
      // that. A real conflict (same interviewer/time already locked, including by
      // a concurrent request) is still caught atomically by reserveInterviewers()
      // below via the InterviewerTimeLock unique constraint.

      await tx.booking.updateMany({
        where: { requestId: id, status: 'CONFIRMED' },
        data: { status: 'SUPERSEDED', activeKey: null },
      });

      const newBooking = await tx.booking.create({
        data: {
          requestId: id,
          startUtc: new Date(startUtc),
          endUtc: new Date(endUtc),
          status: 'CONFIRMED',
          activeKey: id,
        },
      });

      // Assign + lock every 15-min cell. A cross-request clash fails here.
      await reserveInterviewers(tx, {
        bookingId: newBooking.id,
        interviewerIds,
        startUtc: new Date(startUtc),
        endUtc: new Date(endUtc),
      });

      await syncPanelToBooking(tx, {
        requestId: id,
        interviewerIds,
        reason: slot.reasons.join(' · '),
      });

      await tx.interviewRequest.update({ where: { id }, data: { status: 'SCHEDULED', blockedReason: null } });
      await tx.eventLog.create({
        data: {
          requestId: id,
          actor: 'system',
          action: 'BOOKED',
          detail: `Booked ${startUtc} with ${slot.interviewerNames.join(', ')}`,
        },
      });

      return newBooking;
    });

    // Outside the transaction: external side effects that must not roll it back.
    // The booking is already durably confirmed in our own DB at this point —
    // the scheduling decision, not the external Calendar sync, is the source
    // of truth. A Calendar/Meet failure here (e.g. a genuine Google API quota
    // exhaustion, not just a transient blip already retried inside the
    // adapter) must degrade to no Meet link, never fail the whole booking.
    const adapter = getCalendarAdapter();
    let event: { eventId: string | null; meetLink: string | null } = { eventId: null, meetLink: null };
    try {
      event = await adapter.createEvent({
        requestId: id,
        startUtc: new Date(startUtc),
        endUtc: new Date(endUtc),
        attendees: [request.candidate.email, ...interviewers.map((i) => i.email)],
        summary: `Interview: ${request.jobTitle} — ${request.candidate.name}`,
        description: `Interview arranged by SIRA.`,
        // Land the event on the assigned interviewer's own calendar — the same
        // one getBusy() reads from — not the master account's primary calendar.
        calendarId: interviewers[0]?.calendarId ?? undefined,
      });
    } catch (calendarErr) {
      console.error('[book] Calendar event creation failed — booking stays confirmed without a Meet link:', (calendarErr as Error).message);
    }

    await prisma.booking.update({
      where: { id: bookingResult.id },
      data: { eventId: event.eventId, meetLink: event.meetLink },
    });

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const mail = bookingConfirmed({
      candidateName: request.candidate.name,
      jobTitle: request.jobTitle,
      roundType: request.roundType,
      durationMin: request.durationMin,
      startUtc,
      endUtc,
      timezone: request.candidate.timezone,
      interviewerNames: slot.interviewerNames,
      meetLink: event.meetLink,
      rescheduleLink: `${baseUrl}/s/${request.token}/reschedule`,
      confirmedLink: `${baseUrl}/s/${request.token}/confirmed`,
    });
    await sendNotification({ requestId: id, toEmail: request.candidate.email, ...mail });

    for (const person of interviewers) {
      const note = interviewerAssigned({
        interviewerName: person.name,
        candidateName: request.candidate.name,
        jobTitle: request.jobTitle,
        roundType: request.roundType,
        startUtc,
        endUtc,
        timezone: person.timezone,
        meetLink: event.meetLink,
        consoleLink: `${baseUrl}/interviewer`,
      });
      await sendNotification({ requestId: id, toEmail: person.email, ...note });
    }

    return NextResponse.json({
      ok: true,
      data: { id: bookingResult.id, startUtc, endUtc, status: 'CONFIRMED', meetLink: event.meetLink },
    });
  } catch (err: unknown) {
    const e = err as { name?: string; code?: string; message?: string };
    if (e?.name === 'AuthError') {
      return NextResponse.json({ ok: false, error: { code: e.code, message: e.message } }, { status: e.code === 'UNAUTHORIZED' ? 401 : 403 });
    }
    if (err instanceof SlotTakenError || e?.message === 'ALREADY_BOOKED' || e?.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: { code: 'ALREADY_BOOKED', message: 'That interviewer was just booked for an overlapping time. Pick another slot.' } },
        { status: 409 }
      );
    }
    if (e?.message === 'REQUEST_CANCELLED') {
      return NextResponse.json(
        { ok: false, error: { code: 'REQUEST_CANCELLED', message: 'This interview request has been cancelled.' } },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
