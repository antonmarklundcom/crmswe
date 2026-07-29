import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, webhookEvents } from "@/db/schema";
import { enqueue } from "@/lib/queue";
import { registerHandler } from "@/worker/handlers";

// Recurring maintenance jobs (PLAN.md §10 1H #3). Same self-rescheduling
// pattern as modules/whatsapp/sync-schedule.ts's nightly template sync: the
// handler re-enqueues itself after each successful run, so the chain lives
// in the jobs table (survives restarts, needs no cron) rather than in a
// process timer.

export const PRUNE_JOB_TYPE = "maintenance.prune_webhook_events";
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

registerHandler(PRUNE_JOB_TYPE, async () => {
  await pruneWebhookEvents();
  await enqueue(PRUNE_JOB_TYPE, {}, { runAt: new Date(Date.now() + PRUNE_INTERVAL_MS) });
});

/** Deletes webhook_events rows older than the retention window (PLAN.md's
 * WhatsApp webhook_events note: raw payloads aren't kept indefinitely). */
export async function pruneWebhookEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [result] = await db
    .delete(webhookEvents)
    .where(and(lt(webhookEvents.createdAt, cutoff)));
  return (result as unknown as { affectedRows?: number }).affectedRows ?? 0;
}

/**
 * Seeds the pruning chain if it isn't already running — called once from
 * worker startup (worker/index.ts). Idempotent: does nothing if a job of
 * this type is already pending/running, so restarting the worker never
 * spawns a second parallel chain.
 */
export async function ensureWebhookPruningScheduled(): Promise<void> {
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, PRUNE_JOB_TYPE), eq(jobs.status, "pending")))
    .limit(1);
  if (existing) return;

  const [running] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, PRUNE_JOB_TYPE), eq(jobs.status, "running")))
    .limit(1);
  if (running) return;

  await enqueue(PRUNE_JOB_TYPE, {});
}
