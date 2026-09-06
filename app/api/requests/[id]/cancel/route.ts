import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { sendNotification } from '@/lib/notify';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("RECRUITER", "HIRING_MANAGER", "ADMIN");
    const { id } = await params;
    
    const request = await prisma.interviewRequest.findUnique({
      where: { id },
      include: { candidate: true, panel: { include: { interviewer: true } } }
    });
    if (!request) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });

    const booking = await prisma.booking.findFirst({
      where: { requestId: id, status: 'CONFIRMED' }
    });

    await prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: { requestId: id, status: 'CONFIRMED' },
        data: { status: 'CANCELLED', activeKey: null }
      });
      await tx.interviewRequest.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });
      await tx.eventLog.create({
        data: { requestId: id, actor: 'system', action: 'CANCELLED', detail: `Request cancelled` }
      });
    });

    if (booking?.eventId) {
      const adapter = getCalendarAdapter();
      await adapter.deleteEvent(booking.eventId);
    }

    await sendNotification({
      requestId: id,
      toEmail: request.candidate.email,
      template: 'cancelled',
      subject: `Interview Cancelled: ${request.jobTitle}`,
      body: `Your interview for ${request.jobTitle} has been cancelled.`
    });

    for (const p of request.panel) {
      await sendNotification({
        requestId: id,
        toEmail: p.interviewer.email,
        template: 'interviewer-cancelled',
        subject: `Interview Cancelled: ${request.jobTitle}`,
        body: `The interview with ${request.candidate.name} has been cancelled.`
      });
    }

    return NextResponse.json({ ok: true, data: {} });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: 401 });
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
