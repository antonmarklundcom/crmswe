import { storage } from "@/lib/storage";
import type { TenantContext } from "@/modules/tenancy/context";
import { getPrimaryAccount } from "@/modules/whatsapp/accounts";
import { getOrCreateConversation } from "@/modules/whatsapp/inbox";
import { sendDocument } from "@/modules/whatsapp/send";

// Delivery, shared by every document a tenant sends a customer (PLAN.md
// §13 H9). Quotes and notas de venta had the same fifty lines twice, and
// SIFEN (§9) would have made it three times.
//
// The two halves are deliberately separate: storing a PDF must succeed for
// the document to exist at all, while WhatsApp failing is an *expected*
// outcome (a closed 24-hour window, a disconnected number) that leaves the
// public link as the delivery. Callers decide what a failed send means for
// their own status — sending a quote advances it, sending a nota de venta
// deliberately doesn't.

export type StoredPdf = { key: string; pdf: Buffer };

/** Renders nothing itself: the caller passes the bytes, this owns where they
 * go. Key shape is `<kind>/<tenant>/<id>.pdf`, unchanged from both callers. */
export async function storeDocumentPdf(
  ctx: TenantContext,
  input: { kind: string; id: string; pdf: Buffer },
): Promise<StoredPdf> {
  const key = `${input.kind}/${ctx.tenantId}/${input.id}.pdf`;
  await storage.put(key, input.pdf, "application/pdf");
  return { key, pdf: input.pdf };
}

export type WhatsappDeliveryResult = {
  /** Null when WhatsApp couldn't be used — the public link is then the
   * delivery. */
  messageId: string | null;
  whatsappError?: string;
};

/**
 * Sends an already-stored PDF to a contact over WhatsApp as a document
 * message. Never throws for a delivery failure: the reason comes back for
 * the UI to show, because the document and its public link still exist.
 */
export async function sendDocumentOverWhatsapp(
  ctx: TenantContext,
  input: { contactId: string; link: string; filename: string; caption: string },
): Promise<WhatsappDeliveryResult> {
  const account = await getPrimaryAccount(ctx);
  if (!account) {
    // Not a translated string on purpose: it is stored on the activity and
    // echoed to the rep, and the UI maps it — same rule as the thrown codes
    // (§13 H5 #4).
    return { messageId: null, whatsappError: "no_whatsapp_account" };
  }

  try {
    const conversation = await getOrCreateConversation(ctx, account.id, input.contactId);
    const messageId = await sendDocument(ctx, {
      conversationId: conversation.id,
      link: input.link,
      filename: input.filename,
      caption: input.caption,
    });
    return { messageId };
  } catch (err) {
    return {
      messageId: null,
      whatsappError: err instanceof Error ? err.message : String(err),
    };
  }
}
