"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/modules/tenancy/context";
import {
  createDocument,
  updateDraftDocument,
  issueDocument,
  voidDocument,
  recordPayment,
  deletePayment,
} from "@/modules/documents/documents";
import { sendDocumentToContact } from "@/modules/documents/delivery";

const lineSchema = z.object({
  description: z.string().min(1).max(500),
  qty: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().int().min(0),
  productId: z.string().optional(),
});

function parseLines(formData: FormData) {
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

const createDocumentSchema = z.object({
  contactId: z.string().min(1),
  discount: z.coerce.number().int().min(0).optional(),
  dueAt: z.string().optional(),
  notes: z.string().max(5000).optional(),
  items: z.array(lineSchema).min(1),
});

export async function createDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();

  const input = createDocumentSchema.parse({
    contactId: formData.get("contactId"),
    discount: formData.get("discount") || 0,
    dueAt: formData.get("dueAt") || undefined,
    notes: formData.get("notes") || undefined,
    items: parseLines(formData),
  });

  const document = await createDocument(ctx, {
    contactId: input.contactId,
    discount: input.discount,
    dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
    notes: input.notes,
    items: input.items,
  });

  revalidatePath("/documents");
  redirect(`/documents/${document!.id}`);
}

const updateDocumentSchema = z.object({
  documentId: z.string().min(1),
  discount: z.coerce.number().int().min(0).optional(),
  dueAt: z.string().optional(),
  notes: z.string().max(5000).optional(),
  items: z.array(lineSchema).min(1),
});

export async function updateDraftDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();

  const input = updateDocumentSchema.parse({
    documentId: formData.get("documentId"),
    discount: formData.get("discount") || 0,
    dueAt: formData.get("dueAt") || undefined,
    notes: formData.get("notes") || undefined,
    items: parseLines(formData),
  });

  await updateDraftDocument(ctx, input.documentId, {
    discount: input.discount,
    dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
    notes: input.notes,
    items: input.items,
  });

  revalidatePath(`/documents/${input.documentId}`);
  redirect(`/documents/${input.documentId}`);
}

export async function issueDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const documentId = z.string().min(1).parse(formData.get("documentId"));
  await issueDocument(ctx, documentId);
  revalidatePath(`/documents/${documentId}`);
}

const voidDocumentSchema = z.object({
  documentId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export async function voidDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = voidDocumentSchema.parse({
    documentId: formData.get("documentId"),
    reason: formData.get("reason"),
  });
  await voidDocument(ctx, input.documentId, input.reason);
  revalidatePath(`/documents/${input.documentId}`);
}

export async function sendDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const documentId = z.string().min(1).parse(formData.get("documentId"));
  await sendDocumentToContact(ctx, documentId);
  revalidatePath(`/documents/${documentId}`);
}

const recordPaymentSchema = z.object({
  documentId: z.string().min(1),
  amount: z.coerce.number().int().min(1),
  method: z.enum(["transfer", "cash", "card", "check", "other"]).optional(),
  reference: z.string().max(200).optional(),
  paidAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export async function recordPaymentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = recordPaymentSchema.parse({
    documentId: formData.get("documentId"),
    amount: formData.get("amount"),
    method: formData.get("method") || undefined,
    reference: formData.get("reference") || undefined,
    paidAt: formData.get("paidAt") || undefined,
    notes: formData.get("notes") || undefined,
  });

  await recordPayment(ctx, input.documentId, {
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
    notes: input.notes,
  });

  revalidatePath(`/documents/${input.documentId}`);
}

const deletePaymentSchema = z.object({
  documentId: z.string().min(1),
  paymentId: z.string().min(1),
});

export async function deletePaymentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const input = deletePaymentSchema.parse({
    documentId: formData.get("documentId"),
    paymentId: formData.get("paymentId"),
  });
  await deletePayment(ctx, input.documentId, input.paymentId);
  revalidatePath(`/documents/${input.documentId}`);
}
