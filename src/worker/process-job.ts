import { eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { jobs } from "@/db/schema";
import * as schema from "@/db/schema";
import { nextRunAt } from "@/lib/queue/backoff";
import { getHandler } from "./handlers";
import type { Job } from "./claim";

export async function processJob(
  db: MySql2Database<typeof schema>,
  job: Job,
): Promise<void> {
  const handler = getHandler(job.type);
  const attempts = job.attempts + 1;

  if (!handler) {
    await db
      .update(jobs)
      .set({
        status: "dead",
        attempts,
        lastError: `No handler registered for job type "${job.type}"`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(jobs.id, job.id));
    return;
  }

  try {
    await handler(job.payload, job.tenantId);
    await db
      .update(jobs)
      .set({ status: "done", attempts, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(jobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const dead = attempts >= job.maxAttempts;

    await db
      .update(jobs)
      .set({
        status: dead ? "dead" : "pending",
        attempts,
        runAt: dead ? job.runAt : nextRunAt(attempts),
        lastError: message.slice(0, 2000),
        lockedAt: null,
        lockedBy: null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(jobs.id, job.id));
  }
}
