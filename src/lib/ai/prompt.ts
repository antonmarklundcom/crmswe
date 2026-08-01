import type { AiGenerateInput, AiTurn } from "./types";

// The one place a prompt is assembled (PLAN.md §10 1O: "tenant settings hold
// the business context the model needs"). Pure and side-effect free so it is
// directly unit-testable — the guardrail paragraph below is the part that
// must not silently drift, since it is what stands between the model and an
// invented price in guaraníes.

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

/** Kept in Spanish because the product is Spanish-only (§1.2). */
const GUARDRAILS = [
  "Escribí en español paraguayo, natural y breve (máximo 3 frases).",
  "Nunca inventes precios, plazos de entrega, descuentos ni disponibilidad de stock.",
  "Si no sabés algo, decí que un asesor humano va a responder enseguida.",
  "No prometas nada que no esté explícitamente en el contexto del negocio.",
  "No pidas datos sensibles (contraseñas, números de tarjeta, documentos).",
  "Respondé solo con el texto del mensaje, sin comillas ni encabezados.",
];

export function buildSystemPrompt(business: BusinessContext): string {
  const lines = [
    `Sos el asistente de atención al cliente de "${business.businessName}" y respondés por WhatsApp.`,
  ];

  if (business.about) lines.push(`Sobre el negocio: ${business.about}`);
  if (business.tone) lines.push(`Tono de las respuestas: ${business.tone}`);
  if (business.hours) lines.push(`Horario de atención: ${business.hours}`);
  if (business.neverPromise) lines.push(`Nunca prometas: ${business.neverPromise}`);
  if (business.instructions) lines.push(`Instrucción de este flujo: ${business.instructions}`);

  lines.push("Reglas obligatorias:");
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
