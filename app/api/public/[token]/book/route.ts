import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import prisma from '@/lib/db';
import { validateSlot } from '@/lib/engine';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { EngineParticipant, EngineConfig, ApiOk, ApiErr } from '@/lib/contracts';
import { sendNotification } from '@/lib/notify';
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
    if (!parsed.success) return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 });
    
    const { startUtc, endUtc } = parsed.data;

    const adapter = getCalendarAdapter();
    const participants: EngineParticipant[] = [];

    participants.push({
      id: request.candidate.id,
      name: request.candidate.name,
      role: 'candidate',
      timezone: request.candidate.timezone,
      availability: request.windows.map(w => ({ start: w.startUtc.toISOString(), end: w.endUtc.toISOString() })),
      busy: []
    });

    for (const p of request.panel) {
      const calId = p.interviewer.calendarId || p.interviewer.email;
      const busy = await adapter.getBusy(calId, request.windowStart, request.windowEnd);
      participants.push({
        id: p.interviewer.id,
        name: p.interviewer.name,
        role: 'interviewer',
        timezone: p.interviewer.timezone,
        availability: [], 
        busy: busy.map(b => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
        dailyLimit: p.interviewer.dailyLimit
      });
    }

    const config: EngineConfig = {
      durationMin: request.durationMin,
      bufferMin: 15,
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00",
      window: { start: request.windowStart.toISOString(), end: request.windowEnd.toISOString() }
    };

    const validation = validateSlot({ start: startUtc, end: endUtc }, config, participants);
    if (!validation.valid) {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: 'SLOT_NO_LONGER_VALID', message: validation.reasons.join(', ') } }, { status: 409 });
    }

    const bookingResult = await prisma.$transaction(async (tx) => {
      const currentReq = await tx.interviewRequest.findUnique({ where: { id } });
      if (currentReq?.status === 'SCHEDULED') {
        throw new Error('ALREADY_BOOKED');
      }

      await tx.booking.updateMany({
        where: { requestId: id, status: 'CONFIRMED' },
        data: { status: 'SUPERSEDED', activeKey: null }
      });

      const newBooking = await tx.booking.create({
        data: {
          requestId: id,
          startUtc: new Date(startUtc),
          endUtc: new Date(endUtc),
          status: 'CONFIRMED',
          activeKey: id
        }
      });

      await tx.interviewRequest.update({
        where: { id },
        data: { status: 'SCHEDULED' }
      });

      await tx.eventLog.create({
        data: { requestId: id, actor: 'candidate', action: 'BOOKED', detail: `Booked for ${startUtc}` }
      });

      return newBooking;
    });

    const attendees = [request.candidate.email, ...request.panel.map(p => p.interviewer.email)];
    
    const event = await adapter.createEvent({
      requestId: id,
      startUtc: new Date(startUtc),
      endUtc: new Date(endUtc),
      attendees,
      summary: `Interview: ${request.jobTitle} - ${request.candidate.name}`,
      description: `Interview via SIRA.`
    });

    await prisma.booking.update({
      where: { id: bookingResult.id },
      data: { eventId: event.eventId, meetLink: event.meetLink }
    });

    await sendNotification({
      requestId: id,
      toEmail: request.candidate.email,
      template: 'booking-confirmed',
      subject: `Interview Confirmed: ${request.jobTitle}`,
      body: `Your interview is confirmed for ${startUtc}. Meet link: ${event.meetLink}`
    });

    for (const p of request.panel) {
      await sendNotification({
        requestId: id,
        toEmail: p.interviewer.email,
        template: 'interviewer-booked',
        subject: `New Interview Panel Assignment: ${request.jobTitle}`,
        body: `You have been scheduled for an interview with ${request.candidate.name} at ${startUtc}. Meet link: ${event.meetLink}`
      });
    }

    return NextResponse.json<ApiOk<any>>({ ok: true, data: { id: bookingResult.id, startUtc, endUtc, status: 'CONFIRMED', meetLink: event.meetLink } });
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.message as any, message: 'Invalid or expired token' } }, { status: 401 });
    }
    if (err.message === 'ALREADY_BOOKED' || err.code === 'P2002') return NextResponse.json<ApiErr>({ ok: false, error: { code: 'ALREADY_BOOKED', message: 'Slot already booked' } }, { status: 409 });
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
