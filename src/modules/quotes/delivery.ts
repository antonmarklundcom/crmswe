import { env } from "@/lib/config/env";
import type { TenantContext } from "@/modules/tenancy/context";
import { getTenant } from "@/modules/tenancy/tenants";
import type { TenantSettings } from "@/modules/tenancy/settings";
import { getContact } from "@/modules/crm/contacts";
import { createActivity } from "@/modules/crm/activities";
import { getTranslator } from "@/lib/i18n/translator";
import {
  sendDocumentOverWhatsapp,
  storeDocumentPdf,
} from "@/modules/renderable-document/delivery";
import {
  sendDocumentEmail,
  tenantSender,
  type DocumentEmailResult,
} from "@/modules/renderable-document/email";
import { quoteEmail } from "@/lib/email/templates";
import { isWhatsappEnabled } from "@/modules/whatsapp/feature";
import { getQuote, listQuoteItems, quoteMoms, setQuotePdfKey, setQuoteStatus } from "./quotes";
import { renderQuotePdf } from "./pdf";

// Thrown messages are stable codes, not copy (PLAN.md §13 H5 #4): a
// literal Spanish sentence here is a string the user might see in an
// unknown language, and one nothing can translate. The UI turns these into
// the reader's own language — an action's form state where there is a form,
// the route group's error boundary where there isn't.

// Offert delivery (PLAN.md §8; plan.md §5.3.2): render the PDF with tenant
// branding, store it via the storage adapter, then send the customer the
// public link /q/[token] — by e-post, which is this edition's primary
// channel, and additionally over WhatsApp for a tenant that has that channel
// switched on.

export function publicQuoteUrl(token: string): string {
  return `${env.APP_URL}/q/${token}`;
}

/** Meta fetches this URL itself, so it has to be reachable without a session. */
export function publicQuotePdfUrl(token: string): string {
  return `${env.APP_URL}/q/${token}/pdf`;
}

export async function generateQuotePdf(ctx: TenantContext, quoteId: string): Promise<Buffer> {
  const quote = await getQuote(ctx, quoteId);
  if (!quote) throw new Error(`quote_not_found:${quoteId}`);

  const [items, contact, tenant] = await Promise.all([
    listQuoteItems(ctx, quote.id),
    getContact(ctx, quote.contactId),
    getTenant(ctx.tenantId),
  ]);
  if (!contact) throw new Error("contact_not_found");

  const settings = (tenant?.settings ?? {}) as TenantSettings;
  // Computed on read, not stored: an offert is still editable, so freezing a
  // moms summary onto it would only create something to go stale.
  const moms = quoteMoms(items, quote.discount);

  const pdf = await renderQuotePdf({
    number: quote.number,
    tenantName: tenant?.name ?? "",
    branding: settings.branding ?? {},
    contactName: contact.name,
    contactPhone: contact.phone,
    currency: quote.currency,
    subtotal: quote.subtotal,
    discount: quote.discount,
    total: quote.total,
    vatTotal: moms.vatTotal,
    vatSummary: moms.summary,
    gross: moms.gross,
    validUntil: quote.validUntil,
    notes: quote.notes,
    createdAt: quote.createdAt,
    locale: tenant?.locale,
    items: items.map((item) => ({
      description: item.description,
      qty: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      vatRateBps: item.vatRateBps,
    })),
  });

  const stored = await storeDocumentPdf(ctx, { kind: "quotes", id: quote.id, pdf });
  await setQuotePdfKey(ctx, quote.id, stored.key);

  return pdf;
}

export type SendQuoteResult = {
  /** Always present: the link *is* the delivery when no channel carries it. */
  publicUrl: string;
  email: DocumentEmailResult;
  /** Null when this tenant has no WhatsApp channel (plan.md §5.3.1). */
  messageId: string | null;
  whatsappError?: string;
};

/**
 * Sends the offert to the customer and flips it to `sent` with a `quote_sent`
 * activity (§8).
 *
 * E-post first (plan.md §5.3.2), WhatsApp as well for a tenant that runs it.
 * **Neither is allowed to fail the send.** A contact with no address, an
 * environment with no Resend key, a closed 24h WhatsApp window — all are
 * expected outcomes, not errors: the PDF and the public link exist either
 * way, so the status still advances and the reasons are reported back for
 * the UI to show. An offert that could not be mailed is one the rep sends
 * by hand from the link; an offert that threw would be one nobody sends.
 */
export async function sendQuote(ctx: TenantContext, quoteId: string): Promise<SendQuoteResult> {
  const quote = await getQuote(ctx, quoteId);
  if (!quote) throw new Error(`quote_not_found:${quoteId}`);

  await generateQuotePdf(ctx, quote.id);

  const publicUrl = publicQuoteUrl(quote.publicToken);
  const [tenant, contact, items] = await Promise.all([
    getTenant(ctx.tenantId),
    getContact(ctx, quote.contactId),
    listQuoteItems(ctx, quote.id),
  ]);
  const settings = (tenant?.settings ?? {}) as TenantSettings;

  // The customer reads this, so everything in it follows the *tenant's*
  // locale, never the rep's (§13 H5 #4) — same rule as the PDF beside it.
  const mail = await quoteEmail({
    tenantName: tenant?.name ?? "",
    contactName: contact?.name ?? "",
    number: quote.number,
    // An offert quotes inklusive moms (§5.2), and its moms is computed on
    // read rather than frozen, so the figure in the mail comes from the same
    // call the PDF and the public page use.
    amount: quoteMoms(items, quote.discount).gross,
    currency: quote.currency,
    validUntil: quote.validUntil,
    publicUrl,
    locale: tenant?.locale,
  });

  const email = await sendDocumentEmail(ctx, {
    to: contact?.email,
    subject: mail.subject,
    html: mail.html,
    sender: tenantSender(settings, tenant?.name ?? ""),
  });

  const t = await getTranslator(tenant?.locale, "pdf.quote");
  const captionPrefix = t("caption");

  const delivery = isWhatsappEnabled(settings)
    ? await sendDocumentOverWhatsapp(ctx, {
        contactId: quote.contactId,
        link: publicQuotePdfUrl(quote.publicToken),
        filename: `${quote.number}.pdf`,
        caption: `${captionPrefix} ${quote.number}`,
      })
    : { messageId: null as string | null, whatsappError: undefined };
  const { messageId, whatsappError } = delivery;

  await setQuoteStatus(ctx, quote.id, "sent");
  await createActivity(ctx, {
    contactId: quote.contactId,
    dealId: quote.dealId ?? undefined,
    type: "quote_sent",
    payload: {
      quoteId: quote.id,
      number: quote.number,
      total: quote.total,
      currency: quote.currency,
      publicUrl,
      viaEmail: email.sent,
      emailTo: email.to,
      emailError: email.reason,
      viaWhatsapp: messageId !== null,
      whatsappError,
    },
    userId: ctx.userId,
  });

  return { publicUrl, email, messageId, whatsappError };
}
