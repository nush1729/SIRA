import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import prisma from '@/lib/db';
import { generateSlotsFromPool } from '@/lib/engine';
import { buildSchedulingContext } from '@/lib/scheduling-context';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    
    const request = await prisma.interviewRequest.findUnique({
      where: { id },
      include: {
        candidate: true,
        windows: true,
        panel: { include: { interviewer: true } }
      }
    });
    
    if (!request) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });

    // Pool-based (docs/12): schedule against every qualified interviewer, not
    // just whoever was pencilled in at creation. The engine picks who actually
    // runs each slot and reports it in slot.interviewerIds.
    const { config, candidate, pool } = await buildSchedulingContext(request);
    const slots = generateSlotsFromPool(config, candidate, pool, request.panelSize);

    return NextResponse.json({ ok: true, data: slots });
  } catch (err: any) {
    if (err.name === 'AuthError') return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: 401 });
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
