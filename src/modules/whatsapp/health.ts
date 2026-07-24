import { and, desc, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, tenants, waAccounts, webhookEvents } from "@/db/schema";
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
