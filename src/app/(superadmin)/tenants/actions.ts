"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { createTenant, suspendTenant, activateTenant } from "@/modules/tenancy/tenants";

const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with dashes"),
});

export async function createTenantAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const input = createTenantSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  await createTenant(ctx, input);
  revalidatePath("/tenants");
}

export async function suspendTenantAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const tenantId = z.string().min(1).parse(formData.get("tenantId"));
  await suspendTenant(ctx, tenantId);
  revalidatePath("/tenants");
}

export async function activateTenantAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const tenantId = z.string().min(1).parse(formData.get("tenantId"));
  await activateTenant(ctx, tenantId);
  revalidatePath("/tenants");
}
