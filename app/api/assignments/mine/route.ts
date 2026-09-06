import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { AssignmentDTO, RoundType, ApiOk, ApiErr } from '@/lib/contracts';

export async function GET() {
  try {
    const session = await requireRole("INTERVIEWER", "HIRING_MANAGER");
    
    const assignments = await prisma.panelAssignment.findMany({
      where: { interviewerId: session.id },
      include: {
        request: { include: { candidate: true, bookings: { where: { status: 'CONFIRMED' } } } }
      }
    });

    const data: AssignmentDTO[] = assignments.map(a => {
      const booking = a.request.bookings[0];
      return {
        assignmentId: a.id,
        requestId: a.requestId,
        candidateName: a.request.candidate.name,
        jobTitle: a.request.jobTitle,
        roundType: a.request.roundType as RoundType,
        status: a.status as any,
        startUtc: booking ? booking.startUtc.toISOString() : null,
        endUtc: booking ? booking.endUtc.toISOString() : null,
        viewerTimezone: session.timezone
      };
    });

    return NextResponse.json<ApiOk<AssignmentDTO[]>>({ ok: true, data });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json<ApiErr>({ ok: false, error: { code: err.code, message: err.message } }, { status: 401 });
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
