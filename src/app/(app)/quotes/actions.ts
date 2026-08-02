"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/modules/tenancy/context";
import { createQuote, setQuoteStatus } from "@/modules/quotes/quotes";
import { sendQuote } from "@/modules/quotes/delivery";
import { createDocumentFromQuote } from "@/modules/documents/documents";

const lineSchema = z.object({
  description: z.string().min(1).max(500),
  qty: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().int().min(0),
  productId: z.string().optional(),
});

const createQuoteSchema = z.object({
  contactId: z.string().min(1),
  dealId: z.string().optional(),
  discount: z.coerce.number().int().min(0).optional(),
  validUntil: z.string().optional(),
  notes: z.string().max(5000).optional(),
  items: z.array(lineSchema).min(1),
});

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

  const parsed = createQuoteSchema.safeParse({
    contactId,
    dealId: formData.get("dealId") || undefined,
    discount: formData.get("discount") || 0,
    validUntil: formData.get("validUntil") || undefined,
    notes: formData.get("notes") || undefined,
    items: parseItems(formData),
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "contactId") {
      return { error: "contactRequired", field: "contactId", values: { contactId } };
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

export async function sendQuoteAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const quoteId = z.string().min(1).parse(formData.get("quoteId"));
  await sendQuote(ctx, quoteId);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function setQuoteStatusAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const quoteId = z.string().min(1).parse(formData.get("quoteId"));
  const status = z
    .enum(["draft", "sent", "accepted", "rejected", "expired"])
    .parse(formData.get("status"));
  await setQuoteStatus(ctx, quoteId, status);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function convertQuoteToDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const quoteId = z.string().min(1).parse(formData.get("quoteId"));
  const document = await createDocumentFromQuote(ctx, quoteId);
  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/documents/${document!.id}`);
}
