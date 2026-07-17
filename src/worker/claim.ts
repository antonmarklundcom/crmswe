import { and, eq, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { jobs } from "@/db/schema";
import * as schema from "@/db/schema";

export type Job = typeof jobs.$inferSelect;

// Claims exactly one due job for this worker instance. Runs inside a
// transaction so the SELECT ... FOR UPDATE SKIP LOCKED lock is held only
// long enough to flip the row to `running` — safe for multiple worker
// processes against the same MySQL (PLAN.md §2.1).
export async function claimNextJob(
  db: MySql2Database<typeof schema>,
  workerId: string,
): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, new Date())))
      .orderBy(jobs.runAt)
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) return null;

    await tx
      .update(jobs)
      .set({
        status: "running",
        lockedAt: new Date(),
        lockedBy: workerId,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(jobs.id, candidate.id));

    return candidate;
  });
}
