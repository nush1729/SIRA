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
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const request = await validateCandidateToken(token);
    
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
