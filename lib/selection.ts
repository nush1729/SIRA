/**
 * Interviewer selection (#18) then load balancing (#20). Strict order — fairness
 * never overrides qualification. Implements docs/01_LOGIC_FLOW.md §3.
 */
import { SelectionCandidate, SelectionInput, SelectionResult, TimeWindow } from "./contracts";
import { sameLocalDay, withinWorkingHours } from "./tz";

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

function intersect(a: TimeWindow, b: TimeWindow): TimeWindow | null {
  const start = Math.max(Date.parse(a.start), Date.parse(b.start));
  const end = Math.min(Date.parse(a.end), Date.parse(b.end));
  if (start >= end) return null;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/**
 * Cheap existence check: is there ANY duration-sized gap for this interviewer,
 * inside `window`, that respects their own working hours and doesn't collide
 * with an existing busy block?
 *
 * Deliberately COARSE, in two ways:
 *  1. It does not apply the buffer. Docs §3 calls this "a cheap pre-check
 *     against calendar busy" — buffer-accurate validity is decided later, per
 *     slot, by `generateSlots`. Applying the buffer here would wrongly rule out
 *     an interviewer who has exactly one tight-but-real opening.
 *  2. It stops at the first gap it finds — it answers "is this person
 *     schedulable at all in this window," not "when."
 *
 * This runs BEFORE the candidate has submitted any availability (selection
 * happens at request-creation time, docs §1), so it can only reason about the
 * request's overall window, never the candidate's eventual specific windows.
 */
function hasAnyFreeTimeInWindow(candidate: SelectionCandidate, window: TimeWindow, durationMin: number, stepMin = 15): boolean {
  const durationMs = durationMin * 60_000;
  const stepMs = stepMin * 60_000;

  // If the interviewer has declared specific availability windows, search only
  // inside their intersection with the requested window; otherwise the whole
  // requested window is fair game (constrained by working hours + busy below).
  const searchRanges = candidate.availability.length
    ? candidate.availability.map((a) => intersect(a, window)).filter((w): w is TimeWindow => w !== null)
    : [window];

  for (const range of searchRanges) {
    const rangeStartMs = Date.parse(range.start);
    const rangeEndMs = Date.parse(range.end);

    for (let t = rangeStartMs; t + durationMs <= rangeEndMs; t += stepMs) {
      const slot: TimeWindow = { start: new Date(t).toISOString(), end: new Date(t + durationMs).toISOString() };
      if (!withinWorkingHours(slot, candidate.timezone) || !sameLocalDay(slot, candidate.timezone)) continue;
      if (candidate.busy.some((busy) => overlaps(slot, busy))) continue;
      return true;
    }
  }
  return false;
}

/**
 * A.3 — computes the round-type interviewer POOL. Implements docs/01_LOGIC_FLOW.md §3.
 *
 * Filters run in a STRICT order, and the order is the point:
 *   label matches round → has every required skill → has any free time in the
 *   window → under their daily cap → THEN sort by current load.
 *
 * Load balancing (#20) is the last step and operates only on people who already
 * passed every qualification filter, which is what makes "fairness never
 * overrides qualification" true by construction rather than by convention — an
 * idle but unqualified interviewer is gone before the sort ever runs.
 *
 * IMPORTANT — pool, not a binding assignment: `result.pool` is every qualified
 * interviewer (the whole TECHNICAL/MANAGERIAL/SCREENING/HR pool for this
 * round), ranked least-loaded first. `result.selected` is just its top
 * `panelSize`, shown to the recruiter as a preview at request-creation time —
 * it does NOT reserve those people. The actual assignment is decided per-slot,
 * later, by `generateSlotsFromPool` (scheduler.ts), which is what lets one
 * pool member being busy get covered by another instead of killing the slot.
 *
 * Everyone filtered out lands in `rejected[]` with a sentence a recruiter can
 * read. That array is a product feature (it drives the UI's "why wasn't X
 * picked" panel), not debug output — don't reword it at the call site.
 *
 * Note: people removed via `input.excludeIds` (i.e. a decliner being replaced)
 * are NOT added to `rejected[]` — they weren't considered and rejected, they
 * were never in the running.
 *
 * @throws if `durationMin` or `panelSize` is not positive — caller bug, not a
 *         valid "nobody qualifies" outcome.
 */
export function pickPanel(input: SelectionInput, pool: SelectionCandidate[]): SelectionResult {
  if (!(input.durationMin > 0) || !(input.panelSize > 0)) {
    throw new Error(`pickPanel: durationMin and panelSize must be positive (got durationMin=${input.durationMin}, panelSize=${input.panelSize}).`);
  }

  const rejected: SelectionResult["rejected"] = [];

  let working = input.excludeIds?.length ? pool.filter((c) => !input.excludeIds!.includes(c.id)) : pool;

  working = working.filter((c) => {
    if (!c.labels.includes(input.roundType)) {
      rejected.push({ id: c.id, name: c.name, reason: `no ${input.roundType} label` });
      return false;
    }
    return true;
  });

  working = working.filter((c) => {
    const missing = input.requiredSkills.filter((skill) => !c.skills.includes(skill));
    if (missing.length > 0) {
      rejected.push({ id: c.id, name: c.name, reason: `missing skill(s): ${missing.join(", ")}` });
      return false;
    }
    return true;
  });

  working = working.filter((c) => {
    if (!hasAnyFreeTimeInWindow(c, input.window, input.durationMin)) {
      rejected.push({ id: c.id, name: c.name, reason: "no working-hours overlap within the requested window" });
      return false;
    }
    return true;
  });

  working = working.filter((c) => {
    if (c.currentLoad >= c.dailyLimit) {
      rejected.push({ id: c.id, name: c.name, reason: `at daily cap ${c.currentLoad}/${c.dailyLimit}` });
      return false;
    }
    return true;
  });

  // Load balancing (#20) — only among the already-qualified. Fairness never
  // overrides qualification; this sort never runs on the rejected pool.
  const sorted = [...working].sort((a, b) => a.currentLoad - b.currentLoad || a.name.localeCompare(b.name));

  // `pool` = EVERY qualified interviewer, ranked least-loaded first — this is
  // the round-type pool (docs: "interviewers are pooled by round type") that
  // generateSlotsFromPool draws on. `selected` is just its top panelSize, kept
  // for the recruiter's request-creation preview — it is NOT a binding
  // assignment; the real per-slot assignment happens at booking time.
  const poolResult = sorted.map((c) => ({
    id: c.id,
    name: c.name,
    reason: `qualified · load ${c.currentLoad}/${c.dailyLimit}`,
    currentLoad: c.currentLoad,
    dailyLimit: c.dailyLimit,
  }));

  const selected = sorted.slice(0, input.panelSize).map((c) => ({
    id: c.id,
    name: c.name,
    reason: `selected · load ${c.currentLoad}/${c.dailyLimit}`,
  }));

  return { selected, pool: poolResult, rejected, insufficient: poolResult.length < input.panelSize };
}
