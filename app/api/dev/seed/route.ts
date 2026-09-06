import { NextResponse } from 'next/server';
import { runSeed } from '@/lib/seed';
import { SeedSummary } from '@/lib/contracts';

// ⚠️ KNOWN EXCEPTION: Left unauthenticated deliberately for demo convenience as per architecture doc.
export async function POST() {
  try {
    const result = await runSeed();
    return NextResponse.json<SeedSummary>(result as SeedSummary);
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to seed database' }, { status: 500 });
  }
}
