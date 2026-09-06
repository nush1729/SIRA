import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import prisma from '@/lib/db';
import { generateSlotsFromPool } from '@/lib/engine';
import { buildSchedulingContext } from '@/lib/scheduling-context';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { reserveInterviewers, syncPanelToBooking, SlotTakenError } from '@/lib/booking';
import { ApiOk, ApiErr, BookingDTO } from '@/lib/contracts';
import { sendNotification } from '@/lib/notify';
import { bookingConfirmed, interviewerAssigned } from '@/lib/email-templates';
import { z } from 'zod';

const bookSchema = z.object({
  startUtc: z.string().datetime(),
  endUtc: z.string().datetime(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const request = await validateCandidateToken(token);
    const id = request.id;

    const body = await req.json();
    const parsed = bookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { startUtc, endUtc } = parsed.data;

    /* -- Re-ask the engine; the candidate sends a time, never a person ----- */
    const { config, candidate, pool } = await buildSchedulingContext(request);
    const fresh = generateSlotsFromPool(config, candidate, pool, request.panelSize);
    const slot = fresh.slots.find((s) => s.start === startUtc && s.end === endUtc);

    if (!slot) {
      return NextResponse.json<ApiErr>(
        {
          ok: false,
          error: {
            code: 'SLOT_NO_LONGER_VALID',
            message: 'That time was just taken. Here are your refreshed options.',
          },
        },
        { status: 409 }
      );
    }

    const interviewerIds = slot.interviewerIds;
    const interviewers = await prisma.user.findMany({ where: { id: { in: interviewerIds } } });

    const bookingResult = await prisma.$transaction(async (tx) => {
      const currentReq = await tx.interviewRequest.findUnique({ where: { id } });
      if (currentReq?.status === 'SCHEDULED') throw new Error('ALREADY_BOOKED');

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

      // Locks the 15-min cells; a cross-request clash fails the whole booking.
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

      await tx.interviewRequest.update({
        where: { id },
        data: { status: 'SCHEDULED', blockedReason: null },
      });
      await tx.eventLog.create({
        data: {
          requestId: id,
          actor: 'candidate',
          action: 'BOOKED',
          detail: `Candidate booked ${startUtc} with ${slot.interviewerNames.join(', ')}`,
        },
      });

      return newBooking;
    });

    const adapter = getCalendarAdapter();
    const event = await adapter.createEvent({
      requestId: id,
      startUtc: new Date(startUtc),
      endUtc: new Date(endUtc),
      attendees: [request.candidate.email, ...interviewers.map((i) => i.email)],
      summary: `Interview: ${request.jobTitle} — ${request.candidate.name}`,
      description: 'Interview arranged by SIRA.',
    });

    await prisma.booking.update({
      where: { id: bookingResult.id },
      data: { eventId: event.eventId, meetLink: event.meetLink },
    });

    await sendNotification({
      requestId: id,
      toEmail: request.candidate.email,
      ...bookingConfirmed({
        candidateName: request.candidate.name,
        jobTitle: request.jobTitle,
        roundType: request.roundType,
        durationMin: request.durationMin,
        startUtc,
        endUtc,
        timezone: request.candidate.timezone,
        interviewerNames: slot.interviewerNames,
        meetLink: event.meetLink,
      }),
    });

    for (const person of interviewers) {
      await sendNotification({
        requestId: id,
        toEmail: person.email,
        ...interviewerAssigned({
          interviewerName: person.name,
          candidateName: request.candidate.name,
          jobTitle: request.jobTitle,
          roundType: request.roundType,
          startUtc,
          endUtc,
          timezone: person.timezone,
          meetLink: event.meetLink,
        }),
      });
    }

    return NextResponse.json<ApiOk<BookingDTO>>({
      ok: true,
      data: { id: bookingResult.id, startUtc, endUtc, status: 'CONFIRMED', meetLink: event.meetLink },
    });
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string };
    if (e?.message === 'INVALID_TOKEN' || e?.message === 'TOKEN_EXPIRED') {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: e.message as 'INVALID_TOKEN' | 'TOKEN_EXPIRED', message: 'Invalid or expired token' } },
        { status: 401 }
      );
    }
    if (err instanceof SlotTakenError || e?.message === 'ALREADY_BOOKED' || e?.code === 'P2002') {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: 'ALREADY_BOOKED', message: 'That time was just taken. Please pick another.' } },
        { status: 409 }
      );
    }
    return NextResponse.json<ApiErr>(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } },
      { status: 500 }
    );
  }
}
