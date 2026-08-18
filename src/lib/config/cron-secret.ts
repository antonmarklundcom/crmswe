import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";

// The cron/health routes all compared the header with `!==`, which returns as
// soon as two bytes differ and so leaks the secret one character at a time to
// anyone who can time the response (PLAN.md §13 H3 #5). Comparing SHA-256
// digests keeps the compare constant-time *and* fixed-length, so a wrong
// guess can't be distinguished by its length either.
export function isValidCronSecret(provided: string | null | undefined): boolean {
  if (!provided) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(env.CRON_SECRET));
}
