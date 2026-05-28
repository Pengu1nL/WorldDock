import * as Sentry from "@sentry/node";
import { trace } from "@opentelemetry/api";

type ObservabilityContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

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

export function captureException(error: unknown, context?: ObservabilityContext) {
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      applyContext(scope, context);
      Sentry.captureException(error);
    });
  }
}

export function captureMessage(message: string, context?: ObservabilityContext) {
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      applyContext(scope, context);
      Sentry.captureMessage(message);
    });
  }
}

export function getTracer() {
  return trace.getTracer("worlddock-api");
}

function applyContext(scope: Sentry.Scope, context?: ObservabilityContext) {
  for (const [key, value] of Object.entries(context?.tags ?? {})) {
    scope.setTag(key, value);
  }
  if (context?.extra) {
    scope.setExtras(context.extra);
  }
}
