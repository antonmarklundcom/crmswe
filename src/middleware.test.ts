import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CRM_ROBOTS_BODY,
  crmRobotsBody,
  isAppHost,
  isPublicPath,
  resolveHostRedirect,
} from "./middleware";
import { APEX_HOST, APP_HOST } from "./lib/config/hosts";

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

  it("allows the public booking pages and the embedded chat widget", () => {
    // Both of these shipped *missing* from the allowlist. The failure is the
    // confusing kind this whole suite exists for: a customer opening the
    // manage link a business WhatsApp'd them got the CRM login page, and the
    // chat widget iframe 302'd on every third-party site that embedded it.
    expect(isPublicPath("/b/barberia-central/corte")).toBe(true);
    expect(isPublicPath("/b/g/tok123")).toBe(true);
    expect(isPublicPath("/w/wk_abc123")).toBe(true);
  });

  it("does not treat a lookalike prefix as public", () => {
    // "/documents" must not be matched by the "/d/" prefix.
    expect(isPublicPath("/documents")).toBe(false);
    expect(isPublicPath("/deals")).toBe(false);
  });
});

// Host awareness (MARKETING_SITE_PLAN.md §4). One app answers two products
// on two hostnames, so "is this path public" stopped being a property of the
// path alone. The failure modes are asymmetric and both bad: too strict on
// the apex means the marketing site 302s visitors to a CRM login page, too
// loose on crm.* means the CRM is wide open. Hence a test per direction.

describe("isPublicPath, host-aware", () => {
  const apex = APEX_HOST;
  const crm = APP_HOST;

  it("keeps the strict allowlist on the crm host", () => {
    expect(isPublicPath("/dashboard", crm)).toBe(false);
    expect(isPublicPath("/pipeline", crm)).toBe(false);
    expect(isPublicPath("/tenants", crm)).toBe(false);
    expect(isPublicPath("/sa-funkar-det", crm)).toBe(false);
    expect(isPublicPath("/login", crm)).toBe(true);
    expect(isPublicPath("/", crm)).toBe(true);
  });

  it("opens every marketing route on the apex host", () => {
    for (const path of ["/", "/sa-funkar-det", "/kontakt", "/om-oss"]) {
      expect(isPublicPath(path, apex)).toBe(true);
    }
  });

  it("does not let a marketing host blanket-open a path the app protects", () => {
    // A CRM path reached on the apex is public only in the sense that the
    // middleware lets it through — resolveHostRedirect below has already
    // bounced it to crm.* by the time this matters. What must never happen
    // is the reverse: the apex rule leaking onto the crm host.
    expect(isPublicPath("/dashboard", crm)).toBe(false);
    expect(isPublicPath("/dashboard", `www.${apex}`)).toBe(true);
  });

  it("routes /api through the allowlist on every host, never the host blanket", () => {
    // Same API on both hostnames; it must not become public *because of* the
    // host, only because "/api" is on the allowlist.
    expect(isPublicPath("/api/v1/leads", apex)).toBe(true);
    expect(isPublicPath("/api/v1/leads", crm)).toBe(true);
  });

  it("treats localhost and preview hostnames as marketing hosts", () => {
    // Matches the host check page.tsx has always used: only crm.* is the app.
    expect(isPublicPath("/sa-funkar-det", "localhost:3000")).toBe(true);
    expect(isPublicPath("/dashboard", "srv123.hostingersite.com")).toBe(true);
  });

  it("behaves exactly like the old allowlist when no host is passed", () => {
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/login")).toBe(true);
  });
});

describe("isAppHost", () => {
  it("recognises only the crm subdomain", () => {
    expect(isAppHost(APP_HOST)).toBe(true);
    expect(isAppHost(`${APP_HOST}:3000`)).toBe(true);
    expect(isAppHost(APEX_HOST)).toBe(false);
    expect(isAppHost(`www.${APEX_HOST}`)).toBe(false);
    expect(isAppHost("localhost:3000")).toBe(false);
    expect(isAppHost(null)).toBe(false);
  });
});

describe("crmRobotsBody", () => {
  it("serves a disallow-all robots.txt on the crm host only", () => {
    expect(crmRobotsBody("crm.crmswe.se", "/robots.txt")).toBe(CRM_ROBOTS_BODY);
    expect(CRM_ROBOTS_BODY).toContain("Disallow: /");
  });

  it("leaves the apex, preview and localhost robots to app/robots.ts", () => {
    expect(crmRobotsBody("crmswe.se", "/robots.txt")).toBeNull();
    expect(crmRobotsBody("www.crmswe.se", "/robots.txt")).toBeNull();
    expect(crmRobotsBody("localhost:3000", "/robots.txt")).toBeNull();
    expect(crmRobotsBody(null, "/robots.txt")).toBeNull();
  });

  it("only ever answers /robots.txt itself", () => {
    expect(crmRobotsBody("crm.crmswe.se", "/")).toBeNull();
    expect(crmRobotsBody("crm.crmswe.se", "/robots.txt/extra")).toBeNull();
  });
});

describe("resolveHostRedirect", () => {
  it("301s www to the apex, preserving path and query", () => {
    expect(resolveHostRedirect(`www.${APEX_HOST}`, "/sa-funkar-det", "?utm_source=ads")).toEqual({
      url: `https://${APEX_HOST}/sa-funkar-det?utm_source=ads`,
      status: 301,
    });
  });

  it("sends stale app bookmarks from the apex to the crm host", () => {
    for (const path of ["/dashboard", "/login", "/pipeline", "/contacts/abc123"]) {
      expect(resolveHostRedirect(APEX_HOST, path)).toEqual({
        url: `https://${APP_HOST}${path}`,
        status: 307,
      });
    }
  });

  it("leaves marketing paths on the apex alone", () => {
    for (const path of ["/", "/sa-funkar-det", "/kontakt", "/om-oss"]) {
      expect(resolveHostRedirect(APEX_HOST, path)).toBeNull();
    }
  });

  it("keeps shared customer links and the API on whichever host they were opened", () => {
    // A quote link sent over WhatsApp, or a site posting its leads, must not
    // be bounced to another hostname mid-request.
    for (const path of [
      "/api/v1/leads",
      "/q/tok",
      "/d/tok/pdf",
      "/f/acme/contacto",
      "/b/acme/corte",
      "/b/g/tok",
      "/w/wk_abc",
    ]) {
      expect(resolveHostRedirect(APEX_HOST, path)).toBeNull();
    }
  });

  it("does not match an app prefix that is only a lookalike", () => {
    // "/settings" is an app path; "/settings-de-privacidad" would be a
    // marketing URL and must not be redirected off the apex.
    expect(resolveHostRedirect(APEX_HOST, "/settings-de-privacidad")).toBeNull();
    expect(resolveHostRedirect(APEX_HOST, "/planes")).toBeNull();
  });

  it("never redirects development or preview hosts to production", () => {
    expect(resolveHostRedirect("localhost:3000", "/dashboard")).toBeNull();
    expect(resolveHostRedirect("srv123.hostingersite.com", "/login")).toBeNull();
    expect(resolveHostRedirect(null, "/dashboard")).toBeNull();
  });

  it("leaves the crm host untouched", () => {
    expect(resolveHostRedirect(APP_HOST, "/dashboard")).toBeNull();
    expect(resolveHostRedirect(APP_HOST, "/")).toBeNull();
  });
});

// The allowlist is a hand-maintained copy of a fact the filesystem already
// knows: everything under the (public) route group is, by construction,
// public. Every entry that has ever been forgotten (/d/, then /b/ and /w/)
// was forgotten the same way — a route group was added and the list wasn't.
// So the list is checked against the directory rather than against a
// developer's memory, and the next omission fails here instead of in
// production.
describe("the (public) route group is fully allowlisted", () => {
  const publicGroup = path.join(__dirname, "app", "(public)");

  const segments = readdirSync(publicGroup, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    // Route groups and dynamic segments are not URL segments of their own.
    .filter((entry) => !entry.name.startsWith("(") && !entry.name.startsWith("["))
    .map((entry) => entry.name);

  it("finds the segments it is supposed to be checking", () => {
    // Guards against the scan silently passing because it found nothing.
    expect(segments.length).toBeGreaterThan(0);
  });

  it.each(segments)("treats /%s/ as public", (segment) => {
    expect(isPublicPath(`/${segment}/anything`)).toBe(true);
  });
});

// The same reasoning one level out: the loaders in `public/` that *other
// people's sites* embed are fetched by visitors with no session here, and
// each one needs a hand-added entry in PUBLIC_EXACT. `w.js` shipped without
// one and was only noticed when `b.js` was written next to it.
//
// Scripts the marketing site loads for itself are exempt: they are only ever
// fetched from the apex host, where everything outside /api is public and
// there is no allowlist to forget. They are named here rather than inferred,
// so adding a new *embed* loader fails this test until someone decides which
// kind it is — which is the decision that was missed for `w.js`.
const MARKETING_ONLY_SCRIPTS = ["mk-motion.js"];

describe("every shipped embed loader is allowlisted", () => {
  const publicDir = path.join(__dirname, "..", "public");

  const loaders = readdirSync(publicDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name)
    .filter((name) => !MARKETING_ONLY_SCRIPTS.includes(name));

  it("finds the loaders it is supposed to be checking", () => {
    expect(loaders.length).toBeGreaterThan(0);
  });

  it.each(loaders)("serves /%s to a visitor with no session", (loader) => {
    expect(isPublicPath(`/${loader}`)).toBe(true);
  });
});
