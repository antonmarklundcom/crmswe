import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs only when a real MySQL is reachable (CI provides one as a service
// container — see .github/workflows/ci.yml). Skipped locally without
// DATABASE_URL so `npm test` doesn't require a live database.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("worker (MySQL integration)", () => {
  let db: (typeof import("@/db/client"))["db"];
  let jobs: (typeof import("@/db/schema"))["jobs"];
  let tick: (typeof import("./index"))["tick"];
  let newId: (typeof import("@/lib/ids"))["newId"];

  beforeAll(async () => {
    ({ db } = await import("@/db/client"));
    ({ jobs } = await import("@/db/schema"));
    ({ tick } = await import("./index"));
    ({ newId } = await import("@/lib/ids"));
    await import("./handlers");
  });

  afterAll(async () => {
    if (!db) return; // beforeAll failed before assigning it — nothing to close
    const pool = (db as unknown as { $client: { end: () => Promise<void> } })
      .$client;
    await pool.end();
  });

  it("processes a job to done on first success", async () => {
    const id = newId();
    await db.insert(jobs).values({
      id,
      type: "queue.test",
      payload: {},
      runAt: new Date(),
    });

    const didWork = await tick("test-worker");
    expect(didWork).toBe(true);

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("done");
    expect(row.attempts).toBe(1);
  });

  it("retries with exponential backoff and eventually dead-letters", async () => {
    const id = newId();
    await db.insert(jobs).values({
      id,
      type: "queue.test",
      payload: { failUntilAttempt: 999 },
      runAt: new Date(),
      maxAttempts: 2,
    });

    // Attempt 1: fails, rescheduled ~1s out (not due yet) -> claim finds nothing.
    await tick("test-worker");
    let [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("forced failure");
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now() - 500);

    // Force it due now so we don't wait out the real backoff in the test.
    await db.update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, id));

    // Attempt 2: fails, hits maxAttempts -> dead.
    const didWork = await tick("test-worker");
    expect(didWork).toBe(true);

    [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("dead");
    expect(row.attempts).toBe(2);
  });

  it("dead-letters jobs with no registered handler", async () => {
    const id = newId();
    await db.insert(jobs).values({
      id,
      type: "no.such.handler",
      payload: {},
      runAt: new Date(),
    });

    await tick("test-worker");

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("dead");
    expect(row.lastError).toContain("No handler registered");
  });
});
