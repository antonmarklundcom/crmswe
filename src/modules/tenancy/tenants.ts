import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants, vatRates } from "@/db/schema";
import { newId } from "@/lib/ids";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { DEFAULT_TIMEZONE } from "@/lib/i18n/format";
import { SEEDED_VAT_RATES, SEEDED_VAT_RATE_VALID_FROM } from "./vat-rates";
import type { SuperadminContext } from "./context";
import { writeAuditLog } from "./audit";

// Superadmin-only tenant lifecycle (PLAN.md §10 1B exit criteria: "superadmin
// can create a tenant ... suspend"). Platform-level table, not tenant-owned,
// so no tenantDb scoping applies here — only superadmins may call these
// (enforced by requiring a SuperadminContext, resolved server-side only).

export type TenantStatus = "active" | "suspended" | "trial";

export type CreateTenantInput = {
  name: string;
  slug: string;
  locale?: string;
  timezone?: string;
  currency?: string;
};

export async function createTenant(
  ctx: SuperadminContext,
  input: CreateTenantInput,
) {
  const id = newId();

  await db.insert(tenants).values({
    id,
    name: input.name,
    slug: input.slug,
    status: "trial",
    locale: input.locale ?? DEFAULT_LOCALE,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    currency: input.currency ?? DEFAULT_CURRENCY,
    settings: {},
  });

  // Momssatserna are per-tenant configuration (plan.md §1.4), so a tenant
  // without them cannot price a line at all. Seeding here rather than reading
  // a global table is what lets a momsbefriad tenant, or one on reduced
  // rates, correct its own configuration without touching anyone else's.
  await db.insert(vatRates).values(
    SEEDED_VAT_RATES.map((rate) => ({
      id: newId(),
      tenantId: id,
      rateBps: rate.rateBps,
      label: rate.label,
      validFrom: SEEDED_VAT_RATE_VALID_FROM,
      source: rate.source,
      isDefault: rate.isDefault,
    })),
  );

  await writeAuditLog({
    tenantId: id,
    actorUserId: ctx.userId,
    action: "tenant.created",
    entity: "tenant",
    entityId: id,
    payload: { name: input.name, slug: input.slug },
  });

  return getTenant(id);
}

export async function listTenants() {
  return db.select().from(tenants).orderBy(tenants.createdAt);
}

export async function getTenant(tenantId: string) {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return tenant ?? null;
}

export async function getTenantBySlug(slug: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  return tenant ?? null;
}

async function setTenantStatus(
  ctx: SuperadminContext,
  tenantId: string,
  status: TenantStatus,
  action: string,
) {
  await db.update(tenants).set({ status }).where(eq(tenants.id, tenantId));

  await writeAuditLog({
    tenantId,
    actorUserId: ctx.userId,
    action,
    entity: "tenant",
    entityId: tenantId,
    payload: { status },
  });

  return getTenant(tenantId);
}

export function suspendTenant(ctx: SuperadminContext, tenantId: string) {
  return setTenantStatus(ctx, tenantId, "suspended", "tenant.suspended");
}

export function activateTenant(ctx: SuperadminContext, tenantId: string) {
  return setTenantStatus(ctx, tenantId, "active", "tenant.activated");
}
