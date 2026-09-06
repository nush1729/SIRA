/**
 * ============================================================================
 *  Shared scheduling context (Role B surface, added at integration).
 *
 *  Every route that asks the engine for slots needs the same three things:
 *  the candidate, the POOL of interchangeable interviewers, and the config.
 *  Before pool-based assignment (docs/12) each route built only the
 *  pre-assigned panel, which is exactly the bug A fixed — a qualified
 *  colleague being free was invisible to the engine.
 *
 *  Eligibility is decided by A's `pickPanel`, not re-implemented here.
 * ============================================================================
 */

import prisma from '@/lib/db';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { pickPanel } from '@/lib/engine';
import {
  BUFFER_MIN,
  WORKING_HOURS_END,
  WORKING_HOURS_START,
  type EngineConfig,
  type EngineParticipant,
  type RoundType,
  type SelectionCandidate,
} from '@/lib/contracts';

const csv = (v: string | null | undefined): string[] =>
  v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [];

type RequestRow = {
  id: string;
  roundType: string;
  durationMin: number;
  panelSize: number;
  requiredSkills: string | null;
  windowStart: Date;
  windowEnd: Date;
  candidate: { id: string; name: string; timezone: string };
  windows: { startUtc: Date; endUtc: Date }[];
};

export function buildConfig(request: RequestRow): EngineConfig {
  return {
    durationMin: request.durationMin,
    bufferMin: BUFFER_MIN,
    workingHoursStart: WORKING_HOURS_START,
    workingHoursEnd: WORKING_HOURS_END,
    window: {
      start: request.windowStart.toISOString(),
      end: request.windowEnd.toISOString(),
    },
  };
}

export function buildCandidate(request: RequestRow): EngineParticipant {
  return {
    id: request.candidate.id,
    name: request.candidate.name,
    role: 'candidate',
    timezone: request.candidate.timezone,
    availability: request.windows.map((w) => ({
      start: w.startUtc.toISOString(),
      end: w.endUtc.toISOString(),
    })),
    busy: [],
  };
}

/**
 * Everyone qualified to run this round, as engine participants.
 *
 * Qualification (label + skills + cap) comes from `pickPanel`, so the pool the
 * engine schedules against is exactly the pool the eligibility panel shows the
 * admin. `currentLoad` is the interviewer's confirmed bookings in the window,
 * which is what lets the engine prefer the least-loaded free person.
 */
export async function buildPool(request: RequestRow): Promise<EngineParticipant[]> {
  const adapter = getCalendarAdapter();
  const interviewers = await prisma.user.findMany({ where: { role: 'INTERVIEWER' } });

  // Confirmed bookings per interviewer inside the window — the load signal.
  const assignments = await prisma.panelAssignment.findMany({
    where: {
      interviewerId: { in: interviewers.map((u) => u.id) },
      request: { bookings: { some: { status: 'CONFIRMED' } } },
    },
    include: { request: { include: { bookings: { where: { status: 'CONFIRMED' } } } } },
  });

  const loadFor = (id: string) =>
    assignments.filter((a) => a.interviewerId === id && a.requestId !== request.id).length;

  const candidates: SelectionCandidate[] = interviewers.map((u) => ({
    id: u.id,
    name: u.name,
    timezone: u.timezone,
    labels: csv(u.labels) as RoundType[],
    skills: csv(u.skills),
    dailyLimit: u.dailyLimit,
    currentLoad: loadFor(u.id),
    availability: [],
    busy: [],
  }));

  const selection = pickPanel(
    {
      roundType: request.roundType as RoundType,
      requiredSkills: csv(request.requiredSkills),
      panelSize: request.panelSize,
      window: { start: request.windowStart.toISOString(), end: request.windowEnd.toISOString() },
      durationMin: request.durationMin,
    },
    candidates
  );

  const byId = new Map(interviewers.map((u) => [u.id, u]));
  const pool: EngineParticipant[] = [];

  for (const member of selection.pool) {
    const user = byId.get(member.id);
    if (!user) continue;
    const busy = await adapter.getBusy(
      user.calendarId || user.email,
      request.windowStart,
      request.windowEnd
    );
    pool.push({
      id: user.id,
      name: user.name,
      role: 'interviewer',
      timezone: user.timezone,
      availability: [],
      busy: busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
      dailyLimit: user.dailyLimit,
      // Pool members are interchangeable — that's the whole point of docs/12.
      isRequired: false,
      currentLoad: member.currentLoad,
    });
  }

  return pool;
}

/** Candidate + pool + config in one call, for the slot-producing routes. */
export async function buildSchedulingContext(request: RequestRow) {
  const [pool] = await Promise.all([buildPool(request)]);
  return { config: buildConfig(request), candidate: buildCandidate(request), pool };
}
