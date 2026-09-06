import { ScoredSlot } from "./types";
import { SoftScoreResult } from "./softPreferences";

/** Step 4: sort by score descending, assign rank. Pure, stable, trivially testable. */
export function rank(scored: SoftScoreResult[]): ScoredSlot[] {
  return [...scored]
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      slot: result.slot,
      score: result.score,
      rank: index + 1,
      hardConstraintChecks: result.hardConstraintChecks,
      softPreferenceBreakdown: result.breakdown,
    }));
}
