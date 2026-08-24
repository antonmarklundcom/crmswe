"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildSystemTenantContext, requireSuperadminContext } from "@/modules/tenancy/context";
import { requeueJob } from "@/lib/queue/ops";
import { writeAuditLog } from "@/modules/tenancy/audit";
import {
  clearAccountError,
  getAccountOwner,
  listDeadWhatsappJobIdsForTenant,
} from "@/modules/whatsapp/health";
import { scheduleTemplateSync } from "@/modules/whatsapp/sync-schedule";

const retrySchema = z.object({ jobId: z.string().min(1).max(26) });

/** Puts a dead or stuck job back in the queue (PLAN.md §13 H3 #3). */
export async function retryJobAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const { jobId } = retrySchema.parse({ jobId: formData.get("jobId") });

  const requeued = await requeueJob(jobId);
  if (requeued) {
    await writeAuditLog({
      actorUserId: ctx.userId,
      action: "job.retry",
      entity: "job",
      entityId: jobId,
    });
  }

  revalidatePath("/whatsapp-health");
}

// Actions on a tenant's WhatsApp connection, from the platform side. The
// health view could only ever describe a problem; these are the three things
// the operator would otherwise ask the tenant to do, and each one is
// something a superadmin can already do by impersonating them — this just
// removes the impersonation round trip. All audited, none of them touching
// credentials.

const accountSchema = z.object({ accountId: z.string().min(1).max(26) });
const tenantSchema = z.object({ tenantId: z.string().min(1).max(26) });

/**
 * Pulls the template list from Meta now instead of waiting for the nightly
 * chain — the fix for "I approved a template this morning and it isn't in
 * the dropdown", and for a sync chain that ended when a token broke (the
 * chain reseeds itself on a successful run, see sync-schedule.ts).
 */
export async function syncTemplatesAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const { accountId } = accountSchema.parse({ accountId: formData.get("accountId") });

  const account = await getAccountOwner(accountId);
  if (!account) return;

  // A system context, not the superadmin's: the job runs as the tenant, and
  // scheduleTemplateSync tags the job with the tenant id so the worker
  // rebuilds the same scope (§3.3, "jobs carry tenant_id").
  const tenantCtx = await buildSystemTenantContext(account.tenantId);
  if (!tenantCtx) return;
  await scheduleTemplateSync(tenantCtx, accountId);

  await writeAuditLog({
    tenantId: account.tenantId,
    actorUserId: ctx.userId,
    action: "whatsapp.templates_sync_requested",
    entity: "wa_account",
    entityId: accountId,
  });

  revalidatePath("/whatsapp-health");
}

/**
 * Clears the `error` flag once the underlying problem is fixed. It changes no
 * credentials on purpose: if the token is still broken the next send flags it
 * again within seconds, so this can never paper over a real failure — it only
 * stops a fixed account from looking broken forever.
 */
export async function clearAccountErrorAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const { accountId } = accountSchema.parse({ accountId: formData.get("accountId") });

  const account = await getAccountOwner(accountId);
  if (!account) return;

  const cleared = await clearAccountError(accountId);
  if (cleared) {
    await writeAuditLog({
      tenantId: account.tenantId,
      actorUserId: ctx.userId,
      action: "whatsapp.error_cleared",
      entity: "wa_account",
      entityId: accountId,
    });
  }

  revalidatePath("/whatsapp-health");
}

/**
 * Requeues every dead WhatsApp job for one business. A broken token kills
 * sends in bulk, so recovering from it one row at a time was the wrong unit
 * of work — this is the same `requeueJob` the single-row button uses, in a
 * loop, so a job that is no longer dead is simply skipped.
 */
export async function retryTenantWhatsappJobsAction(formData: FormData) {
  const ctx = await requireSuperadminContext();
  const { tenantId } = tenantSchema.parse({ tenantId: formData.get("tenantId") });

  const ids = await listDeadWhatsappJobIdsForTenant(ctx, tenantId);
  let requeued = 0;
  for (const id of ids) {
    if (await requeueJob(id)) requeued += 1;
  }

  if (requeued > 0) {
    await writeAuditLog({
      tenantId,
      actorUserId: ctx.userId,
      action: "whatsapp.jobs_retried",
      entity: "tenant",
      entityId: tenantId,
      payload: { requeued },
    });
  }

  revalidatePath("/whatsapp-health");
}
