import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { ApiOk, ApiErr, SelectionResult, PreviewPanelBody, SelectionCandidate, RoundType } from '@/lib/contracts';
import { pickPanel } from '@/lib/engine';
import prisma from '@/lib/db';
import { z } from 'zod';

const previewSchema = z.object({
  roundType: z.enum(["SCREENING", "TECHNICAL", "MANAGERIAL", "HR"]),
  requiredSkills: z.array(z.string()),
  panelSize: z.number().int().positive(),
  window: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  durationMin: z.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    await requireRole("RECRUITER", "HIRING_MANAGER", "ADMIN");
    const body = await req.json();
    const parsed = previewSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 });
    }
    
    const data = parsed.data;

    const allUsers = await prisma.user.findMany({ where: { role: 'INTERVIEWER' } });
    const pool: SelectionCandidate[] = allUsers.map(u => ({
      id: u.id,
      name: u.name,
      timezone: u.timezone,
      labels: (u.labels ? u.labels.split(',') : []) as RoundType[],
      skills: u.skills ? u.skills.split(',') : [],
      dailyLimit: u.dailyLimit,
      currentLoad: 0,
      availability: [],
      busy: []
    }));

    const selection = pickPanel({
      roundType: data.roundType as RoundType,
      requiredSkills: data.requiredSkills,
      panelSize: data.panelSize,
      window: data.window,
      durationMin: data.durationMin
    }, pool);

    return NextResponse.json<ApiOk<SelectionResult>>({ ok: true, data: selection });
  } catch (err: any) {
    if (err.name === 'AuthError') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.code as any, message: err.message } }, { status: err.code === 'UNAUTHORIZED' ? 401 : 403 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
