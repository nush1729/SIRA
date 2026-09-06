import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import { generateSlotsFromPool } from '@/lib/engine';
import { buildSchedulingContext } from '@/lib/scheduling-context';
import { ApiOk, ApiErr, GenerateSlotsResult } from '@/lib/contracts';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const request = await validateCandidateToken(token);
    
    // Pool-based (docs/12): every qualified interviewer is a candidate for the
    // slot; the engine names who actually runs each one.
    const { config, candidate, pool } = await buildSchedulingContext(request);
    const slots = generateSlotsFromPool(config, candidate, pool, request.panelSize);

    return NextResponse.json<ApiOk<GenerateSlotsResult>>({ ok: true, data: slots });
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.message as any, message: 'Invalid or expired token' } }, { status: 401 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
