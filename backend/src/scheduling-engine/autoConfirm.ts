import { ScoredSlot } from "./types";

export interface AutoConfirmPolicy {
  enabled: boolean;
  minScoreGap: number;
  eligibleRoundTypes: string[];
}

export interface AutoConfirmDecision {
  shouldAutoConfirm: boolean;
  reason: string;
  scoreGap: number | null;
}

/**
 * Zero-Click Auto-Confirm gate (architecture doc Section 8.2). This is a plain numeric
 * comparison over scores the engine already computed — not a new decision, just a
 * policy-configurable strictness dial over existing, tested math. Never called for a round
 * type the org hasn't explicitly opted in for; off by default at the policy level.
 */
export function evaluateAutoConfirm(
  rankedSlots: ScoredSlot[],
  roundType: string,
  policy: AutoConfirmPolicy
): AutoConfirmDecision {
  if (!policy.enabled || !policy.eligibleRoundTypes.includes(roundType)) {
    return { shouldAutoConfirm: false, reason: "Auto-confirm not enabled for this round type.", scoreGap: null };
  }

  if (rankedSlots.length === 0) {
    return { shouldAutoConfirm: false, reason: "No valid slots to auto-confirm.", scoreGap: null };
  }

  if (rankedSlots.length === 1) {
    return {
      shouldAutoConfirm: true,
      reason: "Exactly one valid slot exists — no alternative to weigh against.",
      scoreGap: null,
    };
  }

  const [top, runnerUp] = rankedSlots;
  const scoreGap = top.score - runnerUp.score;

  if (scoreGap >= policy.minScoreGap) {
    return {
      shouldAutoConfirm: true,
      reason: `Top slot beats the runner-up by ${scoreGap} points, clearing the ${policy.minScoreGap}-point threshold.`,
      scoreGap,
    };
  }

  return {
    shouldAutoConfirm: false,
    reason: `Top slot only beats the runner-up by ${scoreGap} points — below the ${policy.minScoreGap}-point threshold, so a human should review.`,
    scoreGap,
  };
}
