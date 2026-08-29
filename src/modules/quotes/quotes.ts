import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteItems, quotes } from "@/db/schema";
import { newId } from "@/lib/ids";
import { buildSystemTenantContext, type TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";
import { resolveVatRateBps } from "@/modules/tenancy/vat-rates";
import { computeDocumentMoms } from "@/lib/se/moms";
import { nextQuoteNumber } from "./numbering";
import { computeTotals, type QuoteLineInput } from "./totals";

export { computeTotals, type QuoteLineInput };

/** An offert line, with the momssats it is quoted at. */
export type QuoteItemInput = QuoteLineInput & { vatRateBps?: number | null };

// Quote documents (PLAN.md §8). Non-fiscal in Phase 1 — no SIFEN dependency,
// and deliberately separate from the future `invoices` tables (§4).

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export type CreateQuoteInput = {
  contactId: string;
  dealId?: string;
  currency?: string;
  discount?: number;
  validUntil?: Date;
  notes?: string;
  items: QuoteItemInput[];
};

export async function createQuote(ctx: TenantContext, input: CreateQuoteInput) {
  if (input.items.length === 0) {
    throw new Error("quote_needs_items");
  }

  const { lines, subtotal, discount, total } = computeTotals(input.items, input.discount);
  // An offert quotes a price *inklusive* the moms the customer will be
  // charged, so the rate is chosen here and carried through to the faktura it
  // converts into. The offert itself stores no moms total: it is mutable, so
  // its moms is computed on read (`quoteMoms`) rather than frozen.
  const rates = await Promise.all(
    input.items.map((item) => resolveVatRateBps(ctx, item.vatRateBps)),
  );
  const id = newId();
  const number = await nextQuoteNumber(ctx);

  await tenantDb(ctx)
    .insert(quotes)
    .values({
      id,
      contactId: input.contactId,
      dealId: input.dealId,
      number,
      status: "draft",
      currency: input.currency ?? ctx.currency,
      subtotal,
      discount,
      total,
      validUntil: input.validUntil,
      notes: input.notes,
      publicToken: randomBytes(24).toString("hex"),
    });

  for (const [index, line] of lines.entries()) {
    await tenantDb(ctx)
      .insert(quoteItems)
      .values({
        id: newId(),
        quoteId: id,
        productId: line.productId,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        vatRateBps: rates[index],
        vatAmount: computeDocumentMoms(
          [{ lineTotal: line.lineTotal, vatRateBps: rates[index] }],
        ).vatTotal,
        position: index,
      });
  }

  return getQuote(ctx, id);
}

/**
 * An offert's moms, computed on read.
 *
 * Unlike a faktura, an offert has no frozen moms summary — it may still
 * change, so freezing one would only create something to go stale. Running
 * the same engine the faktura will run means the offert quotes exactly the
 * amount the faktura will charge, to the öre.
 */
export function quoteMoms(
  items: Array<{ lineTotal: number; vatRateBps: number | null }>,
  discount: number,
  defaultRateBps = 0,
) {
  return computeDocumentMoms(
    items.map((item) => ({
      lineTotal: item.lineTotal,
      vatRateBps: item.vatRateBps ?? defaultRateBps,
    })),
    discount,
  );
}

export async function getQuote(ctx: TenantContext, id: string) {
  const [row] = await tenantDb(ctx).select(quotes, eq(quotes.id, id));
  return row ?? null;
}

export async function listQuoteItems(ctx: TenantContext, quoteId: string) {
  const rows = await tenantDb(ctx).select(quoteItems, eq(quoteItems.quoteId, quoteId));
  return rows.sort((a, b) => a.position - b.position);
}

export async function listQuotes(ctx: TenantContext) {
  const rows = await tenantDb(ctx).select(quotes);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listQuotesForContact(ctx: TenantContext, contactId: string) {
  const rows = await tenantDb(ctx).select(quotes, eq(quotes.contactId, contactId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Accepted/rejected are set by hand by the rep in Phase 1 — there is no
 * client-side accept button yet (§8), deliberately keeping the public view
 * read-only.
 */
export async function setQuoteStatus(ctx: TenantContext, id: string, status: QuoteStatus) {
  await tenantDb(ctx).update(quotes).set({ status }).where(eq(quotes.id, id));
  return getQuote(ctx, id);
}

export async function setQuotePdfKey(ctx: TenantContext, id: string, pdfStorageKey: string) {
  await tenantDb(ctx).update(quotes).set({ pdfStorageKey }).where(eq(quotes.id, id));
}

/**
 * Unauthenticated read for the public view /q/[token] — the token is the
 * secret (§8). The token lookup is the one platform-wide read this module
 * needs: it runs before any TenantContext can exist, exactly like tenancy's
 * invitation-token lookup and 1D's phone_number_id routing. Once the tenant
 * is known everything else goes back through tenantDb.
 */
export async function getPublicQuote(token: string) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.publicToken, token));
  if (!quote) return null;

  const ctx = await buildSystemTenantContext(quote.tenantId);
  if (!ctx) return null;

  return { quote, items: await listQuoteItems(ctx, quote.id), ctx };
}
