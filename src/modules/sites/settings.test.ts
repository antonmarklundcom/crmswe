import { beforeAll, describe, expect, it } from "vitest";

// Per-site settings helpers (PLAN.md §5.2). These are pure functions over a
// site row, but they live in a module that imports the db client, so the
// suite is guarded the same way the other module suites are and loads
// through a dynamic import.
const hasEnv = !!process.env.APP_ENCRYPTION_KEY && !!process.env.DATABASE_URL;

describe.skipIf(!hasEnv)("site turnstile settings", () => {
  let settings: typeof import("./settings");
  let encrypt: (typeof import("@/lib/crypto"))["encrypt"];

  beforeAll(async () => {
    settings = await import("./settings");
    ({ encrypt } = await import("@/lib/crypto"));
  });

  it("reads nothing for a site that has never been configured — the additive case", () => {
    const site = { settings: {} };
    expect(settings.siteTurnstileSiteKey(site)).toBeNull();
    expect(settings.siteTurnstileSecret(site)).toBeNull();
    expect(settings.siteSettings(site).turnstile).toBeUndefined();
  });

  it("tolerates a null settings column", () => {
    const site = { settings: null };
    expect(settings.siteTurnstileSiteKey(site)).toBeNull();
    expect(settings.siteTurnstileSecret(site)).toBeNull();
  });

  it("round-trips the secret through AES-256-GCM and keeps the site key in the clear", () => {
    const site = {
      settings: {
        turnstile: { siteKey: "0x4AAA-public", secret: encrypt("0x4AAA-secret") },
      },
    };

    expect(settings.siteTurnstileSiteKey(site)).toBe("0x4AAA-public");
    expect(settings.siteTurnstileSecret(site)).toBe("0x4AAA-secret");
    // The stored form is ciphertext + iv + tag, never the plaintext (§3.4).
    expect(JSON.stringify(site.settings)).not.toContain("0x4AAA-secret");
  });

  it("degrades to no-Turnstile rather than throwing when the ciphertext no longer decrypts", () => {
    const encrypted = encrypt("0x4AAA-secret");
    const site = {
      settings: {
        turnstile: {
          siteKey: "0x4AAA-public",
          secret: { ...encrypted, tag: Buffer.from("0".repeat(16)).toString("base64") },
        },
      },
    };

    // A rotated APP_ENCRYPTION_KEY must not take a site's lead capture down
    // with it: the site key still renders, verification is simply skipped.
    expect(settings.siteTurnstileSecret(site)).toBeNull();
    expect(settings.siteTurnstileSiteKey(site)).toBe("0x4AAA-public");
  });
});
