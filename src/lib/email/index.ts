import { Resend } from "resend";
import { env } from "@/lib/config/env";

// Transactional email (PLAN.md §10 1M). Optional by design, the same
// pattern next.config.ts already uses for Sentry: absent config means
// send() logs and no-ops rather than the app refusing to boot or a caller
// having to branch on whether email is configured. Every call site (invite,
// password reset, expiry warning) stays a plain `await send(...)` regardless
// of environment — local dev and a fresh prod deploy before RESEND_API_KEY
// is set behave the same way, just without an email actually going out.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

const client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Never throws — a failed or unconfigured send must not break the flow that
 * triggered it (accepting an invite still has to work; a request to reset a
 * password already returns a generic "check your email" regardless per
 * Better Auth's own timing-attack mitigation). Callers that need to know
 * whether the mail actually left get the boolean back; every current caller
 * also shows an on-screen fallback (the invite link, the "check your email"
 * copy) so a silent no-op here is never the only way the user finds out.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!client || !env.RESEND_FROM_EMAIL) {
    console.warn(
      `[email] RESEND_API_KEY/RESEND_FROM_EMAIL not set — skipping send to ${input.to}: ${input.subject}`,
    );
    return false;
  }

  try {
    const result = await client.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (result.error) {
      console.error("[email] Resend rejected the send:", result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}
