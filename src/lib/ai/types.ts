// Provider-neutral AI interface (PLAN.md §10 1O). Deliberately tiny — a
// prompt in, a string out — so swapping providers is a config change rather
// than a rewrite. Anything provider-specific (endpoints, request shape,
// token accounting field names) is confined to the driver files next to
// this one, exactly like lib/storage.

export type AiProvider = "openai" | "gemini";

export type AiTurn = { role: "user" | "assistant"; content: string };

export type AiGenerateInput = {
  /** Business context + guardrails; never contains customer content. */
  system: string;
  /** Conversation so far, oldest first. */
  messages: AiTurn[];
  maxOutputTokens?: number;
};

export type AiGenerateResult = {
  text: string;
  model: string;
  /** Metered per tenant (§10 1O "cost is per-token and per-tenant"). */
  promptTokens: number;
  completionTokens: number;
};

export interface AiDriver {
  readonly provider: AiProvider;
  readonly model: string;
  generateReply(input: AiGenerateInput): Promise<AiGenerateResult>;
}

/** Shared ceiling — a WhatsApp reply that runs long is a bug, not a feature. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 400;
