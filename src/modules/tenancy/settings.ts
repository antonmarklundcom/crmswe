import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants } from "@/db/schema";
import type { TenantContext } from "./context";
import { assertTenantWritable } from "./db";
import { getTenant } from "./tenants";

// Tenant admin self-service settings (PLAN.md §5 "tenant settings: branding,
// business hours, timezone"). `tenants` is a platform table keyed by its
// own id, not a `tenant_id` column, so it can't go through tenantDb(ctx) —
// but writes are still scoped to `ctx.tenantId` (never a client-supplied
// id) and still honor the grace/locked write gate via assertTenantWritable.

export type DayHours = { start: string; end: string } | null;

export type BusinessHours = {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
};

export type TenantBranding = {
  logoUrl?: string;
  primaryColor?: string;
};

export type TenantSettings = {
  branding?: TenantBranding;
  businessHours?: BusinessHours;
};

export async function updateTenantBranding(ctx: TenantContext, branding: TenantBranding) {
  return mergeTenantSettings(ctx, { branding });
}

export async function updateTenantBusinessHours(ctx: TenantContext, businessHours: BusinessHours) {
  return mergeTenantSettings(ctx, { businessHours });
}

export async function updateTenantTimezone(ctx: TenantContext, timezone: string) {
  assertTenantWritable(ctx);
  await db.update(tenants).set({ timezone }).where(eq(tenants.id, ctx.tenantId));
  return getTenant(ctx.tenantId);
}

async function mergeTenantSettings(ctx: TenantContext, patch: Partial<TenantSettings>) {
  assertTenantWritable(ctx);

  const tenant = await getTenant(ctx.tenantId);
  if (!tenant) throw new Error("Tenant not found");

  const current = (tenant.settings ?? {}) as TenantSettings;
  const merged: TenantSettings = {
    ...current,
    ...patch,
    branding: { ...current.branding, ...patch.branding },
    businessHours: patch.businessHours ?? current.businessHours,
  };

  await db.update(tenants).set({ settings: merged }).where(eq(tenants.id, ctx.tenantId));
  return getTenant(ctx.tenantId);
}
