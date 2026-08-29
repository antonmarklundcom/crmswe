"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/modules/tenancy/context";
import { moneyAmountSchema } from "@/lib/money-schema";
import { createQuote, setQuoteStatus } from "@/modules/quotes/quotes";
import { sendQuote } from "@/modules/quotes/delivery";
import { createDocumentFromQuote } from "@/modules/documents/documents";

// Amounts arrive as the user typed them — "1 495,50" — and become öre here
// (plan.md §1.2). The schema is built per request because how many decimals
// an amount may carry is a property of the tenant's currency.
function createQuoteSchema(currency: string) {
  const lineSchema = z.object({
    description: z.string().min(1).max(500),
    qty: z.coerce.number().int().min(1),
    unitPrice: moneyAmountSchema(currency),
    productId: z.string().optional(),
  });

  return z.object({
    contactId: z.string().min(1),
    dealId: z.string().optional(),
    discount: moneyAmountSchema(currency),
    validUntil: z.string().optional(),
    notes: z.string().max(5000).optional(),
    items: z.array(lineSchema).min(1),
  });
}

// useActionState-shaped (PLAN.md §10 1R #6): the builder keeps its own line
// items client-side, so the only field worth pointing an inline error at is
// the contact picker — a bad line (empty items array) has no single input to
// sit under and lands in the form-level slot instead.
export type QuoteField = "contactId";

export type QuoteFormState = {
  error: string | null;
  field: QuoteField | null;
  values: { contactId: string };
};

function parseItems(formData: FormData) {
  const descriptions = formData.getAll("description").map(String);
  const qtys = formData.getAll("qty").map(String);
  const prices = formData.getAll("unitPrice").map(String);
  const productIds = formData.getAll("productId").map(String);

  return descriptions
    .map((description, i) => ({
      description,
      qty: qtys[i],
      unitPrice: prices[i],
      productId: productIds[i] || undefined,
    }))
    // Blank rows are how the builder represents "not filled in yet".
    .filter((line) => line.description.trim().length > 0);
}

export async function createQuoteAction(
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const ctx = await requireTenantContext();
  const contactId = String(formData.get("contactId") ?? "");

  const parsed = createQuoteSchema(ctx.currency).safeParse({
    contactId,
    dealId: formData.get("dealId") || undefined,
    // A cleared discount box means no discount, not a rejected form.
    discount: String(formData.get("discount") ?? "").trim() || "0",
    validUntil: formData.get("validUntil") || undefined,
    notes: formData.get("notes") || undefined,
    items: parseItems(formData),
  });

  if (!parsed.success) {
    const issues = parsed.error.issues;
    if (issues.some((issue) => issue.path[0] === "contactId")) {
      return { error: "contactRequired", field: "contactId", values: { contactId } };
    }
    // Now that the amount inputs are inputMode="numeric" and the browser no
    // longer blocks the submit, these two failures are both reachable and
    // must not share a message: a filled-in line the server rejects (a
    // decimal price, qty 0) is a different problem from an empty builder.
    if (issues.some((issue) => issue.path[0] === "items" && issue.path.length > 1)) {
      return { error: "itemInvalid", field: null, values: { contactId } };
    }
    if (issues.some((issue) => issue.path[0] === "discount")) {
      return { error: "discountInvalid", field: null, values: { contactId } };
    }
    // No line filled in with a description — a form-level failure, since
    // there's no single input the builder can point at.
    return { error: "itemsRequired", field: null, values: { contactId } };
  }

  let quote;
  try {
    quote = await createQuote(ctx, {
      contactId: parsed.data.contactId,
      dealId: parsed.data.dealId,
      discount: parsed.data.discount,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : undefined,
      notes: parsed.data.notes,
      items: parsed.data.items,
    });
  } catch {
    return { error: "unknown", field: null, values: { contactId } };
  }

  revalidatePath("/quotes");
  redirect(`/quotes/${quote!.id}`);
}

// Hidden-id-only actions (PLAN.md §10 1R #6): every field these three post
// is a hidden input rendered from the quote already on screen — the id, and
// for the status buttons a fixed status — so a rejected submit has no
// user-fillable field to sit under. safeParse + a silent return, like the
// document issue/send buttons, rather than form state with nowhere to show
// it. None of them hides a refusal the user needs to read either: sendQuote
// records a WhatsApp failure on the activity and still marks the quote sent
// rather than throwing, and a quote with no items cannot exist, since
// createQuote requires at least one.
export async function sendQuoteAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const parsed = z.string().min(1).safeParse(formData.get("quoteId"));
  if (!parsed.success) return;
  await sendQuote(ctx, parsed.data);
  revalidatePath(`/quotes/${parsed.data}`);
}

export async function setQuoteStatusAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const parsed = z
    .object({
      quoteId: z.string().min(1),
      status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]),
    })
    .safeParse({ quoteId: formData.get("quoteId"), status: formData.get("status") });
  if (!parsed.success) return;

  await setQuoteStatus(ctx, parsed.data.quoteId, parsed.data.status);
  revalidatePath(`/quotes/${parsed.data.quoteId}`);
}

export async function convertQuoteToDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const parsed = z.string().min(1).safeParse(formData.get("quoteId"));
  if (!parsed.success) return;

  // redirect() throws for control flow, so it stays outside the try.
  let document;
  try {
    document = await createDocumentFromQuote(ctx, parsed.data);
  } catch {
    return;
  }

  revalidatePath(`/quotes/${parsed.data}`);
  redirect(`/documents/${document!.id}`);
}
