import { describe, expect, it } from "vitest";
import { isPublicPath } from "./middleware";

// The auth allowlist fails closed, which is the right default but makes an
// omission silent in a confusing way: a missing public prefix doesn't look
// like an auth bug, it looks like WhatsApp not delivering attachments or a
// customer's quote link being broken. 1Q shipped with /d/ missing and only a
// real HTTP request caught it — hence these.

describe("isPublicPath", () => {
  it("allows the customer-facing document surfaces, including the PDF Meta fetches", () => {
    expect(isPublicPath("/q/abc123")).toBe(true);
    expect(isPublicPath("/q/abc123/pdf")).toBe(true);
    expect(isPublicPath("/d/abc123")).toBe(true);
    expect(isPublicPath("/d/abc123/pdf")).toBe(true);
  });

  it("allows hosted forms, the attribution snippet, auth pages and api routes", () => {
    expect(isPublicPath("/f/acme/contacto")).toBe(true);
    expect(isPublicPath("/vc-attribution.js")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/accept-invite/tok")).toBe(true);
    expect(isPublicPath("/forgot-password")).toBe(true);
    expect(isPublicPath("/reset-password")).toBe(true);
    expect(isPublicPath("/api/webhooks/whatsapp")).toBe(true);
    expect(isPublicPath("/")).toBe(true);
  });

  it("still protects the tenant app and the superadmin console", () => {
    for (const path of [
      "/dashboard",
      "/contacts",
      "/inbox",
      "/quotes",
      "/documents",
      "/settings",
      "/tenants",
      "/plans",
      "/automations",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("does not treat a lookalike prefix as public", () => {
    // "/documents" must not be matched by the "/d/" prefix.
    expect(isPublicPath("/documents")).toBe(false);
    expect(isPublicPath("/deals")).toBe(false);
  });
});
