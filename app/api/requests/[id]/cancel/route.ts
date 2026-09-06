import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { sendNotification } from '@/lib/notify';
import { releaseInterviewers } from '@/lib/booking';
import { interviewCancelled } from '@/lib/email-templates';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
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
      // Free the 15-min cells this booking held, or the interviewer looks busy
      // for a slot that no longer exists.
      if (booking) await releaseInterviewers(tx, booking.id);
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

    const startUtc = (booking?.startUtc ?? new Date()).toISOString();
    await sendNotification({
      requestId: id,
      toEmail: request.candidate.email,
      ...interviewCancelled({
        name: request.candidate.name,
        jobTitle: request.jobTitle,
        startUtc,
        timezone: request.candidate.timezone,
      }),
    });

    for (const p of request.panel) {
      await sendNotification({
        requestId: id,
        toEmail: p.interviewer.email,
        ...interviewCancelled({
          name: p.interviewer.name,
          jobTitle: `${request.jobTitle} — ${request.candidate.name}`,
          startUtc,
          timezone: p.interviewer.timezone,
        }),
      });
    }

    return NextResponse.json({ ok: true, data: {} });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: 401 });
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
