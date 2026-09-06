/**
 * Pure decision helpers backing docs/01_LOGIC_FLOW.md §6. B does the DB reads/writes
 * and emails around these; this file only ever answers "is there a same-time
 * replacement" and "which of the candidate's own windows still work."
 */
import { BUFFER_MIN, EngineConfig, EngineParticipant, GenerateSlotsResult, SelectionCandidate, SelectionInput, SelectionResult, TimeWindow } from "./contracts";
import { sameLocalDay, withinWorkingHours } from "./tz";
import { generateSlots } from "./scheduler";

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

function withBuffer(w: TimeWindow, bufferMin: number): TimeWindow {
  const ms = bufferMin * 60_000;
  return { start: new Date(Date.parse(w.start) - ms).toISOString(), end: new Date(Date.parse(w.end) + ms).toISOString() };
}

/**
 * §6A step 1 — find a replacement for a decliner WITHOUT moving the booked time.
 *
 * This is the branch that protects the candidate's calendar: if it succeeds,
 * the interview stays exactly where it was and the candidate is only told that
 * their interviewer changed. Only when this returns `insufficient: true` does
 * the caller fall through to §6A step 2 (re-run `pickPanel` + `generateSlots`
 * and actually move the interview).
 *
 * Same qualification rules as `pickPanel` (label → skills → daily cap), but the
 * availability test is different and deliberately STRICTER: instead of "has any
 * free time somewhere in the window," it asks "is this exact booked slot free
 * for them, including the buffer, inside their own working hours." A coarse
 * pre-check would be wrong here — we're testing one concrete instant, not
 * screening a pool.
 *
 * Intentionally NOT deduplicated against `pickPanel` despite the similar filter
 * chain: the two differ in the availability test (coarse window scan vs. exact
 * buffered slot) and in the reason strings they produce, and collapsing them
 * behind a flag would make the more safety-critical of the two harder to read.
 *
 * @param bufferMin defaults to the shared BUFFER_MIN contract constant; exposed
 *        as a parameter only so tests can vary it.
 */
export function findSameTimeReplacement(
  bookedSlot: TimeWindow,
  pool: SelectionCandidate[],
  input: SelectionInput,
  bufferMin: number = BUFFER_MIN
): SelectionResult {
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
    const inHours = withinWorkingHours(bookedSlot, c.timezone) && sameLocalDay(bookedSlot, c.timezone);
    if (!inHours) {
      rejected.push({ id: c.id, name: c.name, reason: "outside working hours at the booked time" });
      return false;
    }
    return true;
  });

  working = working.filter((c) => {
    const buffered = withBuffer(bookedSlot, bufferMin);
    const conflict = c.busy.some((busy) => overlaps(buffered, busy));
    if (conflict) {
      rejected.push({ id: c.id, name: c.name, reason: `conflicts with existing event (incl. ${bufferMin}min buffer)` });
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

  const sorted = [...working].sort((a, b) => a.currentLoad - b.currentLoad || a.name.localeCompare(b.name));
  const selected = sorted.slice(0, input.panelSize).map((c) => ({
    id: c.id,
    name: c.name,
    reason: `same-time replacement · load ${c.currentLoad}/${c.dailyLimit}`,
  }));

  return { selected, rejected, insufficient: selected.length < input.panelSize };
}

/**
 * §6B — refines the candidate's ALREADY-SUBMITTED windows down to what still
 * works given current interviewer availability.
 *
 * Used when a candidate clicks "I need to reschedule": we do NOT ask them for
 * fresh availability, we re-test the windows they already gave us against the
 * panel's current calendars. An empty `slots` array here is the exact signal
 * that flips the request to RESCHEDULE_REQUIRED and puts it back in the
 * recruiter's pipeline (docs §6B failure branch) — so callers must distinguish
 * "empty" from "error," and this function never throws for the empty case.
 *
 * Deliberately just `generateSlots` with the candidate's availability pinned to
 * the passed-in windows — no new logic, per docs/07: "reuse, don't duplicate."
 * Pinning is done immutably (participants are copied, not mutated) so the
 * caller's objects are untouched.
 */
export function refineWindows(
  candidateWindows: TimeWindow[],
  config: EngineConfig,
  participants: EngineParticipant[]
): GenerateSlotsResult {
  const withPinnedWindows = participants.map((p) => (p.role === "candidate" ? { ...p, availability: candidateWindows } : p));
  return generateSlots(config, withPinnedWindows);
}
