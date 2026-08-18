"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperadminContext } from "@/modules/tenancy/context";
import { requeueJob } from "@/lib/queue/ops";
import { writeAuditLog } from "@/modules/tenancy/audit";

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
