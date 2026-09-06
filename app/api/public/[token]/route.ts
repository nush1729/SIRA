import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import { PublicRequestDTO, RoundType, ReqStatus, ApiOk, ApiErr } from '@/lib/contracts';
import prisma from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const request = await validateCandidateToken(token);

    // The candidate is told who is arranging their interview. Scheduling is an
    // admin job now, so that's the admin — ordered by id for a stable answer.
    const recruiter = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { id: 'asc' },
    });
    const booking = request.bookings[0];
    
    const data: PublicRequestDTO = {
      candidateName: request.candidate.name,
      candidateTimezone: request.candidate.timezone,
      jobTitle: request.jobTitle,
      roundType: request.roundType as RoundType,
      durationMin: request.durationMin,
      status: request.status as ReqStatus,
      recruiterName: recruiter?.name || 'Recruiting Team',
      booking: booking ? {
        startUtc: booking.startUtc.toISOString(),
        endUtc: booking.endUtc.toISOString(),
        meetLink: booking.meetLink,
        interviewerNames: request.panel.map(p => p.interviewer.name)
      } : null
    };

    return NextResponse.json<ApiOk<PublicRequestDTO>>({ ok: true, data });
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.message as any, message: 'Invalid or expired token' } }, { status: 401 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
