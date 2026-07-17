export type JobHandler = (payload: unknown, tenantId: string | null) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

// `queue.test` exists purely to exercise the worker's claim/retry/backoff
// path in dev and CI (1A exit criteria) — real modules register their own
// handlers here (e.g. `automation.trigger`, `whatsapp.send`) as they land.
registerHandler("queue.test", async (payload) => {
  const { failUntilAttempt } = (payload as { failUntilAttempt?: number }) ?? {};
  if (failUntilAttempt !== undefined) {
    throw new Error(`queue.test forced failure (target attempt ${failUntilAttempt})`);
  }
});
