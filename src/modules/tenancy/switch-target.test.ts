import { describe, expect, it } from "vitest";
import { resolveSwitchTarget, SWITCH_FALLBACK } from "./switch-target";

// No MySQL — runs on every `npm test`, which is what it is for. The resolver
// is the difference between "the switcher keeps you where you were" and "the
// switcher tells you whether a record exists in a business you just left".

/** Switching into a business that runs the WhatsApp channel (plan.md
 * §5.3.1). Most cases here predate the flag and are about paths that have
 * nothing to do with it, so they leave it at its default — hidden. */
const WITH_WHATSAPP = { whatsappEnabled: true } as const;

describe("resolveSwitchTarget", () => {
  it("keeps you in the same section when it is a list you can still see", () => {
    expect(resolveSwitchTarget("/pipeline", "agent")).toBe("/pipeline");
    expect(resolveSwitchTarget("/contacts", "agent")).toBe("/contacts");
    expect(resolveSwitchTarget("/inbox", "agent", WITH_WHATSAPP)).toBe("/inbox");
    expect(resolveSwitchTarget("/dashboard", "agent")).toBe("/dashboard");
  });

  it("drops the record id, because it belongs to the business you left", () => {
    // The id is a ULID from the *other* tenant. Following it would 404 at
    // best; at worst the response distinguishes "not found" from "not yours",
    // which is a cross-tenant probe one click away.
    expect(resolveSwitchTarget("/contacts/01JABCDEF0123456789ABCDEFG", "agent")).toBe(
      "/contacts",
    );
    expect(resolveSwitchTarget("/pipeline/01JABCDEF0123456789ABCDEFG", "agent")).toBe(
      "/pipeline",
    );
    expect(resolveSwitchTarget("/inbox/01JABCDEF0123456789ABCDEFG", "admin", WITH_WHATSAPP)).toBe(
      "/inbox",
    );
    expect(resolveSwitchTarget("/quotes/01JABCDEF0123456789ABCDEFG", "admin")).toBe(
      "/quotes",
    );
    expect(resolveSwitchTarget("/documents/01JABCDEF0123456789ABCDEFG", "admin")).toBe(
      "/documents",
    );
  });

  it("drops sub-pages that are not record ids too", () => {
    expect(resolveSwitchTarget("/contacts/import", "agent")).toBe("/contacts");
    expect(resolveSwitchTarget("/pipeline/etapas", "admin")).toBe("/pipeline");
  });

  it("drops the query string — its filters name the old business's tags and users", () => {
    expect(resolveSwitchTarget("/contacts?tagId=01JABC&sort=name", "agent")).toBe(
      "/contacts",
    );
    expect(resolveSwitchTarget("/pipeline#deal-3", "agent")).toBe("/pipeline");
  });

  it("sends an agent to the dashboard when the section is admin-only", () => {
    // The same person can be admin in one business and agent in another
    // (§3.1), so this is a normal switch, not an attack: land them somewhere
    // that works instead of on a page where every button throws.
    for (const path of ["/users", "/settings", "/sites", "/forms", "/automations", "/whatsapp"]) {
      expect(resolveSwitchTarget(path, "agent", WITH_WHATSAPP)).toBe(SWITCH_FALLBACK);
    }
  });

  it("keeps an admin in an admin-only section", () => {
    expect(resolveSwitchTarget("/users", "admin")).toBe("/users");
    expect(resolveSwitchTarget("/sites", "admin")).toBe("/sites");
    expect(resolveSwitchTarget("/automations/01JABCDEF0123456789ABCDEFG", "admin")).toBe(
      "/automations",
    );
  });

  it("sends you to the dashboard when the business you switched into has no WhatsApp", () => {
    // The destination decides, not the business being left (plan.md §5.3.1):
    // /inbox and /whatsapp are 404 there, so landing on them would be the
    // same dead end the role check already avoids.
    for (const path of ["/inbox", "/whatsapp", "/inbox/01JABCDEF0123456789ABCDEFG"]) {
      expect(resolveSwitchTarget(path, "admin")).toBe(SWITCH_FALLBACK);
      expect(resolveSwitchTarget(path, "admin", { whatsappEnabled: false })).toBe(
        SWITCH_FALLBACK,
      );
    }

    // Every other section is untouched by the flag.
    expect(resolveSwitchTarget("/contacts", "admin", { whatsappEnabled: false })).toBe(
      "/contacts",
    );
    expect(resolveSwitchTarget("/chat", "admin", { whatsappEnabled: false })).toBe(
      SWITCH_FALLBACK,
    );
  });

  it("keeps an admin in the inbox when that business does run WhatsApp", () => {
    expect(resolveSwitchTarget("/inbox", "admin", WITH_WHATSAPP)).toBe("/inbox");
    expect(resolveSwitchTarget("/whatsapp", "admin", WITH_WHATSAPP)).toBe("/whatsapp");
    // Role still wins over the flag: an agent has no /whatsapp either way.
    expect(resolveSwitchTarget("/whatsapp", "agent", WITH_WHATSAPP)).toBe(SWITCH_FALLBACK);
  });

  it("refuses anything it does not recognise rather than passing it through", () => {
    // `pathname` arrives in a form field. A resolver that echoed it back
    // would make the switcher an open redirect.
    expect(resolveSwitchTarget("//evil.example.com", "admin")).toBe(SWITCH_FALLBACK);
    expect(resolveSwitchTarget("https://evil.example.com", "admin")).toBe(SWITCH_FALLBACK);
    expect(resolveSwitchTarget("/../../etc/passwd", "admin")).toBe(SWITCH_FALLBACK);
    expect(resolveSwitchTarget("/tenants", "admin")).toBe(SWITCH_FALLBACK);
    expect(resolveSwitchTarget("not-a-path", "admin")).toBe(SWITCH_FALLBACK);
    expect(resolveSwitchTarget("", "admin")).toBe(SWITCH_FALLBACK);
    expect(resolveSwitchTarget(null, "admin")).toBe(SWITCH_FALLBACK);
    expect(resolveSwitchTarget(undefined, "admin")).toBe(SWITCH_FALLBACK);
  });

  it("does not match a section by prefix alone", () => {
    // `/contactsomething` is not the contacts section.
    expect(resolveSwitchTarget("/contactsomething", "admin")).toBe(SWITCH_FALLBACK);
  });
});
