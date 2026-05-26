import * as Sentry from "@sentry/node";
import { trace } from "@opentelemetry/api";

export function initObservability(serviceName: string) {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      tracesSampleRate: Number(process.env.OTEL_TRACES_SAMPLE_RATE ?? 0.1),
      serverName: serviceName,
    });
  }
}

export function captureException(error: unknown) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
}

export function getTracer() {
  return trace.getTracer("worlddock-api");
}
