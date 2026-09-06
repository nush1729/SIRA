import { generateCandidateSlots } from "./generateSlots";
import { filterHardConstraints } from "./hardConstraints";
import { scoreSoftPreferences } from "./softPreferences";
import { rank } from "./rank";
import { diagnoseConflict } from "./conflictRecovery";
import { EngineConfig, Participant, ScoredSlot, ConflictBottleneck } from "./types";

export * from "./types";
export { diagnoseConflict } from "./conflictRecovery";
export { evaluateAutoConfirm } from "./autoConfirm";
export * from "./loopEngine";

export interface GenerateRankedSlotsResult {
  rankedSlots: ScoredSlot[];
  conflict: ConflictBottleneck | null; // populated only when rankedSlots is empty
}

/**
 * The full single-round pipeline (architecture doc Section 8):
 *   normalize_timezones (done upstream, before Participant objects reach here — see timezone.ts)
 *   → generate_candidate_slots → filter_hard_constraints → score_soft_preferences → rank
 *   → [optional, isolated] ai_explain_or_rerank happens OUTSIDE this module, on its output only.
 *
 * This function has zero I/O — no DB, no network — by design, so it's fully unit-testable and
 * cannot silently depend on an AI call to determine correctness.
 */
export function generateRankedSlots(config: EngineConfig, participants: Participant[]): GenerateRankedSlotsResult {
  const candidateSlots = generateCandidateSlots(config.dateRange, config.durationMinutes, config.slotStepMinutes);

  const validSlots = filterHardConstraints(candidateSlots, participants, config);

  if (validSlots.length === 0) {
    return { rankedSlots: [], conflict: diagnoseConflict(candidateSlots, participants, config) };
  }

  const scored = scoreSoftPreferences(validSlots, participants, config.dateRange);
  return { rankedSlots: rank(scored), conflict: null };
}
