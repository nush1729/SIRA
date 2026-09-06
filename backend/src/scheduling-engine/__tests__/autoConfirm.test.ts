import { describe, expect, it } from "vitest";
import { evaluateAutoConfirm } from "../autoConfirm";
import { ScoredSlot } from "../types";

function slot(score: number, rank: number): ScoredSlot {
  return {
    slot: { start: new Date(), end: new Date() },
    score,
    rank,
    hardConstraintChecks: [],
    softPreferenceBreakdown: [],
  };
}

describe("evaluateAutoConfirm", () => {
  it("never auto-confirms when the policy is disabled", () => {
    const decision = evaluateAutoConfirm([slot(90, 1), slot(40, 2)], "SCREENING", {
      enabled: false,
      minScoreGap: 15,
      eligibleRoundTypes: ["SCREENING"],
    });
    expect(decision.shouldAutoConfirm).toBe(false);
  });

  it("never auto-confirms for a round type not on the eligible list", () => {
    const decision = evaluateAutoConfirm([slot(90, 1), slot(40, 2)], "MANAGERIAL", {
      enabled: true,
      minScoreGap: 15,
      eligibleRoundTypes: ["SCREENING"],
    });
    expect(decision.shouldAutoConfirm).toBe(false);
  });

  it("auto-confirms when the score gap clears the threshold", () => {
    const decision = evaluateAutoConfirm([slot(90, 1), slot(40, 2)], "SCREENING", {
      enabled: true,
      minScoreGap: 15,
      eligibleRoundTypes: ["SCREENING"],
    });
    expect(decision.shouldAutoConfirm).toBe(true);
    expect(decision.scoreGap).toBe(50);
  });

  it("does not auto-confirm when the top two slots are close in score", () => {
    const decision = evaluateAutoConfirm([slot(52, 1), slot(48, 2)], "SCREENING", {
      enabled: true,
      minScoreGap: 15,
      eligibleRoundTypes: ["SCREENING"],
    });
    expect(decision.shouldAutoConfirm).toBe(false);
  });

  it("auto-confirms a single dominant slot with no runner-up to compare against", () => {
    const decision = evaluateAutoConfirm([slot(60, 1)], "SCREENING", {
      enabled: true,
      minScoreGap: 15,
      eligibleRoundTypes: ["SCREENING"],
    });
    expect(decision.shouldAutoConfirm).toBe(true);
  });
});
