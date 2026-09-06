import { NextResponse } from 'next/server';
import { requireRole, authErrorStatus } from '@/lib/auth';
import prisma from '@/lib/db';
import { sendNotification } from '@/lib/notify';
import { availabilityRequest } from '@/lib/email-templates';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    
    const request = await prisma.interviewRequest.findUnique({ where: { id }, include: { candidate: true } });
    if (!request) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } }, { status: 404 });

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const candidateLink = `${baseUrl}/s/${request.token}`;

    await prisma.interviewRequest.update({
      where: { id },
      data: { status: 'AWAITING_AVAILABILITY' }
    });

    await prisma.eventLog.create({
      data: {
        requestId: id,
        actor: 'system',
        action: 'AVAILABILITY_REQUEST_SENT',
        detail: `Sent availability request to ${request.candidate.email}`
      }
    });

    await sendNotification({
      requestId: id,
      toEmail: request.candidate.email,
      ...availabilityRequest({
        candidateName: request.candidate.name,
        jobTitle: request.jobTitle,
        roundType: request.roundType,
        durationMin: request.durationMin,
        timezone: request.candidate.timezone,
        link: candidateLink,
        expiresAt: request.tokenExpiresAt,
      }),
    });

    return NextResponse.json({ ok: true, data: { candidateLink } });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: authErrorStatus(err.code) });
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
