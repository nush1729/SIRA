import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ApiOk, ApiErr, RequestListItemDTO, CreateRequestBody, SelectionCandidate, RoundType, RequestDetailDTO } from '@/lib/contracts';
import { pickPanel } from '@/lib/engine';
import { previewCurrentLoad } from '@/lib/scheduling-context';
import { fetchRequestDetail } from '@/lib/data-fetchers';
import { z } from 'zod';
import { randomBytes } from 'crypto';

const createSchema = z.object({
  candidateId: z.string().optional(),
  newCandidate: z.object({
    name: z.string(),
    email: z.string().email(),
    timezone: z.string(),
  }).optional(),
  jobTitle: z.string().min(1),
  roundType: z.enum(["SCREENING", "TECHNICAL", "MANAGERIAL", "HR"]),
  durationMin: z.number().int().positive(),
  requiredSkills: z.array(z.string()),
  panelSize: z.number().int().positive(),
  window: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  sendAvailabilityRequest: z.boolean(),
});

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN");
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const q = searchParams.get('q');

    const where: any = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { jobTitle: { contains: q } },
        { candidate: { name: { contains: q } } },
        { candidate: { email: { contains: q } } },
      ];
    }

    const requests = await prisma.interviewRequest.findMany({
      where,
      include: {
        candidate: true,
        bookings: {
          where: { status: 'CONFIRMED' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const data: RequestListItemDTO[] = requests.map(r => ({
      id: r.id,
      candidate: {
        id: r.candidate.id,
        name: r.candidate.name,
        email: r.candidate.email,
        timezone: r.candidate.timezone,
      },
      jobTitle: r.jobTitle,
      roundType: r.roundType as RoundType,
      durationMin: r.durationMin,
      status: r.status as any,
      blockedReason: r.blockedReason,
      booking: r.bookings[0] ? {
        id: r.bookings[0].id,
        startUtc: r.bookings[0].startUtc.toISOString(),
        endUtc: r.bookings[0].endUtc.toISOString(),
        status: r.bookings[0].status as any,
        meetLink: r.bookings[0].meetLink
      } : null
    }));

    return NextResponse.json<ApiOk<RequestListItemDTO[]>>({ ok: true, data });
  } catch (err: any) {
    if (err.name === 'AuthError') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.code as any, message: err.message } }, { status: err.code === 'UNAUTHORIZED' ? 401 : 403 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, { status: 400 });
    }
    
    const data = parsed.data;
    
    if (!data.candidateId && !data.newCandidate) {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Must provide candidateId or newCandidate' } }, { status: 400 });
    }

    // Pick panel
    const allUsers = await prisma.user.findMany({ where: { role: 'INTERVIEWER' } });
    const loadById = await previewCurrentLoad(data.window, allUsers.map((u) => u.id));
    const pool: SelectionCandidate[] = allUsers.map(u => ({
      id: u.id,
      name: u.name,
      timezone: u.timezone,
      labels: (u.labels ? u.labels.split(',') : []) as RoundType[],
      skills: u.skills ? u.skills.split(',') : [],
      dailyLimit: u.dailyLimit,
      currentLoad: loadById.get(u.id) ?? 0,
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

    if (selection.insufficient) {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: 'NO_ELIGIBLE_INTERVIEWERS', message: 'Not enough interviewers' } }, { status: 400 });
    }

    // Transaction
    const requestRecordId = await prisma.$transaction(async (tx) => {
      let candidateId = data.candidateId;
      if (!candidateId && data.newCandidate) {
        const c = await tx.candidate.create({ data: data.newCandidate });
        candidateId = c.id;
      }

      // CSPRNG — this token is the only auth on every candidate-facing endpoint.
      const generateToken = () => randomBytes(24).toString('base64url');

      const reqRecord = await tx.interviewRequest.create({
        data: {
          candidateId: candidateId!,
          jobTitle: data.jobTitle,
          roundType: data.roundType,
          durationMin: data.durationMin,
          requiredSkills: data.requiredSkills.join(','),
          panelSize: data.panelSize,
          windowStart: new Date(data.window.start),
          windowEnd: new Date(data.window.end),
          status: data.sendAvailabilityRequest ? 'AWAITING_AVAILABILITY' : 'DRAFT',
          token: generateToken(),
          tokenExpiresAt: new Date(new Date(data.window.end).getTime() + 7*24*60*60*1000)
        }
      });

      for (const p of selection.selected) {
        await tx.panelAssignment.create({
          data: {
            requestId: reqRecord.id,
            interviewerId: p.id,
            reason: p.reason
          }
        });
      }

      await tx.eventLog.create({
        data: {
          requestId: reqRecord.id,
          actor: 'system',
          action: 'REQUEST_CREATED',
          detail: `Request created for ${data.jobTitle}`
        }
      });

      return reqRecord.id;
    });

    // Send availability request email if the flag was set
    if (data.sendAvailabilityRequest) {
      const { sendNotification } = await import('@/lib/notify');
      const detail = await fetchRequestDetail(requestRecordId);
      if (detail) {
        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const candidateLink = `${baseUrl}${detail.candidateLink}`;
        await sendNotification({
          requestId: requestRecordId,
          toEmail: detail.candidate.email,
          template: 'availability-request',
          subject: `Interview request for ${data.jobTitle}`,
          body: `Please provide your availability for the ${data.jobTitle} interview at: <a href="${candidateLink}">${candidateLink}</a>`
        });
      }
    }

    const detail = await fetchRequestDetail(requestRecordId);
    if (!detail) throw new Error("Failed to fetch detail");

    return NextResponse.json<ApiOk<RequestDetailDTO>>({ ok: true, data: detail });
  } catch (err: any) {
    if (err.name === 'AuthError') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.code as any, message: err.message } }, { status: err.code === 'UNAUTHORIZED' ? 401 : 403 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: err.message } }, { status: 500 });
  }
}
