import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import { generateSlots } from '@/lib/engine';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { EngineParticipant, EngineConfig, ApiOk, ApiErr, GenerateSlotsResult } from '@/lib/contracts';

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

    const slots = generateSlots(config, participants);

    return NextResponse.json<ApiOk<GenerateSlotsResult>>({ ok: true, data: slots });
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.message as any, message: 'Invalid or expired token' } }, { status: 401 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
