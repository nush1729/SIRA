import { env } from "../../config/env";
import { AIExplainProvider } from "./AIExplainProvider";
import { MockAIExplainProvider } from "./MockAIExplainProvider";
import { AnthropicExplainProvider } from "./AnthropicExplainProvider";

export * from "./AIExplainProvider";
export { sanitizeAiOutput, sanitizeUserInputForPrompt } from "./sanitize";

export const aiExplainProvider: AIExplainProvider =
  env.AI_EXPLAIN_ENABLED && env.ANTHROPIC_API_KEY ? new AnthropicExplainProvider() : new MockAIExplainProvider();
