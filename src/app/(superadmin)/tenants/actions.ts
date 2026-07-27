"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperadminContext, buildSystemTenantContext } from "@/modules/tenancy/context";
import { createTenant, suspendTenant, activateTenant } from "@/modules/tenancy/tenants";
import { seedDefaultPipeline } from "@/modules/crm/pipelines";

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

  const tenant = await createTenant(ctx, input);
  if (tenant) {
    const tenantCtx = await buildSystemTenantContext(tenant.id);
    if (tenantCtx) await seedDefaultPipeline(tenantCtx);
  }
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
