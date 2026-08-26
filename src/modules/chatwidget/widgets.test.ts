import { describe, expect, it } from "vitest";
import { evaluateGuards, resolveMode } from "@/modules/ai/reply";
import { chatChannelCap, chatGuardInput } from "./reply";
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
    repliesTodayForChat: 0,
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

  it("stops chat at half the budget while WhatsApp still has the rest", () => {
    // The shared ceiling bounds the bill; this bounds which channel spends
    // it. A public, unauthenticated widget must not be able to starve the
    // customers already talking to the business on WhatsApp.
    expect(chatChannelCap(200)).toBe(100);

    expect(
      evaluateGuards(
        chatGuardInput({ ...base, repliesTodayForTenant: 100, repliesTodayForChat: 100 }),
      ),
    ).toEqual({ allowed: false, reason: "channel_daily_cap" });

    // Same tenant spend, but WhatsApp is what spent it: chat still has its
    // own half untouched.
    expect(
      evaluateGuards(
        chatGuardInput({ ...base, repliesTodayForTenant: 100, repliesTodayForChat: 0 }),
      ),
    ).toEqual({ allowed: true });
  });

  it("never floors a tenant's chat share to nothing", () => {
    // A tenant whose whole daily budget is a single call should still be
    // able to answer one visitor; the shared ceiling stops it going further.
    expect(chatChannelCap(1)).toBe(1);
    expect(chatChannelCap(0)).toBe(1);
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
