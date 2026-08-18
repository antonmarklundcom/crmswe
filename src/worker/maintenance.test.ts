import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// Same shape as index.integration.test.ts: real MySQL when one is reachable
// (CI provides it), skipped otherwise.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("job reaper (MySQL integration)", () => {
  let db: (typeof import("@/db/client"))["db"];
  let jobs: (typeof import("@/db/schema"))["jobs"];
  let reapStuckJobs: (typeof import("./maintenance"))["reapStuckJobs"];
  let STUCK_AFTER_MS: (typeof import("./maintenance"))["STUCK_AFTER_MS"];
  let newId: (typeof import("@/lib/ids"))["newId"];
  let resetErrorSink: (typeof import("@/lib/observability"))["resetErrorSink"];
  let setErrorSink: (typeof import("@/lib/observability"))["setErrorSink"];

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    ({ jobs } = await import("@/db/schema"));
    ({ reapStuckJobs, STUCK_AFTER_MS } = await import("./maintenance"));
    ({ newId } = await import("@/lib/ids"));
    ({ resetErrorSink, setErrorSink } = await import("@/lib/observability"));
    await db.delete(jobs);
  });

  afterEach(async () => {
    resetErrorSink();
    await db.delete(jobs);
  });

  afterAll(async () => {
    if (!db) return;
    const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await pool.end();
  });

  async function insertRunning(lockedAt: Date, attempts = 0, maxAttempts = 5) {
    const id = newId();
    await db.insert(jobs).values({
      id,
      type: "queue.test",
      payload: {},
      runAt: new Date(Date.now() - 60_000),
      status: "running",
      attempts,
      maxAttempts,
      lockedAt,
      lockedBy: "dead-worker",
    });
    return id;
  }

  it("returns a job whose worker died to pending, counting the attempt", async () => {
    const id = await insertRunning(new Date(Date.now() - STUCK_AFTER_MS - 60_000));

    expect(await reapStuckJobs()).toBe(1);

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.lockedAt).toBeNull();
    expect(row.lockedBy).toBeNull();
    expect(row.lastError).toContain("Reaped");
  });

  it("leaves a job that is still within its lock window alone", async () => {
    const id = await insertRunning(new Date(Date.now() - 60_000));

    expect(await reapStuckJobs()).toBe(0);

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("running");
    expect(row.attempts).toBe(0);
  });

  it("kills a job that has exhausted its attempts instead of looping it", async () => {
    const id = await insertRunning(new Date(Date.now() - STUCK_AFTER_MS - 60_000), 4, 5);

    await reapStuckJobs();

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("dead");
    expect(row.attempts).toBe(5);
  });

  it("reports every reaped job", async () => {
    const reported: Array<Record<string, string | undefined>> = [];
    setErrorSink((_error, context) => reported.push(context.tags ?? {}));

    await insertRunning(new Date(Date.now() - STUCK_AFTER_MS - 60_000));
    await reapStuckJobs();

    expect(reported).toEqual([
      { area: "worker", jobType: "queue.test", outcome: "requeued" },
    ]);
  });
});
