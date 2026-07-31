"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { createSubscription, recordPayment } from "@/modules/tenancy/subscriptions";
import { createTenantAdminUser, getUserByEmail } from "@/modules/tenancy/users";
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

// Direct user creation (PLAN.md §10 1I #3). Before this, standing up a
// tenant's first admin meant running scripts/seed-tenant.ts over SSH — the
// superadmin console could create the tenant but nobody who could log into
// it. Sets the password directly (no email delivery exists yet, §10 1L), so
// the superadmin hands over the credentials out of band.
const createTenantUserSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "agent"]),
});

export type CreateTenantUserState = { error: string | null; createdEmail: string | null };

export async function createTenantUserAction(
  _prevState: CreateTenantUserState,
  formData: FormData,
): Promise<CreateTenantUserState> {
  await requireSuperadminContext();

  const parsed = createTenantUserSchema.safeParse({
    tenantId: formData.get("tenantId"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: "invalid", createdEmail: null };
  }

  const existing = await getUserByEmail(parsed.data.email);
  if (existing) {
    return { error: "emailTaken", createdEmail: null };
  }

  await createTenantAdminUser({
    tenantId: parsed.data.tenantId,
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    role: parsed.data.role,
  });

  revalidatePath(`/tenants/${parsed.data.tenantId}`);
  return { error: null, createdEmail: parsed.data.email };
}

const impersonateSchema = z.object({
  userId: z.string().min(1),
});

export async function impersonateAction(formData: FormData) {
  const input = impersonateSchema.parse({ userId: formData.get("userId") });
  await startImpersonation(input.userId);
  redirect("/dashboard");
}
