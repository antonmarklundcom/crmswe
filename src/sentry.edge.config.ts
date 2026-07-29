import * as Sentry from "@sentry/nextjs";

// Edge runtime error tracking (middleware.ts) — same config shape as
// sentry.server.config.ts, kept separate because Next loads it only for
// the edge runtime (PLAN.md §10 1H #4).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
