import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { processReschedule } from '@/lib/reschedule';
import { ApiOk, ApiErr, RescheduleOutcome } from '@/lib/contracts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("RECRUITER", "HIRING_MANAGER", "ADMIN");
    const { id } = await params;
    
    const result = await processReschedule(id); 
    return NextResponse.json<ApiOk<RescheduleOutcome>>({ ok: true, data: result });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json<ApiErr>({ ok: false, error: { code: err.code, message: err.message } }, { status: 401 });
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
