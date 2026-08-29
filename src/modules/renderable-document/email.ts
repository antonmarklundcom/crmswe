import { sendEmail, type EmailResult } from "@/lib/email";
import { formatBankgiro, formatPlusgiro } from "@/lib/se/identity";
import type { TenantContext } from "@/modules/tenancy/context";
import type { TenantSettings } from "@/modules/tenancy/settings";
import type { SellerSnapshot } from "@/modules/documents/types";

// E-post delivery, shared by every document a tenant sends a customer
// (plan.md §5.3.2). The sibling of ./delivery.ts's WhatsApp half, and now the
// primary of the two: Sweden is e-post-first (§1.7).
//
// Same contract as that half, for the same reason: **this never throws.** A
// send that does not happen — no address on the contact, no Resend key in
// this environment, a bounce — leaves the document and its public link
// exactly where they were, and the caller reports it rather than losing the
// invoice over it. Issuing a faktura is a fiscal act; delivering it is not,
// and a mail server must never get a vote on the first.

export type DocumentEmailResult = {
  /** Whether the mail actually left. */
  sent: boolean;
  /** Where it went, for the activity feed. Null when there was nowhere to send. */
  to: string | null;
  /**
   * Why not, when `sent` is false. A stable code, not copy — the UI resolves
   * it, same rule as the thrown codes elsewhere (PLAN.md §13 H5 #4):
   *   `no_email`             the contact has no address
   *   `email_not_configured` no Resend key here; the log driver ran instead
   *   anything else          the provider's own message, for a log
   */
  reason?: string;
};

/**
 * Who the mail comes from, resolved per tenant (plan.md §5.3.2;
 * sweden-business-apps §6).
 *
 * The address stays the platform's verified sender unless the tenant has
 * gone and verified a domain of their own in Resend — mail from a domain
 * with no SPF/DKIM for the sender lands in skräpposten, and an invoice in
 * skräpposten is an invoice that does not get paid. What the customer
 * actually reads is the display name, which is the tenant's; and replies go
 * to the tenant's own address. That combination is what makes the platform
 * invisible without lying about who sent the mail.
 */
export function tenantSender(
  settings: TenantSettings | null | undefined,
  tenantName: string,
): { fromName: string; from?: string; replyTo?: string } {
  const email = settings?.email;
  return {
    fromName: email?.fromName?.trim() || tenantName,
    from: email?.fromEmail?.trim() || undefined,
    replyTo: email?.replyTo?.trim() || undefined,
  };
}

/**
 * The payment account to print in a mail: bankgiro if the tenant has one,
 * otherwise plusgiro, otherwise nothing.
 *
 * Bankgiro first because it is the ordinary B2B account in Sweden, and
 * because offering a customer two accounts to choose between is how a
 * payment arrives somewhere the tenant is not reconciling. Formatted the way
 * it is written on paper, so it can be typed into a bank app from the mail.
 */
export function paymentAccountOf(seller: SellerSnapshot | null): string | null {
  if (!seller) return null;
  if (seller.bankgiro) return formatBankgiro(seller.bankgiro) ?? seller.bankgiro;
  if (seller.plusgiro) return formatPlusgiro(seller.plusgiro) ?? seller.plusgiro;
  return null;
}

/**
 * Sends one already-rendered document mail to a contact.
 *
 * `_ctx` is taken but unused: every caller has one, the tenant scoping has
 * already happened by the time a rendered template arrives here, and taking
 * it keeps this the same shape as `sendDocumentOverWhatsapp` next door.
 */
export async function sendDocumentEmail(
  _ctx: TenantContext,
  input: {
    to: string | null | undefined;
    subject: string;
    html: string;
    sender: ReturnType<typeof tenantSender>;
  },
): Promise<DocumentEmailResult> {
  const to = input.to?.trim();
  if (!to) {
    // Not an error: plenty of contacts are captured by phone alone, and the
    // public link still exists for the rep to send by hand.
    return { sent: false, to: null, reason: "no_email" };
  }

  const result: EmailResult = await sendEmail({
    to,
    subject: input.subject,
    html: input.html,
    fromName: input.sender.fromName,
    from: input.sender.from,
    replyTo: input.sender.replyTo,
  });

  return result.sent
    ? { sent: true, to }
    : { sent: false, to, reason: result.error ?? "email_failed" };
}
