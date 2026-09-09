import { Resend } from "resend";
import { env } from "@/lib/config/env";
import type { TenantContext } from "@/modules/tenancy/context";
import { logEmail } from "@/modules/tenancy/email-log";
import { checkPlanLimit } from "@/modules/tenancy/limits";
import { senderFor } from "./sender";

// Transactional email (PLAN.md §10 1M; plan.md §5.3.2, where it becomes the
// product's primary channel rather than a side door; extended by §15.1/§15.8
// P4 for per-tenant sending identity). Optional by design, the same pattern
// next.config.ts already uses for Sentry: absent config means send() logs
// and no-ops rather than the app refusing to boot or a caller having to
// branch on whether email is configured. Every call site (invite, password
// reset, expiry warning, offert, faktura, påminnelse) stays a plain
// `await sendEmail(...)` regardless of environment — local dev and a fresh
// prod deploy before RESEND_API_KEY is set behave the same way, just without
// an email actually going out.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /**
   * Display name to put in front of the platform sender, e.g.
   * `Nordvik Bygg AB <fakturor@crmswe.se>`. The *address* stays the verified
   * one — see `from` below.
   */
  fromName?: string;
  /**
   * Overrides `senderFor(ctx)`'s own resolution — most callers with a `ctx`
   * don't need this; it exists for a caller that already computed a sender
   * for another reason. Only pass an address on a domain that is verified in
   * Resend (SPF + DKIM): an unverified sender is what makes an invoice land
   * in skräpposten, or bounce.
   */
  from?: string;
  /**
   * Where the customer's reply goes. The whole reason a tenant can be the
   * sender in any meaningful sense without owning the sending domain: the
   * mail leaves from the platform, but hitting reply reaches the företag
   * (sweden-business-apps §6).
   */
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  /**
   * The tenant this send is for. Two things ride on it: `senderFor(ctx)`
   * resolves the tenant's own sending identity when `from`/`replyTo` are not
   * given explicitly (PLAN.md §15.1) — an existing call site like
   * automations/actions.ts's `send_email` action picks up its own domain the
   * moment it starts passing `ctx`, with no other change — and every send
   * gets an `email_log` row to count against `maxEmailsPerDay`. Absent only
   * for the handful of callers that run before any tenant is known (password
   * reset, an invite not yet tied to a session) — those stay unlogged and
   * unresolved exactly as before this phase.
   */
  ctx?: TenantContext;
  /** `automated` is the only kind the plan's `maxEmailsPerDay` cap counts —
   *  a transactional send (invite, reset, "skicka som e-post" on a document)
   *  always goes out regardless of volume. Defaults to `transactional`. */
  kind?: "transactional" | "automated";
};

export type EmailResult = {
  /** Whether the message actually left. False for both a refusal and the log driver. */
  sent: boolean;
  /** `log` means nothing was sent — Resend is not configured in this environment. */
  driver: "resend" | "log";
  /** Stable-ish reason when `sent` is false; for logs, not for users. */
  error?: string;
};

const client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/** `Name <address>`, with any character that could inject a second header or
 * break the display name out of its quotes removed. `fromName` reaches here
 * from tenant settings, so it is input, not a constant. */
function formatSender(address: string, name?: string): string {
  const clean = name?.replace(/["\\\r\n<>]/g, "").trim();
  return clean ? `${clean} <${address}>` : address;
}

/**
 * Never throws — a failed or unconfigured send must not break the flow that
 * triggered it (accepting an invite still has to work; a request to reset a
 * password already returns a generic "check your email" regardless per
 * Better Auth's own timing-attack mitigation; issuing a faktura must not
 * depend on a mail server). Callers that need to know whether the mail
 * actually left read `sent`, and every one of them also shows an on-screen
 * fallback — the invite link, the "check your email" copy, the public
 * document link — so a silent no-op here is never the only way the user
 * finds out.
 */
export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  const kind = input.kind ?? "transactional";

  if (input.ctx && kind === "automated") {
    const limit = await checkPlanLimit(input.ctx.tenantId, "maxEmailsPerDay");
    if (!limit.allowed) {
      await logEmail(input.ctx, { to: input.to, subject: input.subject, kind, status: "skipped" });
      return { sent: false, driver: "log", error: "plan_limit_reached" };
    }
  }

  let from = input.from;
  let replyTo = input.replyTo;
  if (input.ctx && (from === undefined || replyTo === undefined)) {
    const resolved = await senderFor(input.ctx);
    from = from ?? resolved.from;
    replyTo = replyTo ?? resolved.replyTo;
  }
  from = from || env.RESEND_FROM_EMAIL;

  if (!client || !from) {
    // The log driver (plan.md §4.5: a missing env degrades, it never blocks).
    // Deliberately loud and complete enough to work from: in local dev this
    // *is* the mail client, and the whole point of an offert or faktura mail
    // is the public link inside it, so the link is logged rather than the
    // developer being told an email they cannot read was skipped.
    console.warn(
      [
        "[email] RESEND_API_KEY/RESEND_FROM_EMAIL not set — nothing sent.",
        `  to:       ${input.to}`,
        `  subject:  ${input.subject}`,
        replyTo ? `  reply-to: ${replyTo}` : null,
        ...linksIn(input.html).map((link) => `  link:     ${link}`),
      ]
        .filter(Boolean)
        .join("\n"),
    );
    if (input.ctx) {
      await logEmail(input.ctx, { to: input.to, subject: input.subject, kind, status: "skipped" });
    }
    return { sent: false, driver: "log", error: "email_not_configured" };
  }

  try {
    const result = await client.emails.send({
      from: formatSender(from, input.fromName),
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(replyTo ? { replyTo } : {}),
      attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    });
    if (result.error) {
      console.error("[email] Resend rejected the send:", result.error);
      if (input.ctx) {
        await logEmail(input.ctx, { to: input.to, subject: input.subject, kind, status: "failed" });
      }
      return { sent: false, driver: "resend", error: result.error.message };
    }
    if (input.ctx) {
      await logEmail(input.ctx, {
        to: input.to,
        subject: input.subject,
        kind,
        status: "sent",
        providerId: result.data?.id,
      });
    }
    return { sent: true, driver: "resend" };
  } catch (err) {
    console.error("[email] send failed:", err);
    if (input.ctx) {
      await logEmail(input.ctx, { to: input.to, subject: input.subject, kind, status: "failed" });
    }
    return {
      sent: false,
      driver: "resend",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** The hrefs in a template, so the log driver can print the link that is the
 * entire payload of an offert or faktura mail. */
function linksIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}
