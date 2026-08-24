import { describe, expect, it } from "vitest";
import { evaluateGuards, resolveMode } from "@/modules/ai/reply";
import { chatGuardInput } from "./reply";
import { originAllowed } from "./widgets";

// The pure decisions behind the widget (docs/SPEC-CHAT-WIDGET.md §8), with no
// database and no clock.

describe("originAllowed", () => {
  it("allows anything when nothing is configured", () => {
    // Stated plainly rather than defaulted to deny: a tenant who never filled
    // the field in has an open widget, and the UI says so.
    expect(originAllowed([], "https://example.com")).toBe(true);
    expect(originAllowed([], null)).toBe(true);
  });

  it("requires an origin once a list exists", () => {
    expect(originAllowed(["example.com"], null)).toBe(false);
  });

  it("matches on host, ignoring scheme and port", () => {
    expect(originAllowed(["example.com"], "https://example.com")).toBe(true);
    expect(originAllowed(["https://example.com"], "http://example.com:8080")).toBe(true);
    expect(originAllowed(["EXAMPLE.com"], "https://example.com")).toBe(true);
  });

  it("never lets a lookalike host through", () => {
    // The failure this exists to prevent: a suffix match would accept
    // `evil-example.com` for `example.com`.
    expect(originAllowed(["example.com"], "https://evil-example.com")).toBe(false);
    expect(originAllowed(["example.com"], "https://example.com.attacker.net")).toBe(false);
  });

  it("takes a subdomain only when asked explicitly", () => {
    expect(originAllowed(["example.com"], "https://shop.example.com")).toBe(false);
    expect(originAllowed([".example.com"], "https://shop.example.com")).toBe(true);
    expect(originAllowed([".example.com"], "https://evil-example.com")).toBe(false);
  });
});

describe("chatGuardInput", () => {
  const base = {
    tenantAiEnabled: true,
    driverConfigured: true,
    conversationAiDisabled: false,
    repliesTodayForConversation: 0,
    repliesTodayForTenant: 0,
    maxPerConversationPerDay: 12,
    maxPerTenantPerDay: 200,
  };

  it("pins the WhatsApp-only guards where a request cannot reach them", () => {
    // The 24h window is Meta policy about WhatsApp; it does not exist on a
    // website. Pinned in one place rather than deleted from the shared
    // function, so the guard order stays identical across channels.
    const input = chatGuardInput(base);
    expect(input.withinWindow).toBe(true);
    expect(input.optedOut).toBe(false);
  });

  it("still refuses everything the shared guards refuse", () => {
    expect(evaluateGuards(chatGuardInput({ ...base, tenantAiEnabled: false }))).toEqual({
      allowed: false,
      reason: "ai_disabled_for_tenant",
    });
    expect(evaluateGuards(chatGuardInput({ ...base, driverConfigured: false }))).toEqual({
      allowed: false,
      reason: "ai_not_configured",
    });
    expect(evaluateGuards(chatGuardInput({ ...base, conversationAiDisabled: true }))).toEqual({
      allowed: false,
      reason: "conversation_ai_disabled",
    });
    expect(evaluateGuards(chatGuardInput(base))).toEqual({ allowed: true });
  });

  it("trips the per-conversation cap", () => {
    expect(
      evaluateGuards(chatGuardInput({ ...base, repliesTodayForConversation: 12 })),
    ).toEqual({ allowed: false, reason: "conversation_daily_cap" });
  });

  it("trips the tenant cap on a budget shared with WhatsApp", () => {
    // 200 replies already spent today — it does not matter which channel
    // spent them, which is the entire point of one ai_replies table.
    expect(evaluateGuards(chatGuardInput({ ...base, repliesTodayForTenant: 200 }))).toEqual({
      allowed: false,
      reason: "tenant_daily_cap",
    });
  });
});

describe("resolveMode as the widget's ceiling", () => {
  it("cannot send while the tenant is on draft", () => {
    // The two-key rule from the WhatsApp side, reused verbatim: a widget set
    // to autonomous under a draft-mode tenant still drafts.
    expect(resolveMode("send", "draft")).toBe("draft");
    expect(resolveMode("draft", "draft")).toBe("draft");
  });

  it("sends only when both keys are turned", () => {
    expect(resolveMode("send", "send")).toBe("send");
    expect(resolveMode("draft", "send")).toBe("draft");
  });
});
