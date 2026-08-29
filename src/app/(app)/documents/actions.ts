"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext, requireTenantAdmin } from "@/modules/tenancy/context";
import {
  createDocument,
  createCreditNote,
  updateDraftDocument,
  issueDocument,
  voidDocument,
  recordPayment,
  deletePayment,
} from "@/modules/documents/documents";
import { sendDocumentToContact, sendPaymentReminder } from "@/modules/documents/delivery";
import { moneyAmountSchema } from "@/lib/money-schema";

// Amounts arrive as the user typed them — "1 495,50" — and become öre here
// (plan.md §1.2). Built per request because how many decimals an amount may
// carry is a property of the tenant's currency.
const lineSchema = (currency: string) =>
  z.object({
    description: z.string().min(1).max(500),
    qty: z.coerce.number().int().min(1),
    unitPrice: moneyAmountSchema(currency),
    productId: z.string().optional(),
    // Basis points. Shape only — whether the tenant actually has this rate
    // configured is decided in the service layer against `vat_rates`, which
    // is the only place that knows (plan.md §4.11).
    vatRateBps: z.coerce.number().int().min(0).max(10_000).optional(),
  });

function parseLines(formData: FormData) {
  const descriptions = formData.getAll("description").map(String);
  const qtys = formData.getAll("qty").map(String);
  const prices = formData.getAll("unitPrice").map(String);
  const productIds = formData.getAll("productId").map(String);
  const vatRates = formData.getAll("vatRateBps").map(String);

  return descriptions
    .map((description, i) => ({
      description,
      qty: qtys[i],
      unitPrice: prices[i],
      productId: productIds[i] || undefined,
      // Absent means "the tenant's default", which the service resolves.
      vatRateBps: vatRates[i] || undefined,
    }))
    // Blank rows are how the builder represents "not filled in yet".
    .filter((line) => line.description.trim().length > 0);
}

const createDocumentSchema = (currency: string) =>
  z.object({
    contactId: z.string().min(1),
    discount: moneyAmountSchema(currency),
    dueAt: z.string().optional(),
    deliveryDate: z.string().optional(),
    notes: z.string().max(5000).optional(),
    items: z.array(lineSchema(currency)).min(1),
  });

// useActionState-shaped (PLAN.md §10 1R #6): the builder keeps its own line
// items client-side, so the only field worth pointing an inline error at is
// the contact picker — a bad line (empty items array) has no single input to
// sit under and lands in the form-level slot instead.
export type DocumentField = "contactId";

// Now that the amount inputs are inputMode="numeric" and the browser no
// longer blocks the submit, a rejected line reaches the server for the first
// time — and must not borrow the empty-builder message. Not exported: a
// "use server" module may only export async functions.
function lineFailureKey(error: z.ZodError): "itemInvalid" | "discountInvalid" | "itemsRequired" {
  const issues = error.issues;
  if (issues.some((issue) => issue.path[0] === "items" && issue.path.length > 1)) {
    return "itemInvalid";
  }
  if (issues.some((issue) => issue.path[0] === "discount")) return "discountInvalid";
  return "itemsRequired";
}

// The service layer throws stable codes, not copy. The few a user can
// actually cause get their own message; anything else is a bug and reads as
// "we couldn't save that". Not exported: a "use server" module may only
// export async functions.
function serviceErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("vat_rate_not_configured")) return "vatRateInvalid";
  return "unknown";
}

export type DocumentFormState = {
  error: string | null;
  field: DocumentField | null;
  values: { contactId: string };
};

export async function createDocumentAction(
  _prevState: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const ctx = await requireTenantContext();
  const contactId = String(formData.get("contactId") ?? "");

  const parsed = createDocumentSchema(ctx.currency).safeParse({
    contactId,
    // A cleared discount box means no discount, not a rejected form.
    discount: String(formData.get("discount") ?? "").trim() || "0",
    dueAt: formData.get("dueAt") || undefined,
    deliveryDate: formData.get("deliveryDate") || undefined,
    notes: formData.get("notes") || undefined,
    items: parseLines(formData),
  });

  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "contactId")) {
      return { error: "contactRequired", field: "contactId", values: { contactId } };
    }
    return { error: lineFailureKey(parsed.error), field: null, values: { contactId } };
  }

  let document;
  try {
    document = await createDocument(ctx, {
      contactId: parsed.data.contactId,
      discount: parsed.data.discount,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
      deliveryDate: parsed.data.deliveryDate
        ? new Date(parsed.data.deliveryDate)
        : undefined,
      notes: parsed.data.notes,
      items: parsed.data.items,
    });
  } catch (error) {
    return { error: serviceErrorKey(error), field: null, values: { contactId } };
  }

  revalidatePath("/documents");
  redirect(`/documents/${document!.id}`);
}

const updateDocumentSchema = (currency: string) =>
  z.object({
    documentId: z.string().min(1),
    discount: moneyAmountSchema(currency),
    dueAt: z.string().optional(),
    deliveryDate: z.string().optional(),
    notes: z.string().max(5000).optional(),
    items: z.array(lineSchema(currency)).min(1),
  });

export type UpdateDocumentFormState = {
  error: string | null;
  values: { contactId: string };
};

export async function updateDraftDocumentAction(
  _prevState: UpdateDocumentFormState,
  formData: FormData,
): Promise<UpdateDocumentFormState> {
  const ctx = await requireTenantContext();
  const documentId = String(formData.get("documentId") ?? "");

  const parsed = updateDocumentSchema(ctx.currency).safeParse({
    documentId,
    // A cleared discount box means no discount, not a rejected form.
    discount: String(formData.get("discount") ?? "").trim() || "0",
    dueAt: formData.get("dueAt") || undefined,
    deliveryDate: formData.get("deliveryDate") || undefined,
    notes: formData.get("notes") || undefined,
    items: parseLines(formData),
  });

  if (!parsed.success) {
    return { error: lineFailureKey(parsed.error), values: { contactId: "" } };
  }

  try {
    await updateDraftDocument(ctx, parsed.data.documentId, {
      discount: parsed.data.discount,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
      deliveryDate: parsed.data.deliveryDate
        ? new Date(parsed.data.deliveryDate)
        : undefined,
      notes: parsed.data.notes,
      items: parsed.data.items,
    });
  } catch (error) {
    return { error: serviceErrorKey(error), values: { contactId: "" } };
  }

  revalidatePath(`/documents/${parsed.data.documentId}`);
  redirect(`/documents/${parsed.data.documentId}`);
}

// Hidden-id-only actions: there's no field a user fills in for the server to
// reject, so a bad submission (a tampered id) fails silently instead of
// crashing — safeParse instead of parse, no state to render.
export async function issueDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const parsed = z.string().min(1).safeParse(formData.get("documentId"));
  if (!parsed.success) return;
  await issueDocument(ctx, parsed.data);
  revalidatePath(`/documents/${parsed.data}`);
}

const voidDocumentSchema = z.object({
  documentId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export type VoidDocumentFormState = {
  error: string | null;
  values: { reason: string };
};

// Admin-only, unlike issue/record-payment above: voiding cancels a sale that
// the customer already holds a link to, and it is not undoable. Agents sell
// (§3.2), admins reverse. The void itself writes an auditLog row from the
// documents module, so who cancelled what — and why — survives the action.
export async function voidDocumentAction(
  _prevState: VoidDocumentFormState,
  formData: FormData,
): Promise<VoidDocumentFormState> {
  const ctx = await requireTenantAdmin();
  const documentId = String(formData.get("documentId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const parsed = voidDocumentSchema.safeParse({ documentId, reason });
  if (!parsed.success) {
    return { error: "voidReasonRequired", values: { reason } };
  }

  try {
    await voidDocument(ctx, parsed.data.documentId, parsed.data.reason);
  } catch {
    return { error: "unknown", values: { reason } };
  }

  revalidatePath(`/documents/${parsed.data.documentId}`);
  return { error: null, values: { reason: "" } };
}

export type CreditNoteFormState = { error: string | null };

/**
 * Creates the kreditfaktura that reverses an issued faktura.
 *
 * Admin-only, on the same reasoning as voiding used to be: it puts a second
 * numbered document into the tenant's series and reverses money already on
 * the books. The result is a draft, so the admin still reviews it before it
 * is issued.
 */
export async function createCreditNoteAction(
  _prevState: CreditNoteFormState,
  formData: FormData,
): Promise<CreditNoteFormState> {
  const ctx = await requireTenantAdmin();
  const parsed = z.string().min(1).safeParse(formData.get("documentId"));
  if (!parsed.success) return { error: "creditFailed" };

  let credit;
  try {
    credit = await createCreditNote(ctx, parsed.data);
  } catch {
    return { error: "creditFailed" };
  }

  revalidatePath(`/documents/${parsed.data}`);
  revalidatePath("/documents");
  redirect(`/documents/${credit!.id}`);
}

export async function sendDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const parsed = z.string().min(1).safeParse(formData.get("documentId"));
  if (!parsed.success) return;
  await sendDocumentToContact(ctx, parsed.data);
  revalidatePath(`/documents/${parsed.data}`);
}

/**
 * Betalningspåminnelse (plan.md §5.3.2). Hidden-id-only like the send button
 * beside it, and the page only renders it for an issued, unpaid faktura — so
 * the refusals inside `sendPaymentReminder` are belt-and-braces against a
 * balance settled between render and click, not a path a rep walks into.
 * Swallowed for the same reason the other hidden-id actions are: there is no
 * user-fillable field for a message to sit under, and the outcome — sent, or
 * "no address on this contact" — lands on the contact's timeline either way.
 */
export async function sendPaymentReminderAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const parsed = z.string().min(1).safeParse(formData.get("documentId"));
  if (!parsed.success) return;
  try {
    await sendPaymentReminder(ctx, parsed.data);
  } catch {
    // Already paid, or no longer issued. Nothing to say that the refreshed
    // page does not already show.
  }
  revalidatePath(`/documents/${parsed.data}`);
}

const recordPaymentSchema = (currency: string) =>
  z.object({
    documentId: z.string().min(1),
    // At least one minor unit: a zero-kronor payment is not a payment.
    amount: moneyAmountSchema(currency, { min: 1 }),
    method: z.enum(["transfer", "cash", "card", "check", "other"]).optional(),
    reference: z.string().max(200).optional(),
    paidAt: z.string().optional(),
    notes: z.string().max(500).optional(),
  });

export type RecordPaymentField = "amount";

export type RecordPaymentFormState = {
  error: string | null;
  field: RecordPaymentField | null;
  values: Record<string, string>;
};

export async function recordPaymentAction(
  _prevState: RecordPaymentFormState,
  formData: FormData,
): Promise<RecordPaymentFormState> {
  const ctx = await requireTenantContext();
  const values = Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const parsed = recordPaymentSchema(ctx.currency).safeParse({
    documentId: formData.get("documentId"),
    amount: formData.get("amount"),
    method: formData.get("method") || undefined,
    reference: formData.get("reference") || undefined,
    paidAt: formData.get("paidAt") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "amount") {
      return { error: "amountInvalid", field: "amount", values };
    }
    return { error: "unknown", field: null, values };
  }

  try {
    await recordPayment(ctx, parsed.data.documentId, {
      amount: parsed.data.amount,
      method: parsed.data.method,
      reference: parsed.data.reference,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
      notes: parsed.data.notes,
    });
  } catch {
    return { error: "unknown", field: null, values };
  }

  revalidatePath(`/documents/${parsed.data.documentId}`);
  return { error: null, field: null, values: {} };
}

const deletePaymentSchema = z.object({
  documentId: z.string().min(1),
  paymentId: z.string().min(1),
});

// Admin-only for the same reason as voiding: deleting a payment rewrites the
// ledger a document's balance is computed from. Audited in the module.
export async function deletePaymentAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const parsed = deletePaymentSchema.safeParse({
    documentId: formData.get("documentId"),
    paymentId: formData.get("paymentId"),
  });
  if (!parsed.success) return;
  await deletePayment(ctx, parsed.data.documentId, parsed.data.paymentId);
  revalidatePath(`/documents/${parsed.data.documentId}`);
}
