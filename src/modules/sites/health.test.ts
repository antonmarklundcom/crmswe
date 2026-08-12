import { describe, expect, it } from "vitest";
import { classifyIngestError, siteHealthStatus, type SiteHealthRow } from "./health";

// The two pure decisions per-site health makes (PLAN.md §5.2): what a failure
// is called, and whether a site reads as failing. Both matter more than they
// look — the first is what keeps payloads and credentials out of a rendered
// column, the second is what stops a stale error painting a working site red.

function health(overrides: Partial<SiteHealthRow>): SiteHealthRow {
  return {
    id: "h1",
    tenantId: "t1",
    siteId: "s1",
    lastSuccessAt: null,
    lastSuccessLane: null,
    lastErrorAt: null,
    lastErrorStatus: null,
    lastErrorReason: null,
    lastErrorLane: null,
    successCount: 0,
    errorCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("classifyIngestError", () => {
  it("maps each ingest failure onto a short stable code", () => {
    expect(classifyIngestError(429, "Rate limit exceeded")).toBe("rate-limited");
    expect(classifyIngestError(401, "Invalid API key")).toBe("invalid-key");
    expect(classifyIngestError(403, "Turnstile verification failed: timeout")).toBe(
      "turnstile-failed",
    );
    expect(classifyIngestError(403, "Site is inactive")).toBe("site-inactive");
    expect(classifyIngestError(403, "Tenant is read-only")).toBe("tenant-read-only");
    expect(classifyIngestError(422, "phone: Too small")).toBe("phone-missing");
    expect(classifyIngestError(422, "email: Invalid email")).toBe("invalid-body");
    expect(classifyIngestError(500, "boom")).toBe("unknown");
  });

  it("never carries the original message through", () => {
    // The underlying strings hold zod field paths and Cloudflare error codes;
    // the stored reason is a code the UI translates, so nothing submitted and
    // no credential can reach the column.
    const reason = classifyIngestError(422, "phone: expected string, received '0981-secret-ish'");
    expect(reason).toBe("phone-missing");
    expect(reason).not.toContain("0981");
  });
});

describe("siteHealthStatus", () => {
  const early = new Date("2026-08-01T10:00:00Z");
  const late = new Date("2026-08-01T12:00:00Z");

  it("is idle before a site has ever been used", () => {
    expect(siteHealthStatus(null)).toBe("idle");
    expect(siteHealthStatus(health({}))).toBe("idle");
  });

  it("is ok when the last attempt succeeded", () => {
    expect(siteHealthStatus(health({ lastSuccessAt: late }))).toBe("ok");
    // Recovered on its own: an old error must not keep a working site red,
    // and nobody has to clear anything.
    expect(siteHealthStatus(health({ lastErrorAt: early, lastSuccessAt: late }))).toBe("ok");
  });

  it("is failing when the last attempt failed", () => {
    expect(siteHealthStatus(health({ lastErrorAt: late }))).toBe("failing");
    expect(siteHealthStatus(health({ lastSuccessAt: early, lastErrorAt: late }))).toBe("failing");
  });
});
