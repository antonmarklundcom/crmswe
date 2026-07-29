// Next.js `register()` hook (https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation) —
// starts the job queue worker in-process and wires up Sentry (PLAN.md §10
// 1H #4). Skipped outside the Node.js runtime (e.g. edge) and during the
// build phase, which also imports this module but has no live
// DATABASE_URL/worker to run.
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    const { startWorker } = await import("@/worker");
    startWorker();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
