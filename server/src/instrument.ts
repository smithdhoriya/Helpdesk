import * as Sentry from "@sentry/bun";

// Imported before any other module (see src/index.ts) so Sentry can capture
// errors throughout the app's lifecycle. Error monitoring only — no tracing,
// session replay, profiling, or metrics are enabled.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? "development",
});
