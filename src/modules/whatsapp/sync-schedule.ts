import { enqueue } from "@/lib/queue";
import type { TenantContext } from "@/modules/tenancy/context";

// Scheduling half of the template sync, split out from templates.ts so it
// depends only on the queue. templates.ts needs accounts.ts (token, account
// lookup) and accounts.ts needs to schedule a sync on connect — importing
// scheduling from here keeps that from becoming an import cycle.

export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Seeds the recurring nightly sync for an account (called on connect, §6.4).
 * The job re-enqueues itself after a successful run, so the chain lives in
 * the jobs table and survives restarts (§2.1) with no cron dependency. A
 * permanently failing sync ends its own chain — deliberate: it means the
 * token is broken, and the fix (reconnect, or the manual sync button)
 * reseeds it. Both are visible in the superadmin health view.
 */
export async function scheduleTemplateSync(
  ctx: TenantContext,
  accountId: string,
  delayMs = 0,
) {
  await enqueue(
    "whatsapp.sync_templates",
    { accountId },
    { tenantId: ctx.tenantId, runAt: new Date(Date.now() + delayMs) },
  );
}
