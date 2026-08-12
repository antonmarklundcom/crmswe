// Cloudflare Turnstile verification (PLAN.md §5.1 "what each site must add"
// #2, wired per-site in §5.2). Pure and injectable: the caller supplies the
// secret and, in tests, the fetch implementation — nothing here reads env or
// touches the database, so the unit suite makes no network call at all.
//
// Turnstile is the second lane's spam defense. The first lane (server-to-
// server ingest) is already protected by a secret key; the browser-facing
// paths — hosted form pages, and client sites that post through a webhook —
// have no secret to present, so they need a challenge instead.

export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The widget's field name; fixed by Cloudflare, not by us. */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

export type TurnstileVerifyResult =
  | { ok: true; hostname?: string; challengeTs?: string }
  | { ok: false; reason: string };

export type TurnstileVerifyInput = {
  secret: string;
  token: string | null | undefined;
  /** End-user IP, when the caller has one. Optional per Cloudflare's API. */
  remoteIp?: string;
  /** Injected in tests; defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
  /** Bounds a hung siteverify so a form submit can't hang with it. */
  timeoutMs?: number;
};

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Verifies a widget token against Cloudflare's siteverify endpoint.
 *
 * Failure is always a *reason string*, never a throw: the callers are a
 * public form action and a public API route, and both need to answer the
 * visitor rather than 500. The reasons are stable identifiers (not copy) —
 * user-facing Spanish lives in messages/es.json, per §1.2.
 */
export async function verifyTurnstileToken(
  input: TurnstileVerifyInput,
): Promise<TurnstileVerifyResult> {
  if (!input.secret) return { ok: false, reason: "missing-secret" };
  // A missing token is decided here rather than at Cloudflare: it is the
  // ordinary "bot posted straight at the endpoint" case, and it costs a
  // round trip to learn nothing.
  if (!input.token) return { ok: false, reason: "missing-token" };

  const doFetch = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({ secret: input.secret, response: input.token });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await doFetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false, reason: `http-${response.status}` };

    const data = (await response.json()) as SiteverifyResponse;
    if (data.success === true) {
      return { ok: true, hostname: data.hostname, challengeTs: data.challenge_ts };
    }

    const codes = data["error-codes"] ?? [];
    return { ok: false, reason: codes.length > 0 ? codes.join(",") : "rejected" };
  } catch (err) {
    // Includes the abort above. A Cloudflare outage must not become a
    // silent accept — the caller decides what an unverifiable token means.
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "network-error" };
  } finally {
    clearTimeout(timer);
  }
}
