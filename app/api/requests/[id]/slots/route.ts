import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { generateSlots } from '@/lib/engine';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { EngineParticipant, EngineConfig } from '@/lib/contracts';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("RECRUITER", "HIRING_MANAGER", "ADMIN");
    const { id } = await params;
    
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

    // Candidate
    participants.push({
      id: request.candidate.id,
      name: request.candidate.name,
      role: 'candidate',
      timezone: request.candidate.timezone,
      availability: request.windows.map(w => ({ start: w.startUtc.toISOString(), end: w.endUtc.toISOString() })),
      busy: []
    });

    // Interviewers
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

    return NextResponse.json({ ok: true, data: slots });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: 401 });
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
