import { NextResponse } from 'next/server';
import { requireRole, authErrorStatus } from '@/lib/auth';
import prisma from '@/lib/db';
import { processReschedule } from '@/lib/reschedule';
import { ApiOk, ApiErr, RescheduleOutcome } from '@/lib/contracts';
import { z } from 'zod';

const respondSchema = z.object({
  action: z.enum(['ACCEPT', 'DECLINE']),
  reason: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("INTERVIEWER", "ADMIN");
    const { id } = await params;
    
    const body = await req.json();
    const parsed = respondSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid action' } }, { status: 400 });

    const assignment = await prisma.panelAssignment.findUnique({ where: { id } });
    if (!assignment || assignment.interviewerId !== session.id) {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
    }

    if (parsed.data.action === 'ACCEPT') {
      await prisma.panelAssignment.update({
        where: { id },
        data: { status: 'ACCEPTED' }
      });
      // Return a shape similar to outcome just to satisfy frontend banner if needed, though strictly not a RescheduleOutcome
      return NextResponse.json({ ok: true, data: { outcome: 'ACCEPTED', message: 'Assignment accepted.' } });
    }

    // It's a DECLINE -> invoke reschedule
    await prisma.panelAssignment.update({
      where: { id },
      data: { status: 'DECLINED' }
    });

    const result = await processReschedule(assignment.requestId, session.id);
    return NextResponse.json<ApiOk<RescheduleOutcome>>({ ok: true, data: result });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json<ApiErr>({ ok: false, error: { code: err.code, message: err.message } }, { status: authErrorStatus(err.code) });
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
