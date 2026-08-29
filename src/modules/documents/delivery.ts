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
// with tenant branding, store it via the storage adapter, send it, with the
// public link /d/[token] as the fallback and preview.
//
// E-post becomes the primary channel in O3 (plan.md §5.3.2); the WhatsApp
// send below stays until then so the flow is never without a delivery path.

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
  /** Null when WhatsApp couldn't be used — the public link is then the delivery. */
  messageId: string | null;
  publicUrl: string;
  whatsappError?: string;
};

/**
 * Sends the faktura over WhatsApp. A closed 24h window is an expected
 * outcome, not a failure: the PDF and public link still exist, so the send
 * is reported as partial rather than throwing (§8's precedent).
 *
 * Deliberately does *not* change the document's status. Issuing is a
 * separate, explicit act — sending a PDF is delivery, not agreement, and
 * conflating them would let a WhatsApp hiccup decide whether a sale is on
 * the books.
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
  const tenant = await getTenant(ctx.tenantId);
  const t = await getTranslator(tenant?.locale, "pdf.faktura");
  const captionPrefix = t("caption");


  const delivery = await sendDocumentOverWhatsapp(ctx, {
    contactId: document.contactId,
    link: publicDocumentPdfUrl(document.publicToken),
    filename: `${document.number}.pdf`,
    caption: `${captionPrefix} ${document.number}`,
  });
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
      viaWhatsapp: messageId !== null,
      whatsappError,
    },
    userId: ctx.userId,
  });

  return { messageId, publicUrl, whatsappError };
}
