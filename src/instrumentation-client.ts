import * as Sentry from "@sentry/nextjs";

// Client-side error tracking (PLAN.md §10 1H #4). No-ops cleanly if the DSN
// isn't set — local dev and any deploy that hasn't wired up a Sentry
// project yet just don't send anything, no crash.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // Conservative default — this is a low-traffic internal CRM, not a
  // high-volume consumer app. Raise later if trace data proves useful.
  tracesSampleRate: 0.1,
});
