// Shared in-memory fixed-window rate limiter for public-facing routes
// (PLAN.md §10 1H #2). Extracted from the per-site limiter that
// modules/sites/ingest.ts already used for the lead ingest API, so every
// public route gets the same behavior instead of reinventing it.
//
// Limitation, documented here rather than hidden: this is process-local
// memory, sound only because Hostinger runs a single Node process (§2.1). A
// key's count resets on deploy/restart, and if the app is ever scaled to
// multiple instances this must move to MySQL (or Redis) to stay accurate
// across processes.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  limited: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Fixed-window limiter keyed by an arbitrary string (site id, IP, token,
 * etc.). Call once per request; each namespace should use its own key
 * prefix so unrelated routes can't collide on the same bucket.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { limited: false, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  return {
    limited: bucket.count > limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

// Periodic sweep so long-lived processes (the Hostinger app itself) don't
// accumulate stale buckets forever. Harmless if it never fires in
// short-lived contexts (tests, serverless) — it's just memory hygiene.
if (typeof setInterval !== "undefined") {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key);
    }
  }, 5 * 60_000);
  sweep.unref?.();
}
