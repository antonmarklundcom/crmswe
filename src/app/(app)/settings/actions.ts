"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import {
  updateTenantBranding,
  updateTenantBusinessHours,
  updateTenantTimezone,
  type BusinessHours,
} from "@/modules/tenancy/settings";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const brandingSchema = z.object({
  logoUrl: z.string().url().optional().or(z.literal("")),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal("")),
});

export async function updateBrandingAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const input = brandingSchema.parse({
    logoUrl: formData.get("logoUrl") || undefined,
    primaryColor: formData.get("primaryColor") || undefined,
  });
  await updateTenantBranding(ctx, {
    logoUrl: input.logoUrl || undefined,
    primaryColor: input.primaryColor || undefined,
  });
  revalidatePath("/settings");
}

export async function updateBusinessHoursAction(formData: FormData) {
  const ctx = await requireTenantAdmin();

  const businessHours = DAYS.reduce((acc, day) => {
    const enabled = formData.get(`${day}_enabled`) === "on";
    const start = String(formData.get(`${day}_start`) || "");
    const end = String(formData.get(`${day}_end`) || "");
    acc[day] = enabled && start && end ? { start, end } : null;
    return acc;
  }, {} as BusinessHours);

  await updateTenantBusinessHours(ctx, businessHours);
  revalidatePath("/settings");
}

const timezoneSchema = z.string().min(1).max(60);

export async function updateTimezoneAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const timezone = timezoneSchema.parse(formData.get("timezone"));
  await updateTenantTimezone(ctx, timezone);
  revalidatePath("/settings");
}
