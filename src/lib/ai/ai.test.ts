import { describe, expect, it } from "vitest";
import { buildSystemPrompt, serialisePrompt, toTurns } from "./prompt";
import { createOpenAiDriver } from "./openai";
import { createGeminiDriver } from "./gemini";
import type { AiGenerateInput } from "./types";

// The provider-neutral layer (PLAN.md §10 1O). Prompt assembly is pure, so
// it's tested directly; the drivers are tested against a stubbed fetch,
// which is the only part of them that isn't.

describe("buildSystemPrompt", () => {
  it("always carries the guardrails, even with no tenant context filled in", () => {
    const prompt = buildSystemPrompt({ businessName: "Climatex" });
    expect(prompt).toContain("Climatex");
    expect(prompt).toContain("Hitta aldrig på priser");
  });

  it("includes the tenant's own never-promise list and per-node instruction", () => {
    const prompt = buildSystemPrompt({
      businessName: "Climatex",
      neverPromise: "plazos de instalación",
      instructions: "ofrecé agendar una visita",
    });
    expect(prompt).toContain("plazos de instalación");
    expect(prompt).toContain("ofrecé agendar una visita");
  });
});

describe("toTurns", () => {
  it("maps inbound to user and outbound to assistant", () => {
    const turns = toTurns([
      { direction: "in", body: "hola" },
      { direction: "out", body: "buenas!" },
    ]);
    expect(turns).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "buenas!" },
    ]);
  });

  it("drops media-only messages rather than sending blank turns", () => {
    const turns = toTurns([
      { direction: "in", body: null },
      { direction: "in", body: "   " },
      { direction: "in", body: "consulta" },
    ]);
    expect(turns).toEqual([{ role: "user", content: "consulta" }]);
  });

  it("keeps only the most recent turns", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      direction: "in" as const,
      body: `m${i}`,
    }));
    const turns = toTurns(many, 5);
    expect(turns).toHaveLength(5);
    expect(turns[4].content).toBe("m29");
  });
});

describe("serialisePrompt", () => {
  it("flattens system + turns into the stored audit string", () => {
    const input: AiGenerateInput = {
      system: "sos el asistente",
      messages: [{ role: "user", content: "hola" }],
    };
    expect(serialisePrompt(input)).toBe("sos el asistente\n\n---\nuser: hola");
  });
});

/** Swaps global fetch for one call and restores it. */
async function withFetch<T>(
  impl: (url: string, init: RequestInit) => Response,
  fn: () => Promise<T>,
): Promise<{ result: T; calls: Array<{ url: string; body: unknown }> }> {
  const calls: Array<{ url: string; body: unknown }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return impl(String(url), init);
  }) as unknown as typeof fetch;
  try {
    return { result: await fn(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

describe("openai driver", () => {
  it("returns the text and the provider's own token counts", async () => {
    const driver = createOpenAiDriver("sk-test", "gpt-4o-mini");
    const { result, calls } = await withFetch(
      () =>
        new Response(
          JSON.stringify({
            model: "gpt-4o-mini-2024",
            choices: [{ message: { content: "  Buenas! ¿En qué te ayudo?  " } }],
            usage: { prompt_tokens: 120, completion_tokens: 15 },
          }),
          { status: 200 },
        ),
      () =>
        driver.generateReply({
          system: "sos el asistente",
          messages: [{ role: "user", content: "hola" }],
        }),
    );

    expect(result.text).toBe("Buenas! ¿En qué te ayudo?");
    expect(result.model).toBe("gpt-4o-mini-2024");
    expect(result.promptTokens).toBe(120);
    expect(result.completionTokens).toBe(15);

    const body = calls[0].body as { messages: Array<{ role: string }> };
    expect(body.messages[0].role).toBe("system");
  });

  it("throws on a non-2xx so the caller records a failed reply", async () => {
    const driver = createOpenAiDriver("sk-test");
    await expect(
      withFetch(
        () => new Response("rate limited", { status: 429 }),
        () => driver.generateReply({ system: "s", messages: [{ role: "user", content: "x" }] }),
      ),
    ).rejects.toThrow(/429/);
  });
});

describe("gemini driver", () => {
  it("maps assistant turns to Google's `model` role and reads usageMetadata", async () => {
    const driver = createGeminiDriver("key", "gemini-2.0-flash");
    const { result, calls } = await withFetch(
      () =>
        new Response(
          JSON.stringify({
            modelVersion: "gemini-2.0-flash-001",
            candidates: [{ content: { parts: [{ text: "Hola!" }] } }],
            usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 8 },
          }),
          { status: 200 },
        ),
      () =>
        driver.generateReply({
          system: "sos el asistente",
          messages: [
            { role: "user", content: "hola" },
            { role: "assistant", content: "buenas" },
          ],
        }),
    );

    expect(result.text).toBe("Hola!");
    expect(result.promptTokens).toBe(90);
    expect(result.completionTokens).toBe(8);

    const body = calls[0].body as { contents: Array<{ role: string }> };
    expect(body.contents.map((c) => c.role)).toEqual(["user", "model"]);
  });

  it("throws when the candidate has no text", async () => {
    const driver = createGeminiDriver("key");
    await expect(
      withFetch(
        () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
        () => driver.generateReply({ system: "s", messages: [{ role: "user", content: "x" }] }),
      ),
    ).rejects.toThrow(/empty completion/);
  });
});
