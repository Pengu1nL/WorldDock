import { captureWorkerException } from "./observability";

export function notifyWorkerFailure(context: { queue: string; jobId?: string; error: unknown }) {
  captureWorkerException(context.error);
  console.error(JSON.stringify({
    level: "error",
    event: "worker.job_failed",
    queue: context.queue,
    jobId: context.jobId,
    message: context.error instanceof Error ? context.error.message : "Unknown worker error",
  }));
}
