import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';
import { ApiOk } from '@/lib/contracts';

export async function POST() {
  await clearSession();
  return NextResponse.json<ApiOk<Record<string, never>>>({ ok: true, data: {} });
}
