import * as Sentry from "@sentry/nextjs";

// Server-side error tracking (PLAN.md §10 1H #4), loaded from
// instrumentation.ts's register() hook for the nodejs runtime. No-ops
// cleanly without a DSN — same reasoning as instrumentation-client.ts.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
