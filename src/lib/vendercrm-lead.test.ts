import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { idempotencyKey, readAttribution, sendLead } from "./vendercrm-lead";

// The marketing contact form is the site's only conversion path, and every
// failure mode here is silent by design (sendLead swallows errors so a CRM
// outage can't show the visitor an error page). Silent means untested unless
// it's tested here.

describe("idempotencyKey", () => {
  it("is stable for the same phone within the same hour", () => {
    // The double-click and the timed-out-but-succeeded retry must collapse
    // into one contact rather than two the salesperson has to merge.
    expect(idempotencyKey("0981123456")).toBe(idempotencyKey("0981123456"));
  });

  it("differs per phone, and is long enough for the endpoint", () => {
    expect(idempotencyKey("0981123456")).not.toBe(idempotencyKey("0981123457"));
    // The endpoint requires 8–100 characters.
    expect(idempotencyKey("0981123456")).toHaveLength(64);
  });
});

describe("readAttribution", () => {
  it("reads the first-touch cookie written by vc-attribution.js", () => {
    const cookie = encodeURIComponent(
      JSON.stringify({ utm_source: "google", gclid: "abc", landing_page: "/metodo" }),
    );
    expect(readAttribution(cookie)).toEqual({
      utm_source: "google",
      gclid: "abc",
      landing_page: "/metodo",
    });
  });

  it("returns an empty object rather than throwing on a missing or corrupt cookie", () => {
    // A visitor with no cookie is the common case, not an error case.
    expect(readAttribution(undefined)).toEqual({});
    expect(readAttribution("not-json")).toEqual({});
    expect(readAttribution(encodeURIComponent('"a string"'))).toEqual({});
  });

  it("drops non-string and empty values so they can't reach the endpoint", () => {
    // Every attribution field is a bounded string server-side; an empty one
    // fails validation rather than being ignored.
    const cookie = encodeURIComponent(
      JSON.stringify({ utm_source: "", utm_medium: 42, utm_campaign: "verano" }),
    );
    expect(readAttribution(cookie)).toEqual({ utm_campaign: "verano" });
  });
});

describe("sendLead", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.VENDERCRM_API_KEY;
  });

  it("does not call the endpoint at all when no key is configured", async () => {
    delete process.env.VENDERCRM_API_KEY;

    await expect(sendLead({ phone: "0981123456", idempotency_key: "k".repeat(16) })).resolves.toEqual({
      ok: false,
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the key in the header and omits empty optional fields", async () => {
    process.env.VENDERCRM_API_KEY = "site_key";
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    await sendLead({
      phone: "0981123456",
      name: "Ana",
      // An empty string on email is a 422 from the endpoint — it has to be
      // omitted, not sent blank.
      email: "",
      message: undefined,
      idempotency_key: "k".repeat(16),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("site_key");
    expect(JSON.parse(String(init.body))).toEqual({
      phone: "0981123456",
      name: "Ana",
      idempotency_key: "k".repeat(16),
    });
  });

  it("never throws when the CRM is unreachable", async () => {
    // A visitor who filled in the form and got an error page is a lost
    // customer; the failure belongs in the log, not on their screen.
    process.env.VENDERCRM_API_KEY = "site_key";
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      sendLead({ phone: "0981123456", idempotency_key: "k".repeat(16) }),
    ).resolves.toEqual({ ok: false, status: 0 });
  });

  it("reports a rejected submission without throwing", async () => {
    process.env.VENDERCRM_API_KEY = "site_key";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 }),
    );

    await expect(
      sendLead({ phone: "0981123456", idempotency_key: "k".repeat(16) }),
    ).resolves.toEqual({ ok: false, status: 401 });
  });
});
