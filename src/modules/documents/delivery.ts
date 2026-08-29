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
  paymentAccountOf,
  sendDocumentEmail,
  tenantSender,
  type DocumentEmailResult,
} from "@/modules/renderable-document/email";
import { invoiceEmail, paymentReminderEmail } from "@/lib/email/templates";
import { isWhatsappEnabled } from "@/modules/whatsapp/feature";
import {
  amountPaid,
  getDocument,
  listDocumentItems,
  setDocumentPdfKey,
} from "./documents";
import { renderDocumentPdf } from "./pdf";
import { buyerLines, resolveBuyer, resolveSeller } from "./presentation";
import { parseVatSummary } from "@/lib/se/moms";
import { balanceOf, grossOf, paymentStateOf, type DocumentStatus, type DocumentType } from "./types";

// Thrown messages are stable codes, not copy (PLAN.md §13 H5 #4): a
// literal Spanish sentence here is a string the user might see in an
// unknown language, and one nothing can translate. The UI turns these into
// the reader's own language — an action's form state where there is a form,
// the route group's error boundary where there isn't.

// Faktura delivery — the same shape as offert delivery (§8): render the PDF
// with tenant branding, store it via the storage adapter, then send the
// customer the public link /d/[token].
//
// E-post is the primary channel (plan.md §5.3.2). WhatsApp is still here and
// still works, for a tenant that has switched that channel on (§5.3.1).

export function publicDocumentUrl(token: string): string {
  return `${env.APP_URL}/d/${token}`;
}

/** Meta fetches this URL itself, so it has to be reachable without a session. */
export function publicDocumentPdfUrl(token: string): string {
  return `${env.APP_URL}/d/${token}/pdf`;
}

export async function generateDocumentPdf(
  ctx: TenantContext,
  documentId: string,
): Promise<Buffer> {
  const document = await getDocument(ctx, documentId);
  if (!document) throw new Error(`document_not_found:${documentId}`);

  const [items, contact, tenant, paid] = await Promise.all([
    listDocumentItems(ctx, document.id),
    getContact(ctx, document.contactId),
    getTenant(ctx.tenantId),
    amountPaid(ctx, document.id),
  ]);
  if (!contact) throw new Error("contact_not_found");

  const settings = (tenant?.settings ?? {}) as TenantSettings;

  // Parties come from the snapshot frozen at issue whenever there is one, so
  // a reprint reproduces the invoice rather than re-rendering it against
  // today's contact and tenant rows (plan.md §5.2.3).
  const seller = resolveSeller(document.sellerSnapshot, tenant);
  const buyer = resolveBuyer(document.buyerSnapshot, contact);
  const t = await getTranslator(tenant?.locale, "pdf.faktura");

  // A kreditfaktura names the faktura it reverses.
  const credited = document.creditsDocumentId
    ? await getDocument(ctx, document.creditsDocumentId)
    : null;

  const gross = grossOf(document);
  const pdf = await renderDocumentPdf({
    type: document.type as DocumentType,
    number: document.number,
    tenantName: tenant?.name ?? "",
    branding: settings.branding ?? {},
    seller,
    buyerLines: buyerLines(buyer, t("orgNr")),
    currency: document.currency,
    subtotal: document.subtotal,
    discount: document.discount,
    total: document.total,
    vatTotal: document.vatTotal,
    vatSummary: parseVatSummary(document.vatSummary),
    gross,
    amountPaid: paid,
    balance: balanceOf(gross, paid),
    state: paymentStateOf(document.status as DocumentStatus, gross, paid),
    dueAt: document.dueAt,
    deliveryDate: document.deliveryDate,
    issuedAt: document.issuedAt,
    ocrNumber: document.ocrNumber,
    paymentTermsDays: tenant?.paymentTermsDays ?? null,
    creditsNumber: credited?.number ?? null,
    notes: document.notes,
    createdAt: document.createdAt,
    locale: tenant?.locale,
    items: items.map((item) => ({
      description: item.description,
      qty: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      vatRateBps: item.vatRateBps,
    })),
  });

  const stored = await storeDocumentPdf(ctx, { kind: "documents", id: document.id, pdf });
  await setDocumentPdfKey(ctx, document.id, stored.key);

  return pdf;
}

export type SendDocumentResult = {
  /** Always present: the link *is* the delivery when no channel carries it. */
  publicUrl: string;
  email: DocumentEmailResult;
  /** Null when this tenant has no WhatsApp channel (plan.md §5.3.1). */
  messageId: string | null;
  whatsappError?: string;
};

/**
 * Sends the faktura to the customer: e-post first (plan.md §5.3.2), plus
 * WhatsApp for a tenant that runs that channel.
 *
 * No delivery failure throws. A contact with no address, an unconfigured
 * Resend, a closed 24h window — all expected, all reported back, none of
 * them able to take the invoice down with them: the PDF and public link
 * still exist and the rep can send the link by hand.
 *
 * Deliberately does *not* change the document's status. Issuing is a
 * separate, explicit act — sending a PDF is delivery, not agreement, and
 * conflating them would let a mail server decide whether a sale is on the
 * books.
 */
export async function sendDocumentToContact(
  ctx: TenantContext,
  documentId: string,
): Promise<SendDocumentResult> {
  const document = await getDocument(ctx, documentId);
  if (!document) throw new Error(`document_not_found:${documentId}`);
  if (document.status === "void") {
    throw new Error("document_void");
  }

  await generateDocumentPdf(ctx, document.id);

  const publicUrl = publicDocumentUrl(document.publicToken);
  const [tenant, contact] = await Promise.all([
    getTenant(ctx.tenantId),
    getContact(ctx, document.contactId),
  ]);
  const settings = (tenant?.settings ?? {}) as TenantSettings;

  // The seller comes from the snapshot frozen at issue where there is one,
  // so the bankgiro in the mail is the one printed on the invoice — not
  // whatever the tenant has configured today. A customer paying an old
  // invoice must pay the account it says on it.
  const seller = resolveSeller(document.sellerSnapshot, tenant);
  const credited = document.creditsDocumentId
    ? await getDocument(ctx, document.creditsDocumentId)
    : null;

  const mail = await invoiceEmail({
    tenantName: tenant?.name ?? "",
    contactName: contact?.name ?? "",
    number: document.number,
    // Brutto: `total` is exklusive moms, and what the customer owes is the
    // gross (the same distinction O2 fixed in the payments ledger).
    amount: grossOf(document),
    currency: document.currency,
    dueAt: document.dueAt,
    paymentAccount: paymentAccountOf(seller),
    ocrNumber: document.ocrNumber,
    creditsNumber: credited?.number ?? null,
    publicUrl,
    locale: tenant?.locale,
  });

  const email = await sendDocumentEmail(ctx, {
    to: contact?.email,
    subject: mail.subject,
    html: mail.html,
    sender: tenantSender(settings, tenant?.name ?? ""),
  });

  const t = await getTranslator(tenant?.locale, "pdf.faktura");
  const captionPrefix = t("caption");

  const delivery = isWhatsappEnabled(settings)
    ? await sendDocumentOverWhatsapp(ctx, {
        contactId: document.contactId,
        link: publicDocumentPdfUrl(document.publicToken),
        filename: `${document.number}.pdf`,
        caption: `${captionPrefix} ${document.number}`,
      })
    : { messageId: null as string | null, whatsappError: undefined };
  const { messageId, whatsappError } = delivery;

  await createActivity(ctx, {
    contactId: document.contactId,
    dealId: document.dealId ?? undefined,
    type: "system",
    payload: {
      kind: "document_sent",
      documentId: document.id,
      number: document.number,
      // Both figures, named — same shape as `document_issued`. An activity
      // payload carrying a bare "total" is read later by code that has no
      // way to know whether it meant netto or brutto.
      total: document.total,
      vatTotal: document.vatTotal,
      gross: grossOf(document),
      currency: document.currency,
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

/**
 * Betalningspåminnelse (plan.md §5.3.2). Manual: a rep presses it on a
 * faktura that is unpaid, and one mail goes out.
 *
 * Manual on purpose, not for lack of a scheduler — the flows engine could
 * carry it. Chasing a customer is a relationship decision, and a rule that
 * mails everyone whose invoice passed förfallodatum will, sooner or later,
 * chase the customer who paid yesterday into a bank account the CRM has not
 * reconciled yet. Automation belongs here once payment import exists
 * (plan.md §10), not before.
 *
 * Refuses on anything that is not an unpaid faktura, because each of those
 * would be a mail the tenant has to apologise for: a draft has no number a
 * customer has seen, a kreditfaktura is money going the other way, and a
 * settled invoice must never be chased.
 */
export type SendPaymentReminderResult = {
  publicUrl: string;
  email: DocumentEmailResult;
  /** What is still outstanding, in minor units — what the mail asked for. */
  balance: number;
};

export async function sendPaymentReminder(
  ctx: TenantContext,
  documentId: string,
): Promise<SendPaymentReminderResult> {
  const document = await getDocument(ctx, documentId);
  if (!document) throw new Error(`document_not_found:${documentId}`);
  if (document.status !== "issued") throw new Error("document_not_issued");
  if (document.type !== "faktura") throw new Error("document_not_faktura");

  const paid = await amountPaid(ctx, document.id);
  const gross = grossOf(document);
  const balance = balanceOf(gross, paid);
  if (balance <= 0) throw new Error("document_already_paid");

  const [tenant, contact] = await Promise.all([
    getTenant(ctx.tenantId),
    getContact(ctx, document.contactId),
  ]);
  const settings = (tenant?.settings ?? {}) as TenantSettings;
  const seller = resolveSeller(document.sellerSnapshot, tenant);
  const publicUrl = publicDocumentUrl(document.publicToken);

  const mail = await paymentReminderEmail({
    tenantName: tenant?.name ?? "",
    contactName: contact?.name ?? "",
    number: document.number,
    // The balance, not the invoice total: chasing the full amount after a
    // part payment is how a customer is asked to pay twice.
    amount: balance,
    currency: document.currency,
    dueAt: document.dueAt,
    overdue: !!document.dueAt && document.dueAt.getTime() < Date.now(),
    paymentAccount: paymentAccountOf(seller),
    ocrNumber: document.ocrNumber,
    publicUrl,
    locale: tenant?.locale,
  });

  const email = await sendDocumentEmail(ctx, {
    to: contact?.email,
    subject: mail.subject,
    html: mail.html,
    sender: tenantSender(settings, tenant?.name ?? ""),
  });

  // Recorded whether or not the mail left: "we tried to chase this on the
  // 12th and the contact had no address" is exactly what a rep needs to see
  // on the timeline before chasing again.
  await createActivity(ctx, {
    contactId: document.contactId,
    dealId: document.dealId ?? undefined,
    type: "system",
    payload: {
      kind: "payment_reminder_sent",
      documentId: document.id,
      number: document.number,
      balance,
      currency: document.currency,
      publicUrl,
      viaEmail: email.sent,
      emailTo: email.to,
      emailError: email.reason,
    },
    userId: ctx.userId,
  });

  return { publicUrl, email, balance };
}
