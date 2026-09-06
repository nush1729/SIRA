import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import { generateSlots } from '@/lib/engine';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { EngineParticipant, EngineConfig, ApiOk, ApiErr, GenerateSlotsResult } from '@/lib/contracts';
import prisma from '@/lib/db';
import { sendNotification } from '@/lib/notify';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const request = await validateCandidateToken(token);
    
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

    const slotsResult = generateSlots(config, participants);

    if (slotsResult.slots.length === 0 && request.status !== 'RESCHEDULE_REQUIRED') {
      await prisma.$transaction(async (tx) => {
        await tx.interviewRequest.update({
          where: { id: request.id },
          data: { status: 'RESCHEDULE_REQUIRED', blockedReason: 'No slots available from previously submitted windows.' }
        });
        await tx.eventLog.create({
          data: { requestId: request.id, actor: 'system', action: 'RESCHEDULE_REQUIRED', detail: `Candidate reschedule-slots found 0 valid slots.` }
        });
      });

      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      await sendNotification({
        requestId: request.id,
        toEmail: request.candidate.email,
        template: 'reschedule-request',
        subject: `Action Required: New Times Needed for ${request.jobTitle}`,
        body: `Unfortunately, none of the times you previously provided work for the interviewers anymore. Please provide new times: <a href="${baseUrl}/s/${request.token}">${baseUrl}/s/${request.token}</a>`
      });
    }

    return NextResponse.json<ApiOk<GenerateSlotsResult>>({ ok: true, data: slotsResult });
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.message as any, message: 'Invalid or expired token' } }, { status: 401 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
