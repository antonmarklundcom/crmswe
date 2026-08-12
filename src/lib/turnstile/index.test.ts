import { describe, expect, it, vi } from "vitest";
import {
  TURNSTILE_VERIFY_URL,
  verifyTurnstileToken,
  type TurnstileVerifyInput,
} from "./index";

// No network: every case injects its own fetch. The suite also asserts the
// short-circuit paths make no call at all, which is what keeps a missing
// token cheap on a bot flood.

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function verify(overrides: Partial<TurnstileVerifyInput> & { fetchImpl: typeof fetch }) {
  return verifyTurnstileToken({ secret: "0x-secret", token: "tok", ...overrides });
}

describe("verifyTurnstileToken", () => {
  it("accepts a token Cloudflare confirms", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: true, hostname: "dentista.com.py", challenge_ts: "2026-01-01T00:00:00Z" }),
    ) as unknown as typeof fetch;

    const result = await verify({ fetchImpl });

    expect(result).toEqual({
      ok: true,
      hostname: "dentista.com.py",
      challengeTs: "2026-01-01T00:00:00Z",
    });
  });

  it("posts the secret, token and remote IP as form-encoded siteverify fields", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }));

    await verifyTurnstileToken({
      secret: "0x-secret",
      token: "tok",
      remoteIp: "200.10.1.5",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("0x-secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("200.10.1.5");
  });

  it("omits remoteip when the caller has no IP", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }));
    await verifyTurnstileToken({
      secret: "s",
      token: "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(body.has("remoteip")).toBe(false);
  });

  it("rejects a missing token without calling Cloudflare", async () => {
    const fetchImpl = vi.fn();
    for (const token of [null, undefined, ""]) {
      const result = await verifyTurnstileToken({
        secret: "s",
        token,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(result).toEqual({ ok: false, reason: "missing-token" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a missing secret without calling Cloudflare", async () => {
    const fetchImpl = vi.fn();
    const result = await verifyTurnstileToken({
      secret: "",
      token: "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, reason: "missing-secret" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces Cloudflare's error codes on a rejected token", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: false, "error-codes": ["timeout-or-duplicate", "invalid-input-response"] }),
    ) as unknown as typeof fetch;

    expect(await verify({ fetchImpl })).toEqual({
      ok: false,
      reason: "timeout-or-duplicate,invalid-input-response",
    });
  });

  it("falls back to a generic reason when a rejection carries no codes", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false })) as unknown as typeof fetch;
    expect(await verify({ fetchImpl })).toEqual({ ok: false, reason: "rejected" });
  });

  it("treats a non-2xx siteverify response as a failure, not a pass", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503)) as unknown as typeof fetch;
    expect(await verify({ fetchImpl })).toEqual({ ok: false, reason: "http-503" });
  });

  it("treats a network error as a failure rather than throwing at the caller", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await verify({ fetchImpl })).toEqual({ ok: false, reason: "network-error" });
  });

  it("times out instead of hanging a form submit", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    expect(await verify({ fetchImpl, timeoutMs: 5 })).toEqual({ ok: false, reason: "timeout" });
  });

  it("does not treat a malformed JSON body as success", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    })) as unknown as typeof fetch;

    expect(await verify({ fetchImpl })).toEqual({ ok: false, reason: "network-error" });
  });
});
