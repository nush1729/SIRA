import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { validateSlot } from '@/lib/engine';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { EngineParticipant, EngineConfig } from '@/lib/contracts';
import { sendNotification } from '@/lib/notify';
import { z } from 'zod';

const bookSchema = z.object({
  startUtc: z.string().datetime(),
  endUtc: z.string().datetime(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("RECRUITER", "HIRING_MANAGER", "ADMIN");
    
    const { id } = await params;
    const body = await req.json();
    const parsed = bookSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 });
    
    const { startUtc, endUtc } = parsed.data;
    
    const request = await prisma.interviewRequest.findUnique({
      where: { id },
      include: {
        candidate: true,
        windows: true,
        panel: { include: { interviewer: true } }
      }
    });
    if (!request) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });

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
      return NextResponse.json({ ok: false, error: { code: 'SLOT_NO_LONGER_VALID', message: validation.reasons.join(', ') } }, { status: 409 });
    }

    // TRANSACTION
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
        data: { requestId: id, actor: 'system', action: 'BOOKED', detail: `Booked for ${startUtc}` }
      });

      return newBooking;
    });

    // Outside TX: create calendar event + notify participants
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

    return NextResponse.json({ ok: true, data: { id: bookingResult.id, startUtc, endUtc, status: 'CONFIRMED', meetLink: event.meetLink } });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: 401 });
    if (err.message === 'ALREADY_BOOKED' || err.code === 'P2002') return NextResponse.json({ ok: false, error: { code: 'ALREADY_BOOKED', message: 'Slot already booked' } }, { status: 409 });
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
