import { ConstraintCheck, EngineConfig, Participant, TimeWindow } from "./types";
import { isWithinWorkingHours } from "./timezone";

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

function isFullyWithinAnyWindow(slot: TimeWindow, windows: TimeWindow[]): boolean {
  return windows.some((w) => slot.start >= w.start && slot.end <= w.end);
}

/** Expands a slot by the buffer on both sides, to check it doesn't crowd an adjacent event. */
function withBuffer(slot: TimeWindow, bufferMinutes: number): TimeWindow {
  const bufferMs = bufferMinutes * 60_000;
  return { start: new Date(slot.start.getTime() - bufferMs), end: new Date(slot.end.getTime() + bufferMs) };
}

/**
 * Step 2 of the pipeline: reject any slot that violates a hard constraint for any required
 * participant. Returns, per slot, the full list of named checks that passed — this list is
 * exactly what powers the Explainable Scheduling UI (architecture doc Section 3, #1); it is not
 * a separate narrative generated after the fact, it's a direct rendering of this computation.
 */
export function filterHardConstraints(
  slots: TimeWindow[],
  participants: Participant[],
  config: Pick<EngineConfig, "bufferMinutes" | "workingHoursStart" | "workingHoursEnd">
): { slot: TimeWindow; checks: ConstraintCheck[] }[] {
  const requiredParticipants = participants.filter((p) => p.isRequired);

  const results: { slot: TimeWindow; checks: ConstraintCheck[] }[] = [];

  for (const slot of slots) {
    const checks: ConstraintCheck[] = [];
    let allPassed = true;

    for (const participant of requiredParticipants) {
      const withinHours = isWithinWorkingHours(
        slot,
        participant.timezone,
        config.workingHoursStart,
        config.workingHoursEnd
      );
      checks.push({
        name: `${participant.role}_working_hours`,
        passed: withinHours,
        detail: withinHours ? undefined : `Outside ${participant.role} ${participant.id}'s working hours`,
      });
      if (!withinHours) allPassed = false;

      const available = isFullyWithinAnyWindow(slot, participant.availability);
      checks.push({
        name: `${participant.role}_availability`,
        passed: available,
        detail: available ? undefined : `${participant.role} ${participant.id} did not report availability here`,
      });
      if (!available) allPassed = false;

      const bufferedSlot = withBuffer(slot, config.bufferMinutes);
      const conflictFree = !participant.busy.some((event) => overlaps(bufferedSlot, event));
      checks.push({
        name: `${participant.role}_no_conflict_with_buffer`,
        passed: conflictFree,
        detail: conflictFree
          ? undefined
          : `Conflicts with an existing event for ${participant.role} ${participant.id} (including ${config.bufferMinutes}min buffer)`,
      });
      if (!conflictFree) allPassed = false;
    }

    if (allPassed) {
      results.push({ slot, checks });
    }
  }

  return results;
}
