"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { createSubscription, recordPayment } from "@/modules/tenancy/subscriptions";
import { startImpersonation } from "@/modules/auth/impersonation";
import { redirect } from "next/navigation";

const createSubscriptionSchema = z.object({
  tenantId: z.string().min(1),
  planId: z.string().min(1),
});

export async function createSubscriptionAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const input = createSubscriptionSchema.parse({
    tenantId: formData.get("tenantId"),
    planId: formData.get("planId"),
  });
  await createSubscription(ctx, input);
  revalidatePath(`/tenants/${input.tenantId}`);
}

const recordPaymentSchema = z.object({
  tenantId: z.string().min(1),
  subscriptionId: z.string().min(1),
  amount: z.coerce.number().int().positive(),
  method: z.enum(["transfer", "cash", "other"]),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export async function recordPaymentAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const input = recordPaymentSchema.parse({
    tenantId: formData.get("tenantId"),
    subscriptionId: formData.get("subscriptionId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    reference: formData.get("reference") || undefined,
    notes: formData.get("notes") || undefined,
  });

  await recordPayment(ctx, {
    subscriptionId: input.subscriptionId,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    notes: input.notes,
  });
  revalidatePath(`/tenants/${input.tenantId}`);
}

const impersonateSchema = z.object({
  userId: z.string().min(1),
});

export async function impersonateAction(formData: FormData) {
  const input = impersonateSchema.parse({ userId: formData.get("userId") });
  await startImpersonation(input.userId);
  redirect("/dashboard");
}
