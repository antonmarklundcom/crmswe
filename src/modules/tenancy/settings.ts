import { randomBytes, timingSafeEqual } from "node:crypto";
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

/**
 * Read-only export feed (see modules/crm/export.ts). The token is the secret
 * — the same model as the public quote link `/q/[token]` (§8) — because
 * Google's servers fetch the URL for IMPORTDATA and cannot carry a session.
 * Kept in tenant settings rather than its own column so this ships without a
 * migration; rotating it is a settings write.
 */
export type TenantExports = {
  contactsToken?: string;
};

export type TenantSettings = {
  branding?: TenantBranding;
  businessHours?: BusinessHours;
  exports?: TenantExports;
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

/**
 * Issues (or rotates) the contacts feed token. Rotation is the revoke path:
 * the previous URL stops resolving the moment this returns, so a link pasted
 * into the wrong spreadsheet can be killed without touching anything else.
 */
export async function regenerateContactsFeedToken(ctx: TenantContext): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await mergeTenantSettings(ctx, { exports: { contactsToken: token } });
  return token;
}

export async function clearContactsFeedToken(ctx: TenantContext) {
  await mergeTenantSettings(ctx, { exports: {} });
}

/**
 * Resolves a feed token to its tenant. Runs before any TenantContext can
 * exist — structurally the same unauthenticated lookup as the invitation
 * token above and the public quote token (§8), so it lives here in the
 * tenancy module where raw `db` is sanctioned.
 *
 * Scans tenants rather than querying into the settings JSON: the row count
 * is tenants-per-platform (tens), and a timing-safe compare over that is
 * cheaper to reason about than a JSON path index. Revisit if the platform
 * ever grows past a few thousand tenants.
 */
export async function resolveTenantByContactsFeedToken(token: string) {
  if (token.length < 32) return null;
  const provided = Buffer.from(token);

  const rows = await db.select().from(tenants);
  for (const tenant of rows) {
    const stored = (tenant.settings as TenantSettings | null)?.exports?.contactsToken;
    if (!stored) continue;
    const expected = Buffer.from(stored);
    if (expected.length !== provided.length) continue;
    if (timingSafeEqual(expected, provided)) return tenant;
  }
  return null;
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
    exports: patch.exports ?? current.exports,
  };

  await db.update(tenants).set({ settings: merged }).where(eq(tenants.id, ctx.tenantId));
  return getTenant(ctx.tenantId);
}
