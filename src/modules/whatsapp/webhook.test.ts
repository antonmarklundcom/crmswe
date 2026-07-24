import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

// verifySignature itself needs no DB, but the module it lives in
// transitively imports lib/config/env (which validates the *whole* env,
// DATABASE_URL included) — same reason the isolation suites gate on hasDb
// and dynamic-import, see modules/tenancy/isolation.test.ts.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("whatsapp webhook signature verification", () => {
  let verifySignature: (typeof import("./webhook"))["verifySignature"];

  const appSecret = process.env.WHATSAPP_APP_SECRET ?? "";

  it("accepts a signature computed with the configured app secret", async () => {
    ({ verifySignature } = await import("./webhook"));
    const body = JSON.stringify({ hello: "world" });
    const signature = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;

    expect(verifySignature(body, signature)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    ({ verifySignature } = await import("./webhook"));
    const body = JSON.stringify({ hello: "world" });
    const signature = `sha256=${createHmac("sha256", "wrong-secret").update(body).digest("hex")}`;

    expect(verifySignature(body, signature)).toBe(false);
  });

  it("rejects a signature computed over a different body (tamper detection)", async () => {
    ({ verifySignature } = await import("./webhook"));
    const signature = `sha256=${createHmac("sha256", appSecret).update("original").digest("hex")}`;

    expect(verifySignature("tampered", signature)).toBe(false);
  });

  it("rejects a missing or malformed header", async () => {
    ({ verifySignature } = await import("./webhook"));
    expect(verifySignature("body", null)).toBe(false);
    expect(verifySignature("body", "not-sha256=abc")).toBe(false);
  });
});
