import { NextResponse } from 'next/server';
import { requireRole, authErrorStatus } from '@/lib/auth';
import { processReschedule } from '@/lib/reschedule';
import { ApiOk, ApiErr, RescheduleOutcome } from '@/lib/contracts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    
    const result = await processReschedule(id); 
    return NextResponse.json<ApiOk<RescheduleOutcome>>({ ok: true, data: result });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json<ApiErr>({ ok: false, error: { code: err.code, message: err.message } }, { status: authErrorStatus(err.code) });
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
