import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, messages, tenants, waAccounts, webhookEvents } from "@/db/schema";
import type { SuperadminContext } from "@/modules/tenancy/context";

// Platform WhatsApp health dashboard (PLAN.md §3.2, §10 1D: "superadmin
// WhatsApp health view — webhook failures, token errors, quality rating").
// Superadmin-only and platform-wide by definition: it exists precisely to
// look *across* tenants, so it takes a SuperadminContext and reads raw `db`
// rather than tenantDb (same shape as tenancy's own listTenants).

const RECENT_LIMIT = 50;

export async function listAccountHealth(ctx: SuperadminContext) {
  void ctx; // authorization is the caller's requireSuperadminContext()

  const rows = await db
    .select({
      id: waAccounts.id,
      tenantId: waAccounts.tenantId,
      tenantName: tenants.name,
      displayNumber: waAccounts.displayNumber,
      phoneNumberId: waAccounts.phoneNumberId,
      status: waAccounts.status,
      qualityRating: waAccounts.qualityRating,
      connectedVia: waAccounts.connectedVia,
      createdAt: waAccounts.createdAt,
    })
    .from(waAccounts)
    .leftJoin(tenants, eq(waAccounts.tenantId, tenants.id))
    .orderBy(desc(waAccounts.createdAt));

  return rows;
}

/** Webhook deliveries that never made it through processing (§6.3 rule 4). */
export async function listFailedWebhookEvents(ctx: SuperadminContext) {
  void ctx;

  return db
    .select({
      id: webhookEvents.id,
      phoneNumberId: webhookEvents.phoneNumberId,
      error: webhookEvents.error,
      createdAt: webhookEvents.createdAt,
    })
    .from(webhookEvents)
    .where(eq(webhookEvents.status, "failed"))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(RECENT_LIMIT);
}

/**
 * WhatsApp jobs that exhausted their retries. A dead `whatsapp.sync_templates`
 * row is also how a broken nightly sync chain shows up (see
 * sync-schedule.ts), so this doubles as the "sync stopped" signal.
 */
export async function listDeadWhatsappJobs(ctx: SuperadminContext) {
  void ctx;

  return db
    .select({
      id: jobs.id,
      type: jobs.type,
      tenantId: jobs.tenantId,
      attempts: jobs.attempts,
      lastError: jobs.lastError,
      runAt: jobs.runAt,
    })
    .from(jobs)
    .where(and(inArray(jobs.status, ["dead", "failed"]), like(jobs.type, "whatsapp.%")))
    .orderBy(desc(jobs.runAt))
    .limit(RECENT_LIMIT);
}

/**
 * Recent send failures across the platform, with the error Meta actually
 * returned. The health view could say an account was in error but never why,
 * so diagnosing one meant asking the tenant to reproduce it. The error column
 * is JSON as stored; the page renders it as text.
 */
export async function listRecentSendFailures(ctx: SuperadminContext, limit = 20) {
  void ctx;

  return db
    .select({
      id: messages.id,
      tenantId: messages.tenantId,
      tenantName: tenants.name,
      error: messages.error,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(tenants, eq(tenants.id, messages.tenantId))
    .where(and(eq(messages.status, "failed"), eq(messages.direction, "out")))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

/**
 * Dead WhatsApp jobs per tenant, so "this business's sends all died when its
 * token expired" is one number and one button rather than twenty rows to
 * click through.
 */
export async function countDeadJobsByTenant(ctx: SuperadminContext) {
  void ctx;

  const rows = await db
    .select({ tenantId: jobs.tenantId, value: sql<number>`count(*)` })
    .from(jobs)
    .where(and(inArray(jobs.status, ["dead", "failed"]), like(jobs.type, "whatsapp.%")))
    .groupBy(jobs.tenantId);

  return new Map(rows.map((row) => [row.tenantId ?? "", Number(row.value)]));
}

/** Every dead/failed WhatsApp job id for one tenant — what the bulk retry
 * button hands to `requeueJob`. */
export async function listDeadWhatsappJobIdsForTenant(
  ctx: SuperadminContext,
  tenantId: string,
): Promise<string[]> {
  void ctx;

  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.tenantId, tenantId),
        inArray(jobs.status, ["dead", "failed"]),
        like(jobs.type, "whatsapp.%"),
      ),
    );

  return rows.map((row) => row.id);
}

/** Puts an account that was flagged `error` back to `connected` — the state
 * change that says "the token is fixed, try again". Deliberately not a
 * reconnect: it changes no credentials, so if the token is still broken the
 * next send flags it again within seconds. */
export async function clearAccountError(accountId: string): Promise<boolean> {
  const [result] = await db
    .update(waAccounts)
    .set({ status: "connected" })
    .where(and(eq(waAccounts.id, accountId), eq(waAccounts.status, "error")));

  return ((result as unknown as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

/** The tenant an account belongs to — the health actions take an account id
 * from a form and need the tenant to build a system context and to audit. */
export async function getAccountOwner(
  accountId: string,
): Promise<{ id: string; tenantId: string } | null> {
  const [row] = await db
    .select({ id: waAccounts.id, tenantId: waAccounts.tenantId })
    .from(waAccounts)
    .where(eq(waAccounts.id, accountId));
  return row ?? null;
}
