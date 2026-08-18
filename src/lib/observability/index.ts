import * as Sentry from "@sentry/nextjs";

// Sentry is configured (sentry.*.config.ts) but nothing ever reported to it
// — every failure lived and died in the server log (PLAN.md §13 H3 #1).
// This is the one place that reports, so every call site tags the same way
// and CI can swap the sink for an assertion instead of a network client.

export type ErrorContext = {
  /** Short, low-cardinality labels — job type, route, worker id. */
  tags?: Record<string, string | undefined>;
  /** Anything else worth having in the issue: ids, counts, payload shape. */
  extra?: Record<string, unknown>;
};

export type ErrorSink = (error: unknown, context: ErrorContext) => void;

function defaultSink(error: unknown, context: ErrorContext): void {
  // The log line stays regardless of whether a DSN is configured: on
  // Hostinger the app log is what the owner actually reads (docs/DEPLOY.md).
  console.error("[error]", context.tags ?? {}, error);

  Sentry.captureException(error, {
    tags: Object.fromEntries(
      Object.entries(context.tags ?? {}).filter(([, value]) => value !== undefined),
    ) as Record<string, string>,
    extra: context.extra,
  });
}

let sink: ErrorSink = defaultSink;

/** Test seam: replace the sink, e.g. to assert a worker failure was reported. */
export function setErrorSink(next: ErrorSink): void {
  sink = next;
}

export function resetErrorSink(): void {
  sink = defaultSink;
}

export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    sink(error, context);
  } catch {
    // Reporting must never be the thing that takes a request or a job down.
  }
}
