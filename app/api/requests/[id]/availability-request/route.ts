import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { sendNotification } from '@/lib/notify';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("RECRUITER", "HIRING_MANAGER", "ADMIN");
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
      template: 'availability-request',
      subject: `Interview request for ${request.jobTitle}`,
      body: `Please provide your availability for the ${request.jobTitle} interview at: <a href="${candidateLink}">${candidateLink}</a>`
    });

    return NextResponse.json({ ok: true, data: { candidateLink } });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: 401 });
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
