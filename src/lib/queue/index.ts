import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { newId } from "@/lib/ids";

export type EnqueueOptions = {
  tenantId?: string;
  runAt?: Date;
  maxAttempts?: number;
};

// Every deferred/background operation goes through this — delayed automation
// steps and scheduled sends are just jobs with a future run_at (PLAN.md §2.1).
export async function enqueue(
  type: string,
  payload: unknown,
  options: EnqueueOptions = {},
): Promise<string> {
  const id = newId();

  await db.insert(jobs).values({
    id,
    type,
    payload: payload as object,
    tenantId: options.tenantId ?? null,
    runAt: options.runAt ?? new Date(),
    maxAttempts: options.maxAttempts ?? 5,
  });

  return id;
}
