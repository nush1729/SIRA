import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import prisma from '@/lib/db';
import { ApiOk, ApiErr } from '@/lib/contracts';
import { z } from 'zod';

const schema = z.object({
  windows: z.array(z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }))
    .min(1, 'At least one window is required')
    .max(30, 'Too many windows')
    .refine(
      (windows) => windows.every((w) => new Date(w.start).getTime() < new Date(w.end).getTime()),
      'Each window must start before it ends'
    ),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const request = await validateCandidateToken(token);

    // A confirmed or cancelled request's availability is not the candidate's
    // to rewrite — that would silently orphan a live Booking row (SCHEDULED)
    // or resurrect a dead one (CANCELLED) without anyone deciding to.
    if (request.status === 'SCHEDULED') {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: 'ALREADY_BOOKED', message: 'This interview is already scheduled.' } },
        { status: 409 }
      );
    }
    if (request.status === 'CANCELLED') {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: 'REQUEST_CANCELLED', message: 'This interview request has been cancelled.' } },
        { status: 409 }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      await tx.availabilityWindow.deleteMany({ where: { requestId: request.id } });
      
      await tx.availabilityWindow.createMany({
        data: parsed.data.windows.map(w => ({
          requestId: request.id,
          startUtc: new Date(w.start),
          endUtc: new Date(w.end)
        }))
      });

      await tx.interviewRequest.update({
        where: { id: request.id },
        data: { status: 'READY_TO_SCHEDULE' }
      });

      await tx.eventLog.create({
        data: { requestId: request.id, actor: 'candidate', action: 'AVAILABILITY_SUBMITTED', detail: 'Candidate submitted availability' }
      });
    });

    return NextResponse.json<ApiOk<Record<string, never>>>({ ok: true, data: {} });
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.message as any, message: 'Invalid or expired token' } }, { status: 401 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
