import { ScoredSlot } from "../../scheduling-engine/types";
import { AIExplainProvider } from "./AIExplainProvider";

/**
 * Deterministic template-based "explanation" — used whenever AI_EXPLAIN_ENABLED=false (the
 * default) or in sandbox mode. The UI's Explainable Scheduling surface works identically either
 * way, because the underlying data (hardConstraintChecks, softPreferenceBreakdown) is always
 * real engine output — this class just turns it into a sentence instead of a bullet list.
 */
export class MockAIExplainProvider implements AIExplainProvider {
  async explainSlot(slot: ScoredSlot, context: { candidateName: string; roundType: string }): Promise<string> {
    const passedChecks = slot.hardConstraintChecks.filter((c) => c.passed).length;
    return `Recommended for ${context.candidateName}'s ${context.roundType}: all ${passedChecks} scheduling constraints are satisfied, and this slot scored ${slot.score} points on preference-fit (rank #${slot.rank}).`;
  }

  async draftMessage(kind: "invite" | "confirm" | "reschedule", facts: Record<string, string>): Promise<string> {
    const templates: Record<string, string> = {
      invite: `Hi ${facts.name ?? "there"}, we'd like to schedule your ${facts.roundType ?? "interview"}. Please share your availability when you have a moment.`,
      confirm: `Hi ${facts.name ?? "there"}, your ${facts.roundType ?? "interview"} is confirmed for ${facts.time ?? "the scheduled time"}.`,
      reschedule: `Hi ${facts.name ?? "there"}, your ${facts.roundType ?? "interview"} needs to move — we're finding a new time and will confirm shortly.`,
    };
    return templates[kind];
  }
}
