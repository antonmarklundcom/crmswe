import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { payments, subscriptions } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { SuperadminContext } from "./context";
import { getPlan } from "./plans";
import { writeAuditLog } from "./audit";

// Manual billing ledger (PLAN.md §1.2 "manual: tenants pay by transfer/cash
// outside the app; superadmin records payment and sets plan expiry"; §4
// subscriptions/payments). Platform-level tables, superadmin-only writes.

// JUDGMENT CALL (not specified in PLAN.md — flagged for Fable review):
// grace-period length after subscription expiry before a tenant is fully
// locked out. Chose 7 days as a reasonable default; easy to move to a plan
// limit or env var later without a schema change.
export const GRACE_PERIOD_DAYS = 7;

export type AccessStatus = "active" | "grace" | "locked";

export type RecordPaymentInput = {
  subscriptionId: string;
  amount: number;
  currency?: string;
  method: "transfer" | "cash" | "other";
  reference?: string;
  notes?: string;
};

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function createSubscription(
  ctx: SuperadminContext,
  input: { tenantId: string; planId: string; startsAt?: Date },
) {
  const plan = await getPlan(input.planId);
  if (!plan) throw new Error(`Plan ${input.planId} not found`);

  const startsAt = input.startsAt ?? new Date();
  const expiresAt = addMonths(startsAt, plan.durationMonths);
  const id = newId();

  await db.insert(subscriptions).values({
    id,
    tenantId: input.tenantId,
    planId: input.planId,
    startsAt,
    expiresAt,
    status: "active",
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: ctx.userId,
    action: "subscription.created",
    entity: "subscription",
    entityId: id,
    payload: { planId: input.planId, expiresAt: expiresAt.toISOString() },
  });

  return getSubscription(id);
}

export async function getSubscription(subscriptionId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId));
  return row ?? null;
}

/** Most recent subscription for a tenant (by starts_at), or null. */
export async function getLatestSubscriptionForTenant(tenantId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(desc(subscriptions.startsAt))
    .limit(1);
  return row ?? null;
}

/**
 * Records a manual payment and extends the subscription's expiry by the
 * plan's duration — from the current expiry if it's still in the future
 * (stacking renewal on top of remaining time), otherwise from today.
 */
export async function recordPayment(
  ctx: SuperadminContext,
  input: RecordPaymentInput,
) {
  const subscription = await getSubscription(input.subscriptionId);
  if (!subscription) {
    throw new Error(`Subscription ${input.subscriptionId} not found`);
  }
  const plan = await getPlan(subscription.planId);
  if (!plan) throw new Error(`Plan ${subscription.planId} not found`);

  const now = new Date();
  const base = subscription.expiresAt > now ? subscription.expiresAt : now;
  const newExpiresAt = addMonths(base, plan.durationMonths);

  const paymentId = newId();
  await db.insert(payments).values({
    id: paymentId,
    subscriptionId: subscription.id,
    amount: input.amount,
    currency: input.currency ?? "PYG",
    method: input.method,
    reference: input.reference,
    recordedBy: ctx.userId,
    notes: input.notes,
  });

  await db
    .update(subscriptions)
    .set({ expiresAt: newExpiresAt, status: "active" })
    .where(eq(subscriptions.id, subscription.id));

  await writeAuditLog({
    tenantId: subscription.tenantId,
    actorUserId: ctx.userId,
    action: "payment.recorded",
    entity: "payment",
    entityId: paymentId,
    payload: {
      subscriptionId: subscription.id,
      amount: input.amount,
      newExpiresAt: newExpiresAt.toISOString(),
    },
  });

  return { payment: await getPayment(paymentId), subscription: await getSubscription(subscription.id) };
}

export async function getPayment(paymentId: string) {
  const [row] = await db.select().from(payments).where(eq(payments.id, paymentId));
  return row ?? null;
}

export async function listPaymentsForSubscription(subscriptionId: string) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.subscriptionId, subscriptionId)))
    .orderBy(desc(payments.createdAt));
}

/**
 * Access status for the suspension/expiry middleware (PLAN.md §10 1B: "grace
 * → read-only banner → locked"). Tenant.status === "suspended" always locks,
 * regardless of subscription. A tenant with no subscription yet (fresh
 * `trial` tenant, e.g. the owner's own bootstrap tenant) is treated as
 * active — billing hasn't started, not "expired".
 */
/**
 * Days out at which an expiry warning email fires (§10 1M). Checked as exact
 * equality against a daily cron tick rather than a "warned" flag on the row
 * (no migration needed): each threshold is crossed once per subscription as
 * the days-remaining count ticks down, so a subscription due in 7 days gets
 * exactly one email at the 7-day mark and one at the 1-day mark, as long as
 * the cron fires at roughly the same time each day.
 */
export const EXPIRY_WARNING_THRESHOLDS_DAYS = [7, 1] as const;

export type ExpiringSubscription = {
  tenantId: string;
  subscriptionId: string;
  expiresAt: Date;
  daysRemaining: number;
};

/**
 * The latest subscription per tenant, filtered to ones about to cross a
 * warning threshold. Reads the whole table rather than one query per
 * tenant — the same platform-wide-is-small reasoning as listTenants()
 * elsewhere in this module — then reduces to one row per tenant by taking
 * the max startsAt, mirroring what getLatestSubscriptionForTenant does for
 * a single tenant.
 */
export async function listSubscriptionsCrossingExpiryWarning(): Promise<ExpiringSubscription[]> {
  const rows = await db.select().from(subscriptions);

  const latestByTenant = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = latestByTenant.get(row.tenantId);
    if (!current || row.startsAt > current.startsAt) {
      latestByTenant.set(row.tenantId, row);
    }
  }

  const now = Date.now();
  const results: ExpiringSubscription[] = [];
  for (const subscription of latestByTenant.values()) {
    if (subscription.status !== "active") continue;
    const daysRemaining = Math.ceil((subscription.expiresAt.getTime() - now) / 86_400_000);
    if ((EXPIRY_WARNING_THRESHOLDS_DAYS as readonly number[]).includes(daysRemaining)) {
      results.push({
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        expiresAt: subscription.expiresAt,
        daysRemaining,
      });
    }
  }
  return results;
}

export async function computeAccessStatus(tenantId: string, tenantStatus: string): Promise<AccessStatus> {
  if (tenantStatus === "suspended") return "locked";

  const subscription = await getLatestSubscriptionForTenant(tenantId);
  if (!subscription) return "active";

  const now = new Date();
  if (subscription.expiresAt > now) return "active";

  const graceEnds = new Date(subscription.expiresAt);
  graceEnds.setDate(graceEnds.getDate() + GRACE_PERIOD_DAYS);
  return now < graceEnds ? "grace" : "locked";
}
