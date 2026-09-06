/**
 * Output validation for anything an LLM generates before it reaches a user or a notification
 * template. Defends against prompt injection surfaced via, e.g., a candidate-entered
 * "reason for reschedule" free-text field being echoed back into a prompt and then into the
 * model's output. See architecture doc Section 11 (AI-specific security).
 */
export function sanitizeAiOutput(text: string): string {
  return text
    .replace(/<[^>]*>/g, "") // strip any HTML/script tags
    .replace(/```[\s\S]*?```/g, "") // strip code fences — this layer only ever produces prose
    .trim()
    .slice(0, 2000); // hard length cap — this is a short explanation/message, never a long-form response
}

/** Strips likely prompt-injection markers from user-supplied free text before it is ever
 * interpolated into a prompt sent to the AI adapter (e.g. a reschedule "reason" field). */
export function sanitizeUserInputForPrompt(text: string): string {
  return text
    .replace(/ignore (all|previous|the above)[^.]*\./gi, "")
    .replace(/system prompt/gi, "")
    .slice(0, 500);
}
