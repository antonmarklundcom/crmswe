import { checkRateLimit } from "@/lib/rate-limit";

// Credential endpoints had no limiter at all: an attacker could try
// passwords against a known email as fast as the network allowed, and a
// forgot-password loop could be used to mail-bomb a user (PLAN.md §13 H3
// #4). Two windows, because they answer different attacks — one IP spraying
// many accounts, and many IPs hammering one account.

const IP_LIMIT = 20;
const EMAIL_LIMIT = 6;
const WINDOW_MS = 10 * 60 * 1000;

/** Better Auth paths that accept credentials or trigger an email. */
const GUARDED = [
  "/sign-in/email",
  "/forget-password",
  "/request-password-reset",
  "/reset-password",
];

export function isGuardedAuthPath(pathname: string): boolean {
  return GUARDED.some((path) => pathname.endsWith(path));
}

/** First proxy hop; Hostinger fronts the app, so the socket address is the
 * proxy's, not the client's. Falls back to a shared bucket rather than to no
 * limit — an unknown IP must not be the way around the limiter. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkLoginAttempt(input: { ip: string; email?: string | null }): boolean {
  const byIp = checkRateLimit(`auth:ip:${input.ip}`, IP_LIMIT, WINDOW_MS);
  const email = input.email?.trim().toLowerCase();
  const byEmail = email
    ? checkRateLimit(`auth:email:${email}`, EMAIL_LIMIT, WINDOW_MS)
    : { limited: false };

  return byIp.limited || byEmail.limited;
}
