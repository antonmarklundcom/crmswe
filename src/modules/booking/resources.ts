import { and, eq, inArray } from "drizzle-orm";
import {
  bookingAvailabilityRules,
  bookingBlackouts,
  bookingResources,
  bookingTypeResources,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Resources, their weekly availability, and their closures
// (docs/SPEC-BOOKING.md §2). Service layer only — no request handling, no
// business rules about *offering* a slot; that is slots.ts, which is pure.

export type BookingResource = typeof bookingResources.$inferSelect;
export type AvailabilityRuleRow = typeof bookingAvailabilityRules.$inferSelect;
export type BlackoutRow = typeof bookingBlackouts.$inferSelect;

export class BookingConfigError extends Error {
  constructor(readonly code: "notFound" | "forbidden" | "invalidRange" | "invalidTime") {
    super(`booking_config_${code}`);
  }
}

/** Tenant admins configure who can be booked; agents may look. */
function assertAdmin(ctx: TenantContext): void {
  if (ctx.role !== "admin") throw new BookingConfigError("forbidden");
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function listResources(ctx: TenantContext): Promise<BookingResource[]> {
  return tenantDb(ctx).select(bookingResources).orderBy(bookingResources.name);
}

export async function getResource(
  ctx: TenantContext,
  id: string,
): Promise<BookingResource | null> {
  const [row] = await tenantDb(ctx)
    .select(bookingResources, eq(bookingResources.id, id))
    .limit(1);
  return row ?? null;
}

export async function createResource(
  ctx: TenantContext,
  input: { kind: "user" | "resource"; userId?: string | null; name: string },
): Promise<BookingResource | null> {
  assertAdmin(ctx);
  const id = newId();
  await tenantDb(ctx).insert(bookingResources).values({
    id,
    kind: input.kind,
    // A room has no login, and a rep has exactly one resource — the unique
    // index on (tenant_id, user_id) is what makes "¿está ocupado?" answerable.
    userId: input.kind === "user" ? (input.userId ?? null) : null,
    name: input.name,
  });
  return getResource(ctx, id);
}

export async function updateResource(
  ctx: TenantContext,
  id: string,
  input: { name?: string; isActive?: boolean },
): Promise<BookingResource | null> {
  assertAdmin(ctx);
  const existing = await getResource(ctx, id);
  if (!existing) throw new BookingConfigError("notFound");

  await tenantDb(ctx)
    .update(bookingResources)
    .set({
      name: input.name ?? existing.name,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: new Date(),
    })
    .where(eq(bookingResources.id, id));
  return getResource(ctx, id);
}

/**
 * Deactivates rather than deletes. A deleted resource would orphan the
 * bookings that name it, and "who was this appointment with" has to survive
 * a rep leaving — the same reasoning §5.2.2 gives for revoking an API key by
 * timestamp instead of dropping the row.
 */
export async function deactivateResource(ctx: TenantContext, id: string): Promise<void> {
  await updateResource(ctx, id, { isActive: false });
}

export async function listAvailabilityRules(
  ctx: TenantContext,
  resourceId?: string,
): Promise<AvailabilityRuleRow[]> {
  const extra = resourceId ? eq(bookingAvailabilityRules.resourceId, resourceId) : undefined;
  return tenantDb(ctx).select(bookingAvailabilityRules, extra);
}

export async function listAvailabilityRulesForResources(
  ctx: TenantContext,
  resourceIds: string[],
): Promise<AvailabilityRuleRow[]> {
  if (resourceIds.length === 0) return [];
  return tenantDb(ctx).select(
    bookingAvailabilityRules,
    inArray(bookingAvailabilityRules.resourceId, resourceIds),
  );
}

/**
 * Replaces a resource's whole weekly pattern in one call. Set-based rather
 * than row-based because the editor is a week grid: a partial save that left
 * yesterday's Tuesday behind is the bug this shape prevents.
 */
export async function replaceAvailabilityRules(
  ctx: TenantContext,
  resourceId: string,
  rules: Array<{ weekday: number; start: string; end: string }>,
): Promise<AvailabilityRuleRow[]> {
  assertAdmin(ctx);
  const resource = await getResource(ctx, resourceId);
  if (!resource) throw new BookingConfigError("notFound");

  for (const rule of rules) {
    if (!TIME_PATTERN.test(rule.start) || !TIME_PATTERN.test(rule.end)) {
      throw new BookingConfigError("invalidTime");
    }
    if (rule.end <= rule.start) throw new BookingConfigError("invalidRange");
    if (rule.weekday < 0 || rule.weekday > 6) throw new BookingConfigError("invalidRange");
  }

  await tenantDb(ctx).delete(
    bookingAvailabilityRules,
    eq(bookingAvailabilityRules.resourceId, resourceId),
  );

  for (const rule of rules) {
    await tenantDb(ctx).insert(bookingAvailabilityRules).values({
      id: newId(),
      resourceId,
      weekday: rule.weekday,
      startTime: rule.start,
      endTime: rule.end,
    });
  }

  return listAvailabilityRules(ctx, resourceId);
}

export async function listBlackouts(
  ctx: TenantContext,
  from?: Date,
  to?: Date,
): Promise<BlackoutRow[]> {
  const rows = await tenantDb(ctx).select(bookingBlackouts);
  if (!from || !to) return rows;
  return rows.filter((row) => row.startsAt < to && from < row.endsAt);
}

export async function createBlackout(
  ctx: TenantContext,
  input: { resourceId?: string | null; startsAt: Date; endsAt: Date; reason?: string },
): Promise<BlackoutRow | null> {
  assertAdmin(ctx);
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new BookingConfigError("invalidRange");
  }
  const id = newId();
  await tenantDb(ctx).insert(bookingBlackouts).values({
    id,
    resourceId: input.resourceId ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    reason: input.reason ?? null,
  });
  const [row] = await tenantDb(ctx).select(bookingBlackouts, eq(bookingBlackouts.id, id)).limit(1);
  return row ?? null;
}

export async function deleteBlackout(ctx: TenantContext, id: string): Promise<void> {
  assertAdmin(ctx);
  await tenantDb(ctx).delete(bookingBlackouts, eq(bookingBlackouts.id, id));
}

/** Which resources a booking type may draw on, active ones only. */
export async function listResourcesForType(
  ctx: TenantContext,
  bookingTypeId: string,
): Promise<BookingResource[]> {
  const links = await tenantDb(ctx).select(
    bookingTypeResources,
    eq(bookingTypeResources.bookingTypeId, bookingTypeId),
  );
  if (links.length === 0) return [];

  const rows = await tenantDb(ctx).select(
    bookingResources,
    and(
      inArray(
        bookingResources.id,
        links.map((link) => link.resourceId),
      ),
      eq(bookingResources.isActive, true),
    ),
  );
  return rows;
}

export async function setResourcesForType(
  ctx: TenantContext,
  bookingTypeId: string,
  resourceIds: string[],
): Promise<void> {
  assertAdmin(ctx);
  await tenantDb(ctx).delete(
    bookingTypeResources,
    eq(bookingTypeResources.bookingTypeId, bookingTypeId),
  );
  for (const resourceId of resourceIds) {
    await tenantDb(ctx).insert(bookingTypeResources).values({
      id: newId(),
      bookingTypeId,
      resourceId,
    });
  }
}
