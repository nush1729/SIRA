/**
 * The core deterministic scheduling engine.
 *
 * Pure functions only: no DB, no network, no `Date.now()`. Everything this file
 * needs arrives as an argument, and everything it returns is plain data. That is
 * what makes it independently testable (see lib/__tests__/scheduler.test.ts) and
 * what makes it safe to say "no AI is in the correctness path" — there is no
 * seam here where anything but arithmetic decides validity.
 *
 * Implements docs/01_LOGIC_FLOW.md:
 *   §4 — slot generation + conflict detection (features #5, #6, #7, #16)
 *   §5 — ranking (feature #8)
 *   §7 — the re-check-immediately-before-booking step (`validateSlot`, feature #9)
 *
 * See docs/07_ROLE_A_ENGINE.md for the contract this file is written against.
 */
import {
  EngineConfig,
  EngineParticipant,
  GeneratedSlot,
  GenerateSlotsResult,
  RejectionReason,
  SLOT_STEP_MIN,
  TimeWindow,
} from "./contracts";
import { formatLocal, formatLocalTime, localDayKey, localMinutesOfDay, sameLocalDay, withinWorkingHours } from "./tz";

/** How many ranked slots `generateSlots` returns at most (docs §5: "top N (default 5)"). */
const TOP_N = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Scoring weights (docs §5) — named constants, not magic numbers, so the formula
// in the spec and the formula in the code can be read side by side. Change these
// here only; nothing else in the codebase should hardcode a scoring number.
// ─────────────────────────────────────────────────────────────────────────────

const SCORE_FIRST_CHOICE_WINDOW = 30; // slot falls inside the candidate's first-submitted window
const SCORE_EARLIEST_IN_RANGE_MAX = 20; // scaled by how early the slot is within the full candidate range
const SCORE_COMFORTABLE_HOURS = 15; // every participant's local time is 10:00-17:00
const SCORE_WORKLOAD_BALANCE_BASE = 10; // divided by (1 + avgPanelLoad) — lower-loaded panels score higher
const SCORE_EDGE_HOURS_PENALTY = -8; // any participant's local time is <09:30 or >17:00

const COMFORTABLE_HOURS_START_MIN = 10 * 60;
const COMFORTABLE_HOURS_END_MIN = 17 * 60;
const EDGE_HOURS_START_MIN = 9 * 60 + 30;
const EDGE_HOURS_END_MIN = 17 * 60;

// ─────────────────────────────────────────────────────────────────────────────
// Shared low-level helpers
// ─────────────────────────────────────────────────────────────────────────────

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

/** True when `inner` sits entirely inside `outer` (touching edges allowed). */
function contains(outer: TimeWindow, inner: TimeWindow): boolean {
  return Date.parse(inner.start) >= Date.parse(outer.start) && Date.parse(inner.end) <= Date.parse(outer.end);
}

/** Clips a window to the bounds of another, or null if they don't overlap. */
function intersect(a: TimeWindow, b: TimeWindow): TimeWindow | null {
  const start = Math.max(Date.parse(a.start), Date.parse(b.start));
  const end = Math.min(Date.parse(a.end), Date.parse(b.end));
  if (start >= end) return null;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/** Expands a window by `bufferMin` on both sides — a slot must not encroach on an
 * existing event even by the buffer margin (docs §4/§6). */
function withBuffer(w: TimeWindow, bufferMin: number): TimeWindow {
  const ms = bufferMin * 60_000;
  return {
    start: new Date(Date.parse(w.start) - ms).toISOString(),
    end: new Date(Date.parse(w.end) + ms).toISOString(),
  };
}

/**
 * How many of `existingBookings` fall on the same LOCAL calendar day as the slot,
 * in the participant's own timezone.
 *
 * CONTRACT ASSUMPTION (owned by whoever wires this to a database — see docs
 * §07_ROLE_A_ENGINE.md "What you can assume"): `existingBookings` is expected to
 * already be a reasonably scoped list (e.g. this interviewer's bookings within
 * the request's scheduling window), not their entire all-time booking history.
 * This function does not filter by recency itself — it only groups by local day.
 * Passing an unbounded history in would not break anything, but every booking in
 * it also feeds the workload-balance score in `scoreSlots` below, so an
 * unbounded list would silently skew ranking, not just the daily-cap check.
 */
function countBookingsOnLocalDay(existingBookings: TimeWindow[] | undefined, slotStartIso: string, tz: string): number {
  if (!existingBookings?.length) return 0;
  const dayKey = localDayKey(slotStartIso, tz);
  return existingBookings.filter((b) => localDayKey(b.start, tz) === dayKey).length;
}

/**
 * One participant's verdict on one candidate slot.
 *
 * Checks run in a fixed priority order — working hours, then calendar conflict,
 * then daily cap — and stop at the FIRST failing check. This is a deliberate
 * simplification: a participant who is both outside working hours and at their
 * daily cap for that slot will always be reported as "outside working hours,"
 * never "at daily cap," for that specific slot. That's fine for the product
 * (the UI only needs one true reason per rejected participant per slot), but it
 * means the aggregated `rejections[]` counts in `generateSlots` reflect the
 * FIRST blocking reason per participant per slot, not every reason that would
 * have applied. Worth knowing if the counts ever look lower than expected for a
 * less-common rejection cause.
 */
interface ParticipantVerdict {
  ok: boolean;
  /** Used in a valid slot's reasons[] — includes the local time, since it's shown next to one specific slot. */
  positiveReason?: string;
  /** Generic, time-free bucket key — this is what lets `rejections[]` aggregate meaningfully across many slots
   * instead of every rejection being unique because it embeds a different timestamp. */
  rejectionBucket?: string;
  /** Human sentence, includes local time — used by `validateSlot`, which reports on exactly one slot. */
  rejectionDetail?: string;
}

function evaluateParticipantAgainstSlot(
  participant: EngineParticipant,
  slot: TimeWindow,
  config: Pick<EngineConfig, "bufferMin" | "workingHoursStart" | "workingHoursEnd">
): ParticipantVerdict {
  // 1. Working hours + same local day, evaluated in the participant's OWN timezone (#16).
  //    A slot that would require the participant to be in two different local
  //    calendar days is rejected here too (sameLocalDay), not just for working hours.
  const inHours = withinWorkingHours(slot, participant.timezone, config.workingHoursStart, config.workingHoursEnd);
  const sameDay = sameLocalDay(slot, participant.timezone);
  if (!inHours || !sameDay) {
    return {
      ok: false,
      rejectionBucket: "outside working hours",
      rejectionDetail: `${participant.name}: outside working hours (${formatLocal(slot.start, participant.timezone)})`,
    };
  }

  // 2. Calendar conflict, expanded by the buffer on both sides (#5, #6). The slot
  //    itself is expanded, not the busy block — that's equivalent, but expanding
  //    the (usually single) slot under test is the cheaper direction.
  const buffered = withBuffer(slot, config.bufferMin);
  const conflicting = participant.busy.some((busy) => overlaps(buffered, busy));
  if (conflicting) {
    return {
      ok: false,
      rejectionBucket: `conflicts with existing event (incl. ${config.bufferMin}min buffer)`,
      rejectionDetail: `${participant.name}: conflicts with existing event (incl. ${config.bufferMin}min buffer)`,
    };
  }

  // 3. Daily cap, evaluated in the participant's own local day. Only applies to
  //    participants that declare a dailyLimit (candidates never do).
  if (participant.dailyLimit != null) {
    const loadThatDay = countBookingsOnLocalDay(participant.existingBookings, slot.start, participant.timezone);
    if (loadThatDay >= participant.dailyLimit) {
      return {
        ok: false,
        rejectionBucket: "at daily cap",
        rejectionDetail: `${participant.name}: at daily cap (${loadThatDay}/${participant.dailyLimit})`,
      };
    }
  }

  return { ok: true, positiveReason: `${participant.name} available ${formatLocalTime(slot.start, participant.timezone)}` };
}

/** Every required participant must pass for the slot to be valid. Returns the
 * full per-participant verdict list so callers can decide what to do with it —
 * `generateSlots` aggregates rejections across many slots; `validateSlot` just
 * reports on the one slot it was asked about. */
function evaluateSlot(
  slot: TimeWindow,
  config: Pick<EngineConfig, "bufferMin" | "workingHoursStart" | "workingHoursEnd">,
  participants: EngineParticipant[]
): { valid: boolean; perParticipant: { participant: EngineParticipant; verdict: ParticipantVerdict }[] } {
  const perParticipant = participants.map((participant) => ({
    participant,
    verdict: evaluateParticipantAgainstSlot(participant, slot, config),
  }));
  const valid = perParticipant.every((p) => p.verdict.ok);
  return { valid, perParticipant };
}

// ─────────────────────────────────────────────────────────────────────────────
// A.1 generateSlots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates every candidate-window time slot that satisfies every hard
 * constraint for every required participant, scores them, and returns the
 * top-ranked ones — or, if none survive, the aggregated reasons why.
 *
 * @param config    Duration/buffer/working-hours/step. `config.window` is not
 *                   read directly by this function — slots are generated from
 *                   the candidate participant's OWN `availability` windows
 *                   (docs §4: "for window in request.availabilityWindows").
 *                   `config.window` exists in the contract for callers (e.g.
 *                   `pickPanel`'s coarse eligibility check) that need an overall
 *                   scheduling range before candidate windows exist yet.
 * @param participants Must include exactly one participant with `role: "candidate"`
 *                   (their `availability` is the source of every candidate slot)
 *                   plus every interviewer who must attend. Panel members who
 *                   have declined must already be filtered OUT by the caller —
 *                   this function treats every participant it's given as required.
 *
 * @throws if `participants` contains no candidate, or if `durationMin`/`stepMin`
 *         is not a positive number — both are caller bugs, not valid scheduling
 *         outcomes, and failing loudly here is safer than silently returning an
 *         empty result (which would look identical to a legitimate "no overlap").
 */
export function generateSlots(config: EngineConfig, participants: EngineParticipant[]): GenerateSlotsResult {
  const candidate = participants.find((p) => p.role === "candidate");
  if (!candidate) {
    throw new Error("generateSlots: participants must include exactly one participant with role 'candidate'.");
  }

  const stepMin = config.stepMin ?? SLOT_STEP_MIN;
  if (!(config.durationMin > 0) || !(stepMin > 0)) {
    // A non-positive step would make the loop below never advance (infinite loop);
    // a non-positive duration is nonsensical. Both are misuse, not "zero slots."
    throw new Error(`generateSlots: durationMin and stepMin must be positive (got durationMin=${config.durationMin}, stepMin=${stepMin}).`);
  }

  const stepMs = stepMin * 60_000;
  const durationMs = config.durationMin * 60_000;

  // Candidate slots are only ever generated inside windows the candidate
  // actually submitted. No windows submitted yet means there is nothing to
  // generate against — that's a legitimate empty result (status AWAITING_AVAILABILITY),
  // not an error, so it falls through to the normal empty-result path below.
  //
  // Each candidate window is also CLIPPED to the request's own scheduling window
  // (`config.window`). The recruiter chose that date range; a candidate window
  // that runs past it (a UI bug, a stale submission, or a tampered request)
  // must not be able to schedule an interview outside the range the recruiter
  // actually asked for. Windows entirely outside the range drop out here.
  const sourceWindows = candidate.availability
    .map((w) => intersect(w, config.window))
    .filter((w): w is TimeWindow => w !== null);

  const candidates: { slot: TimeWindow; reasons: string[] }[] = [];
  const rejectionCounts = new Map<string, RejectionReason>();
  // Candidates may submit overlapping windows (e.g. "Mon 9-11" and "Mon 10-12"),
  // which would otherwise yield the SAME slot twice — duplicated in the ranked
  // list and double-counted in the rejection tallies. Track what we've already
  // evaluated and skip repeats.
  const seenSlotStarts = new Set<string>();

  for (const window of sourceWindows) {
    const windowStartMs = Date.parse(window.start);
    const windowEndMs = Date.parse(window.end);

    for (let t = windowStartMs; t + durationMs <= windowEndMs; t += stepMs) {
      const slot: TimeWindow = { start: new Date(t).toISOString(), end: new Date(t + durationMs).toISOString() };

      if (seenSlotStarts.has(slot.start)) continue;
      seenSlotStarts.add(slot.start);

      const { valid, perParticipant } = evaluateSlot(slot, config, participants);

      if (valid) {
        candidates.push({ slot, reasons: perParticipant.map((p) => p.verdict.positiveReason!) });
      } else {
        // Bucket rejections by (participant, generic reason) so the count is
        // meaningful — "Alex Rivera: at daily cap (12 slots)" tells a recruiter
        // something; twelve separate timestamped strings would not.
        for (const { participant, verdict } of perParticipant) {
          if (verdict.ok) continue;
          const key = `${participant.id}::${verdict.rejectionBucket}`;
          const existing = rejectionCounts.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            rejectionCounts.set(key, {
              participantId: participant.id,
              participantName: participant.name,
              reason: verdict.rejectionBucket!,
              count: 1,
            });
          }
        }
      }
    }
  }

  const scored = scoreSlots(candidates, participants, sourceWindows);
  const ranked = rankSlots(scored);

  const rejections = [...rejectionCounts.values()].sort((a, b) => b.count - a.count);

  return { slots: ranked, rejections };
}

// ─────────────────────────────────────────────────────────────────────────────
// A.2 validateSlot — re-check exactly one slot immediately before booking (§7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-runs the same hard-constraint checks as `generateSlots`, but for exactly
 * one already-chosen slot. This is what closes the "someone else booked in the
 * meantime" gap: `generateSlots` may have run minutes ago against calendar data
 * that has since changed, so the booking transaction must call this again,
 * inside the transaction, immediately before committing (docs §7 step 2).
 *
 * SECURITY NOTE — this function is the last line of defence on the booking
 * path, and it is reachable from an unauthenticated candidate token endpoint
 * (`POST /api/public/:token/book`). The start/end it receives come from a
 * request body, so they cannot be assumed to be one of the slots this engine
 * actually offered. It therefore re-checks THREE things that `generateSlots`
 * would have enforced implicitly by construction:
 *
 *   1. the slot's duration matches `config.durationMin` — otherwise a tampered
 *      request could book a 3-hour block for a 30-minute interview;
 *   2. the slot lies within the request's scheduling window (`config.window`);
 *   3. the slot lies inside one of the candidate's OWN submitted availability
 *      windows — candidate availability is a hard constraint (docs §4), and
 *      without this check a slot the candidate never offered would pass simply
 *      because nobody happened to be busy then.
 *
 * Only then does it run the same per-participant checks as generation.
 */
export function validateSlot(
  slot: TimeWindow,
  config: EngineConfig,
  participants: EngineParticipant[]
): { valid: boolean; reasons: string[] } {
  const candidate = participants.find((p) => p.role === "candidate");

  // 1. Duration must match what the interview was scheduled for.
  const actualMin = (Date.parse(slot.end) - Date.parse(slot.start)) / 60_000;
  if (actualMin !== config.durationMin) {
    return {
      valid: false,
      reasons: [`Slot length is ${actualMin} minutes but this interview requires ${config.durationMin} minutes.`],
    };
  }

  // 2. Must sit inside the request's own scheduling window.
  if (!contains(config.window, slot)) {
    return { valid: false, reasons: ["Slot falls outside the scheduling window requested for this interview."] };
  }

  // 3. Must sit inside availability the candidate actually offered.
  if (candidate) {
    if (candidate.availability.length === 0) {
      return { valid: false, reasons: [`${candidate.name} has not submitted any availability yet.`] };
    }
    const offered = candidate.availability.some((w) => contains(w, slot));
    if (!offered) {
      return {
        valid: false,
        reasons: [`${candidate.name} did not offer this time — it falls outside the availability they submitted.`],
      };
    }
  }

  const { valid, perParticipant } = evaluateSlot(slot, config, participants);
  if (valid) {
    return { valid: true, reasons: perParticipant.map((p) => p.verdict.positiveReason!) };
  }
  return {
    valid: false,
    reasons: perParticipant.filter((p) => !p.verdict.ok).map((p) => p.verdict.rejectionDetail!),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring + ranking (§5) — reorders valid slots only, never rescues an invalid one
// ─────────────────────────────────────────────────────────────────────────────

interface ScoredCandidate {
  slot: TimeWindow;
  reasons: string[];
  score: number;
}

/**
 * Scores every already-valid slot per docs §5. This function only ever
 * receives slots that already passed `evaluateSlot` — there is no code path by
 * which a score can make an invalid slot appear here.
 *
 * ASSUMPTION worth flagging to whoever builds the candidate-facing UI (D): the
 * "first choice window" bonus uses `candidateWindows[0]` — the first entry in
 * the array as submitted, not necessarily the chronologically earliest one. If
 * the UI always sends windows in the order the candidate selected them (their
 * actual top preference), this is correct as-is. If the UI instead always
 * sorts them chronologically before sending, then "first submitted" and
 * "chronologically earliest" happen to coincide and it's still correct — but
 * if some future change sends them in a different order (e.g. sorted by day
 * but not by which one the candidate picked first), this bonus would attach to
 * the wrong window. Flag this to D during integration if it isn't already true.
 */
function scoreSlots(
  valid: { slot: TimeWindow; reasons: string[] }[],
  participants: EngineParticipant[],
  candidateWindows: TimeWindow[]
): ScoredCandidate[] {
  if (valid.length === 0) return [];

  const firstChoiceWindow = candidateWindows[0];
  const rangeStart = Math.min(...candidateWindows.map((w) => Date.parse(w.start)));
  const rangeEnd = Math.max(...candidateWindows.map((w) => Date.parse(w.end)));
  const rangeSpan = Math.max(rangeEnd - rangeStart, 1); // guard against /0 when there's a single zero-length window

  // Workload-balance term: see the doc comment on countBookingsOnLocalDay above —
  // this assumes existingBookings is already scoped to something like "this
  // interviewer's bookings in the relevant window," not their entire history.
  const interviewers = participants.filter((p) => p.role === "interviewer");
  const avgPanelLoad =
    interviewers.length > 0
      ? interviewers.reduce((sum, p) => sum + (p.existingBookings?.length ?? 0), 0) / interviewers.length
      : 0;

  return valid.map(({ slot, reasons }) => {
    let score = 0;

    const withinFirstChoice =
      firstChoiceWindow != null &&
      Date.parse(slot.start) >= Date.parse(firstChoiceWindow.start) &&
      Date.parse(slot.end) <= Date.parse(firstChoiceWindow.end);
    if (withinFirstChoice) score += SCORE_FIRST_CHOICE_WINDOW;

    const position = (Date.parse(slot.start) - rangeStart) / rangeSpan;
    score += SCORE_EARLIEST_IN_RANGE_MAX * (1 - Math.min(Math.max(position, 0), 1));

    const allComfortable = participants.every((p) => {
      const minutes = localMinutesOfDay(slot.start, p.timezone);
      return minutes >= COMFORTABLE_HOURS_START_MIN && minutes <= COMFORTABLE_HOURS_END_MIN;
    });
    if (allComfortable) score += SCORE_COMFORTABLE_HOURS;

    score += SCORE_WORKLOAD_BALANCE_BASE / (1 + avgPanelLoad);

    const anyEdgeHours = participants.some((p) => {
      const minutes = localMinutesOfDay(slot.start, p.timezone);
      return minutes < EDGE_HOURS_START_MIN || minutes > EDGE_HOURS_END_MIN;
    });
    if (anyEdgeHours) score += SCORE_EDGE_HOURS_PENALTY;

    return { slot, reasons, score: Math.round(score * 100) / 100 };
  });
}

/**
 * Sorts by score descending, assigns sequential rank starting at 1, and trims
 * to the top `TOP_N`. Pure and side-effect-free — safe to call directly in
 * tests without going through the full `generateSlots` pipeline.
 */
export function rankSlots(scored: ScoredCandidate[]): GeneratedSlot[] {
  return [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N)
    .map((s, index) => ({ start: s.slot.start, end: s.slot.end, score: s.score, rank: index + 1, reasons: s.reasons }));
}
