import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiOk, ApiErr, SessionDTO } from '@/lib/contracts';

export async function GET() {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json<ApiErr>(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Not logged in' } },
      { status: 401 }
    );
  }

  return NextResponse.json<ApiOk<SessionDTO>>({ ok: true, data: session });
}
