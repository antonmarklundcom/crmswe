import { env } from "@/lib/config/env";

/**
 * The one place the app decides which address belongs to the caller.
 *
 * `x-forwarded-for` is a list that grows **left to right**: each proxy
 * appends the address it saw the request come from. The leftmost entry is
 * therefore the only one no proxy vouches for — a client can send
 * `X-Forwarded-For: 1.2.3.4` itself and the chain will happily keep it at
 * the front. Reading position 0, which most of this repo used to do, means
 * an attacker picks their own rate-limit bucket and can have as many as they
 * like. Reading the *raw header string* — what the five public routes did —
 * is worse still: `1.2.3.4` and `1.2.3.4, 9.9.9.9` are two different
 * buckets, so varying the header defeats the limiter without even needing a
 * plausible address.
 *
 * Counting from the right fixes that, because the right-hand entries were
 * written by infrastructure we control. With `hops` trusted proxies in front
 * of the app, those proxies contributed the last `hops` entries, and the
 * first of them — index `length - hops` — is the address the outermost
 * trusted proxy actually observed. Everything to its left is caller-supplied
 * and ignored.
 *
 * `hops` defaults to `TRUSTED_PROXY_HOPS` (1), which is Hostinger's managed
 * Node.js hosting as deployed today: LiteSpeed proxies to the app process
 * and appends the connecting address. Putting Cloudflare (or any CDN) in
 * front adds a hop and becomes `TRUSTED_PROXY_HOPS=2` in hPanel — an env
 * change, not a code change. See docs/DEPLOY.md §10 for how to confirm
 * the real hop count against a live deploy.
 */

/** Longest possible textual IPv6 address — and the width of every
 * `ip_address varchar(45)` column in §4's schema. A raw multi-entry header
 * overflows it, which is how a two-hop chain turned lead ingest into a
 * "Data too long" 500; truncating here keeps the value storable. */
const MAX_LENGTH = 45;

/**
 * Normalizes one entry: drops the port that some proxies append (`1.2.3.4:53`,
 * `[2001:db8::1]:53`) so the same client always lands in the same bucket, and
 * caps the length so a hostile value can neither overflow a column nor grow
 * the limiter's key map without bound.
 */
function normalize(entry: string): string | null {
  let value = entry.trim();
  if (!value) return null;

  const bracketed = value.match(/^\[(.+)\](?::\d+)?$/);
  if (bracketed) {
    value = bracketed[1]!;
  } else if (/^[^:]+:\d+$/.test(value)) {
    // Exactly one colon: an IPv4 address with a port. A bare IPv6 address has
    // several colons and no brackets, so it is left alone.
    value = value.slice(0, value.lastIndexOf(":"));
  }

  return value.slice(0, MAX_LENGTH) || null;
}

/**
 * The caller's address, or `"unknown"` when no proxy header says.
 *
 * `"unknown"` is a shared bucket on purpose: an address the app cannot
 * determine must not be the way around a rate limit. It is one bucket for
 * every such request, not a free pass.
 */
export function clientIp(
  headers: Headers,
  hops: number = env.TRUSTED_PROXY_HOPS,
): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded.split(",");
    // Clamped rather than rejected: a chain shorter than configured means the
    // request arrived through fewer proxies than expected (a direct hit in
    // dev, a misconfigured `TRUSTED_PROXY_HOPS`), and the leftmost entry is
    // the best available answer. It is spoofable — which is exactly why the
    // hop count is documented as something to verify after deploying.
    const index = Math.max(0, entries.length - Math.max(1, hops));
    const picked = normalize(entries[index]!);
    if (picked) return picked;
  }

  const real = headers.get("x-real-ip");
  if (real) {
    const picked = normalize(real);
    if (picked) return picked;
  }

  return "unknown";
}

/**
 * The caller's address, or `undefined` when no proxy header says.
 *
 * For the columns that *record* where a request came from
 * (`lead_submissions.ip_address` and friends) rather than for keying a rate
 * limit: NULL is the honest answer there, where the literal string
 * `"unknown"` would read like an address someone reported.
 */
export function clientIpOrNull(headers: Headers, hops?: number): string | undefined {
  const ip = clientIp(headers, hops);
  return ip === "unknown" ? undefined : ip;
}
