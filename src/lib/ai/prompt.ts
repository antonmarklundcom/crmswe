import type { AiGenerateInput, AiTurn } from "./types";

// The one place a prompt is assembled (PLAN.md §10 1O: "tenant settings hold
// the business context the model needs"). Pure and side-effect free so it is
// directly unit-testable — the guardrail paragraph below is the part that
// must not silently drift, since it is what stands between the model and an
// invented price.

export type BusinessContext = {
  businessName: string;
  /** What the company sells, in the tenant's own words. */
  about?: string;
  tone?: string;
  hours?: string;
  /** Things the model must never promise: prices, delivery dates, discounts. */
  neverPromise?: string;
  /** Extra per-node instructions from the flow's ai_reply node. */
  instructions?: string;
};

/** Kept in Swedish because the product is Swedish-only (plan.md §1.11). */
const GUARDRAILS = [
  "Skriv på naturlig, kortfattad svenska (högst 3 meningar).",
  "Hitta aldrig på priser, leveranstider, rabatter eller lagerstatus.",
  "Om du inte vet något: säg att en handläggare hör av sig snart.",
  "Lova aldrig något som inte uttryckligen finns i affärskontexten.",
  "Be aldrig om känsliga uppgifter (lösenord, kortnummer, id-handlingar).",
  "Svara bara med själva meddelandetexten, utan citattecken eller rubriker.",
];

export function buildSystemPrompt(business: BusinessContext): string {
  const lines = [
    `Du är kundtjänstassistenten för "${business.businessName}" och svarar via WhatsApp.`,
  ];

  if (business.about) lines.push(`Om företaget: ${business.about}`);
  if (business.tone) lines.push(`Tonen i svaren: ${business.tone}`);
  if (business.hours) lines.push(`Öppettider: ${business.hours}`);
  if (business.neverPromise) lines.push(`Lova aldrig: ${business.neverPromise}`);
  if (business.instructions) lines.push(`Instruktion för det här flödet: ${business.instructions}`);

  lines.push("Obligatoriska regler:");
  for (const rule of GUARDRAILS) lines.push(`- ${rule}`);

  return lines.join("\n");
}

/**
 * The last `limit` messages of the conversation, oldest first. Outbound
 * messages become assistant turns and inbound ones user turns, so the model
 * sees the thread the way the customer does. Empty bodies (media-only
 * messages) are dropped rather than sent as blank turns.
 */
export function toTurns(
  messages: Array<{ direction: "in" | "out"; body: string | null }>,
  limit = 20,
): AiTurn[] {
  return messages
    .filter((message) => (message.body ?? "").trim().length > 0)
    .slice(-limit)
    .map((message) => ({
      role: message.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: (message.body ?? "").trim(),
    }));
}

export function buildReplyPrompt(
  business: BusinessContext,
  messages: Array<{ direction: "in" | "out"; body: string | null }>,
): AiGenerateInput {
  return { system: buildSystemPrompt(business), messages: toTurns(messages) };
}

/**
 * What gets persisted alongside every generated reply for audit (§10 1O:
 * "every AI message stored with its prompt and model"). Flattened to text so
 * the stored prompt is readable in the UI without re-deriving anything.
 */
export function serialisePrompt(input: AiGenerateInput): string {
  const turns = input.messages.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
  return `${input.system}\n\n---\n${turns}`;
}
