import { ScoredSlot } from "../../scheduling-engine/types";

export interface AIExplainProvider {
  /**
   * Turns an ALREADY-RANKED, ALREADY-VALID slot's constraint checks into friendlier prose.
   * MUST NEVER be given the power to add, remove, or reorder slots — it receives one slot's
   * computed checklist and returns text only. See architecture doc Section 30 / Part G:
   * "Deterministic Scheduling Engine → Valid Slots → Optional AI Ranking/Explanation."
   */
  explainSlot(slot: ScoredSlot, context: { candidateName: string; roundType: string }): Promise<string>;

  /**
   * Drafts a short, professional notification message from structured scheduling facts only
   * (never raw candidate PII beyond first name). Output is treated as untrusted and passed
   * through sanitizeAiOutput() before ever reaching a template.
   */
  draftMessage(kind: "invite" | "confirm" | "reschedule", facts: Record<string, string>): Promise<string>;
}
