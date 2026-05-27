import * as Sentry from "@sentry/node";
import { trace } from "@opentelemetry/api";
import { classifyQueueHealth, type QueueHealth } from "./queue-dashboard";

type ObservabilityContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export function initWorkerObservability(serviceName = "worlddock-worker") {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      tracesSampleRate: Number(process.env.OTEL_TRACES_SAMPLE_RATE ?? 0.1),
      serverName: serviceName,
    });
  }
}

export function captureWorkerException(error: unknown, context?: ObservabilityContext) {
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      applyContext(scope, context);
      Sentry.captureException(error);
    });
  }
}

export function captureWorkerQueueHealth(queue: QueueHealth) {
  const status = classifyQueueHealth(queue);
  if (status !== "healthy") {
    captureWorkerException(new Error(`Worker queue ${queue.name} is ${status}`), {
      tags: {
        component: "worker",
        queue: queue.name,
        queue_status: status,
      },
      extra: queue,
    });
  }
  return status;
}

export function workerTracer() {
  return trace.getTracer("worlddock-worker");
}

function applyContext(scope: Sentry.Scope, context?: ObservabilityContext) {
  for (const [key, value] of Object.entries(context?.tags ?? {})) {
    scope.setTag(key, value);
  }
  if (context?.extra) {
    scope.setExtras(context.extra);
  }
}
