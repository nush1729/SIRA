import { NextResponse } from 'next/server';
import { runSeed } from '@/lib/seed';
import { SeedSummary } from '@/lib/contracts';
import { requireRole, AuthError } from '@/lib/auth';

/**
 * Destructive (wipes 9 tables) — requires an ADMIN session. No UI button
 * calls this today; it exists for scripted demo resets. GET below stays
 * unauthenticated on purpose (the landing page reads it pre-login), but
 * the destructive verb must not be.
 */
export async function POST() {
  try {
    await requireRole('ADMIN');
    const result = await runSeed();
    return NextResponse.json<SeedSummary>(result as SeedSummary);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.code === 'UNAUTHORIZED' ? 401 : 403 }
      );
    }
    console.error('Seed error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to seed database' }, { status: 500 });
  }
}

/**
 * GET — the CURRENT seed summary, without reseeding (docs/04 §4).
 * Read-only, so it is safe to call from a page; the landing page uses it to
 * link at the live candidate tokens instead of hard-coded fixture ones.
 */
export async function GET() {
  try {
    const prisma = (await import('@/lib/db')).default;
    const [users, candidates, requests, bookings, notifications] = await Promise.all([
      prisma.user.count(),
      prisma.candidate.count(),
      prisma.interviewRequest.count(),
      prisma.booking.count(),
      prisma.notification.count(),
    ]);

    const rows = await prisma.interviewRequest.findMany({
      include: { candidate: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      ok: true,
      counts: { users, candidates, requests, bookings, notifications },
      candidateLinks: rows
        // The load-balancing filler requests are not demo scenarios.
        .filter((r) => !r.candidate.name.startsWith('Prior Candidate'))
        .map((r) => ({ name: r.candidate.name, scenario: r.status, url: `/s/${r.token}` })),
      logins: (await prisma.user.findMany({ select: { email: true, role: true } })).map((u) => ({
        ...u,
        password: 'demo1234',
      })),
    });
  } catch (error) {
    console.error('Seed summary error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to read seed summary' }, { status: 500 });
  }
}
