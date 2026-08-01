"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantAdmin } from "@/modules/tenancy/context";
import {
  updateTenantBranding,
  updateTenantBusinessHours,
  updateTenantTimezone,
  updateTenantDefaultCountry,
  updateTenantReviewLink,
  regenerateContactsFeedToken,
  updateTenantAiSettings,
  type BusinessHours,
} from "@/modules/tenancy/settings";
import {
  MAX_PER_CONVERSATION_PER_DAY_LIMIT,
  MAX_PER_TENANT_PER_DAY_LIMIT,
} from "@/modules/ai/config";
import { COUNTRY_CODES } from "@/lib/phone";

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

const defaultCountrySchema = z.enum(COUNTRY_CODES);

export async function updateDefaultCountryAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const defaultCountry = defaultCountrySchema.parse(formData.get("defaultCountry"));
  await updateTenantDefaultCountry(ctx, defaultCountry);
  revalidatePath("/settings");
}

const reviewLinkSchema = z.string().url().max(500);

export async function updateReviewLinkAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const reviewLink = reviewLinkSchema.parse(formData.get("reviewLink"));
  await updateTenantReviewLink(ctx, reviewLink);
  revalidatePath("/settings");
}

// AI auto-reply settings (PLAN.md §10 1O). Admin-only via requireTenantAdmin
// like every other setting here — an agent can pull the per-conversation kill
// switch from the inbox, but only an admin decides whether the tenant sends
// autonomously at all.
const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  businessName: z.string().max(200).optional(),
  about: z.string().max(2000).optional(),
  tone: z.string().max(500).optional(),
  hours: z.string().max(500).optional(),
  neverPromise: z.string().max(1000).optional(),
  mode: z.enum(["draft", "send"]),
  maxRepliesPerConversationPerDay: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_PER_CONVERSATION_PER_DAY_LIMIT),
  maxRepliesPerTenantPerDay: z.coerce.number().int().min(0).max(MAX_PER_TENANT_PER_DAY_LIMIT),
  handoffKeyword: z.string().min(1).max(50),
});

export async function updateAiSettingsAction(formData: FormData) {
  const ctx = await requireTenantAdmin();
  const input = aiSettingsSchema.parse({
    enabled: formData.get("enabled") === "on",
    businessName: formData.get("businessName") || undefined,
    about: formData.get("about") || undefined,
    tone: formData.get("tone") || undefined,
    hours: formData.get("hours") || undefined,
    neverPromise: formData.get("neverPromise") || undefined,
    mode: formData.get("mode") || "draft",
    maxRepliesPerConversationPerDay: formData.get("maxRepliesPerConversationPerDay") || 3,
    maxRepliesPerTenantPerDay: formData.get("maxRepliesPerTenantPerDay") || 200,
    handoffKeyword: formData.get("handoffKeyword") || "humano",
  });

  await updateTenantAiSettings(ctx, input);
  revalidatePath("/settings");
}

// Contacts feed token (Google Sheets IMPORTDATA). No action state needed —
// the settings page reads the token straight from tenant settings, so
// revalidating is enough to show the new formula.
export async function regenerateFeedTokenAction() {
  const ctx = await requireTenantAdmin();
  await regenerateContactsFeedToken(ctx);
  revalidatePath("/settings");
}
