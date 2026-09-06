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
  panel: { interviewerId: string; status: string }[];
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
 * A person who already declined THIS request must not be handed straight
 * back to it by the pool — pool-based selection otherwise has no memory of
 * per-request declines at all, since it re-derives eligibility from scratch
 * on every call.
 */
function declinedInterviewerIds(request: RequestRow): string[] {
  return request.panel.filter((p) => p.status === 'DECLINED').map((p) => p.interviewerId);
}

/**
 * `currentLoad` per interviewer, counting confirmed bookings INSIDE the
 * scheduling window. `dailyLimit` is a DAILY cap, so the honest scalar is the
 * person's load on their QUIETEST day in the window: if they are under cap on
 * any day, they belong in the pool, and the engine then rejects the specific
 * days where they are full. Taking the total instead capped Alex across a
 * whole week for two Monday bookings (see docs/04 §2's S3 scenario).
 *
 * Shared by `buildPool` (load feeds ranking/cap) and `buildReplacementPool`
 * (same-time replacement needs the same honest number, not a hardcoded 0).
 */
async function computeCurrentLoad(
  request: RequestRow,
  interviewerIds: string[]
): Promise<Map<string, number>> {
  const booked = await prisma.bookingAssignment.findMany({
    where: {
      interviewerId: { in: interviewerIds },
      booking: {
        status: 'CONFIRMED',
        startUtc: { gte: request.windowStart, lt: request.windowEnd },
        requestId: { not: request.id },
      },
    },
    include: { booking: true },
  });
  const bookingStarts = new Map(booked.map((b) => [b.bookingId, b.booking.startUtc]));

  // Older bookings predate BookingAssignment (seeded, or booked before this
  // release), so fall back to the panel for those.
  const legacy = await prisma.panelAssignment.findMany({
    where: {
      interviewerId: { in: interviewerIds },
      requestId: { not: request.id },
      status: { not: 'DECLINED' },
      request: {
        bookings: {
          some: {
            status: 'CONFIRMED',
            startUtc: { gte: request.windowStart, lt: request.windowEnd },
          },
        },
      },
    },
    include: { request: { include: { bookings: { where: { status: 'CONFIRMED' } } } } },
  });
  const alreadyCounted = new Set(booked.map((b) => `${b.interviewerId}:${b.bookingId}`));
  const legacyStarts = legacy.flatMap((a) =>
    a.request.bookings
      .filter((b) => !alreadyCounted.has(`${a.interviewerId}:${b.id}`))
      .map((b) => ({ interviewerId: a.interviewerId, startUtc: b.startUtc }))
  );

  const bookingsById = new Map<string, Date[]>();
  const push = (id: string, when: Date) => bookingsById.set(id, [...(bookingsById.get(id) ?? []), when]);
  booked.forEach((b) => push(b.interviewerId, bookingStarts.get(b.bookingId) as Date));
  legacyStarts.forEach(({ interviewerId, startUtc }) => push(interviewerId, startUtc));

  const windowDays: string[] = [];
  for (let t = request.windowStart.getTime(); t < request.windowEnd.getTime(); t += 86_400_000) {
    windowDays.push(new Date(t).toISOString().slice(0, 10));
  }

  const loadFor = (id: string) => {
    const days = bookingsById.get(id) ?? [];
    if (!windowDays.length) return days.length;
    const perDay = windowDays.map((d) => days.filter((x) => x.toISOString().slice(0, 10) === d).length);
    return Math.min(...perDay);
  };

  return new Map(interviewerIds.map((id) => [id, loadFor(id)]));
}

/**
 * An interviewer's own confirmed interviews (from any OTHER request) are busy
 * time. Without this the engine happily proposes a slot the booking guard
 * will then refuse — the calendar adapter only knows about CalendarBusy rows
 * / real Google free-busy, not about what SIRA itself has booked.
 *
 * Returns a lookup, not a per-user query, so the caller can call it once per
 * interviewer without N+1'ing `Booking`.
 */
async function heldBookingsLookup(request: RequestRow): Promise<(userId: string) => { start: string; end: string }[]> {
  const heldBookings = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      requestId: { not: request.id },
      startUtc: { lt: request.windowEnd },
      endUtc: { gt: request.windowStart },
    },
    include: { assignedInterviewers: true, request: { include: { panel: true } } },
  });

  return (userId: string) =>
    heldBookings
      .filter(
        (b) =>
          b.assignedInterviewers.some((a) => a.interviewerId === userId) ||
          // Seeded/legacy bookings have no BookingAssignment row yet.
          (b.assignedInterviewers.length === 0 &&
            b.request.panel.some((p) => p.interviewerId === userId && p.status !== 'DECLINED'))
      )
      .map((b) => ({ start: b.startUtc.toISOString(), end: b.endUtc.toISOString() }));
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
  const interviewerIds = interviewers.map((u) => u.id);

  const loadById = await computeCurrentLoad(request, interviewerIds);

  const candidates: SelectionCandidate[] = interviewers.map((u) => ({
    id: u.id,
    name: u.name,
    timezone: u.timezone,
    labels: csv(u.labels) as RoundType[],
    skills: csv(u.skills),
    dailyLimit: u.dailyLimit,
    currentLoad: loadById.get(u.id) ?? 0,
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
      excludeIds: declinedInterviewerIds(request),
    },
    candidates
  );

  const bookedTimesFor = await heldBookingsLookup(request);
  const byId = new Map(interviewers.map((u) => [u.id, u]));
  const pool: EngineParticipant[] = [];

  for (const member of selection.pool) {
    const user = byId.get(member.id);
    if (!user) continue;
    const calendarBusy = await adapter.getBusy(
      user.calendarId || user.email,
      request.windowStart,
      request.windowEnd
    );
    const busy = [
      ...calendarBusy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
      ...bookedTimesFor(user.id),
    ];
    pool.push({
      id: user.id,
      name: user.name,
      role: 'interviewer',
      timezone: user.timezone,
      availability: [],
      busy,
      dailyLimit: user.dailyLimit,
      // Pool members are interchangeable — that's the whole point of docs/12.
      isRequired: false,
      currentLoad: member.currentLoad,
    });
  }

  return pool;
}

/**
 * Every interviewer as a `SelectionCandidate` with REAL `busy` populated —
 * for `findSameTimeReplacement` (lib/reschedule-core.ts), which filters on
 * `busy` directly rather than through `pickPanel`'s coarse window check.
 * `buildPool`'s `SelectionCandidate`s deliberately leave `busy: []` because
 * `pickPanel` never reads it; this is the one caller that does, so unlike
 * `buildPool` the calendar fetch has to happen for every candidate BEFORE
 * filtering, not only for the ones `pickPanel` already selected.
 */
export async function buildReplacementCandidates(
  request: RequestRow,
  excludeIds: string[] = []
): Promise<SelectionCandidate[]> {
  const adapter = getCalendarAdapter();
  const interviewers = await prisma.user.findMany({
    where: { role: 'INTERVIEWER', id: { notIn: [...declinedInterviewerIds(request), ...excludeIds] } },
  });
  const interviewerIds = interviewers.map((u) => u.id);

  const [loadById, bookedTimesFor] = await Promise.all([
    computeCurrentLoad(request, interviewerIds),
    heldBookingsLookup(request),
  ]);

  const out: SelectionCandidate[] = [];
  for (const u of interviewers) {
    const calendarBusy = await adapter.getBusy(u.calendarId || u.email, request.windowStart, request.windowEnd);
    out.push({
      id: u.id,
      name: u.name,
      timezone: u.timezone,
      labels: csv(u.labels) as RoundType[],
      skills: csv(u.skills),
      dailyLimit: u.dailyLimit,
      currentLoad: loadById.get(u.id) ?? 0,
      availability: [],
      busy: [
        ...calendarBusy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
        ...bookedTimesFor(u.id),
      ],
    });
  }
  return out;
}

/** Candidate + pool + config in one call, for the slot-producing routes. */
export async function buildSchedulingContext(request: RequestRow) {
  const [pool] = await Promise.all([buildPool(request)]);
  return { config: buildConfig(request), candidate: buildCandidate(request), pool };
}
