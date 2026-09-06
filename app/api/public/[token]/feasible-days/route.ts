import { NextResponse } from 'next/server';
import { validateCandidateToken } from '@/lib/token-auth';
import { computeFeasibleDays } from '@/lib/engine';
import { buildSchedulingContext } from '@/lib/scheduling-context';
import { ApiOk, ApiErr, FeasibleDaysResult } from '@/lib/contracts';

/**
 * GET /api/public/:token/feasible-days  →  FeasibleDaysResult
 *
 * Which calendar days could actually hold this interview, in the CANDIDATE'S
 * timezone. The day picker greys out everything else and can say why, instead
 * of letting someone choose a day that was never going to work.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const request = await validateCandidateToken(token);

    const { config, candidate, pool } = await buildSchedulingContext(request);
    const result = computeFeasibleDays(config, candidate.timezone, pool, request.panelSize);

    return NextResponse.json<ApiOk<FeasibleDaysResult>>({ ok: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'INVALID_TOKEN' || message === 'TOKEN_EXPIRED') {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: message, message: 'Invalid or expired token' } },
        { status: 401 }
      );
    }
    return NextResponse.json<ApiErr>(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } },
      { status: 500 }
    );
  }
}
