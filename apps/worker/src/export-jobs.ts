import { Queue, Worker, type JobsOptions } from "bullmq";
import { createRedisConnection } from "./search-indexing.queue";

export const EXPORT_QUEUE = "exports";
export const ACCOUNT_EXPORT_JOB_NAME = "account-data-export";

export type AccountExportJob = {
  exportId: string;
  userId: string;
};

export type ExportQueue = {
  add(name: string, data: AccountExportJob, options?: JobsOptions): Promise<unknown>;
};

export type AccountExportProcessor = {
  processAccountExport(job: AccountExportJob): Promise<unknown>;
};

export function createExportQueue(redisUrl?: string) {
  return new Queue<AccountExportJob>(EXPORT_QUEUE, {
    connection: createRedisConnection(redisUrl),
  });
}

export async function enqueueAccountExport(queue: ExportQueue, job: AccountExportJob) {
  return queue.add(ACCOUNT_EXPORT_JOB_NAME, job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1_000 },
    jobId: job.exportId,
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

export function createExportWorker(options: {
  redisUrl?: string;
  processor: AccountExportProcessor;
}) {
  return new Worker<AccountExportJob>(
    EXPORT_QUEUE,
    async (job) => options.processor.processAccountExport(job.data),
    { connection: createRedisConnection(options.redisUrl) },
  );
}
