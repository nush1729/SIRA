import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import { refineWindowsFromPool } from '@/lib/engine';
import { buildSchedulingContext } from '@/lib/scheduling-context';
import { ApiOk, ApiErr, GenerateSlotsResult } from '@/lib/contracts';
import prisma from '@/lib/db';
import { sendNotification } from '@/lib/notify';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const request = await validateCandidateToken(token);
    
    // §6B, pool-aware: re-check the windows the candidate already gave against
    // every qualified interviewer, not only the one originally assigned.
    const { config, candidate, pool } = await buildSchedulingContext(request);
    const slotsResult = refineWindowsFromPool(
      candidate.availability,
      config,
      candidate,
      pool,
      request.panelSize
    );

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
