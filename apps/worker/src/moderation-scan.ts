import { Queue, Worker, type JobsOptions } from "bullmq";
import { createRedisConnection, type PendingSearchOutbox } from "./search-indexing.queue";

export const MODERATION_SCAN_QUEUE = "moderation-scan";
export const MODERATION_SCAN_JOB_NAME = "scan-public-repository";
export const DUPLICATE_REPORT_THRESHOLD = 3;

export type ModerationScanJob = {
  eventId?: string;
  repositoryId: string;
};

export type ModerationScanQueue = {
  add(name: string, data: ModerationScanJob, options?: JobsOptions): Promise<unknown>;
};

export type RepositoryModerationSnapshot = {
  id: string;
  name: string;
  summary: string;
  tags: string[];
};

export type ModerationScanSource = {
  loadRepositoryForModeration(repositoryId: string): Promise<RepositoryModerationSnapshot | null>;
  countOpenReports(repositoryId: string): Promise<number>;
  flagRepository(repositoryId: string, reason: string): Promise<unknown>;
};

const sensitiveWords = ["违禁", "暴恐", "仇恨"];

export function scanRepositoryForModeration(repository: RepositoryModerationSnapshot, openReportCount: number) {
  const findings: string[] = [];
  const text = `${repository.name} ${repository.summary} ${repository.tags.join(" ")}`.toLowerCase();

  if (!repository.name.trim() || !repository.summary.trim()) {
    findings.push("empty_content");
  }

  if (sensitiveWords.some((word) => text.includes(word))) {
    findings.push("sensitive_word");
  }

  if (openReportCount >= DUPLICATE_REPORT_THRESHOLD) {
    findings.push("duplicate_report_threshold");
  }

  return findings;
}

export async function processModerationScanJob(job: ModerationScanJob, source: ModerationScanSource) {
  const repository = await source.loadRepositoryForModeration(job.repositoryId);
  if (!repository) return "missing" as const;

  const findings = scanRepositoryForModeration(repository, await source.countOpenReports(job.repositoryId));
  if (findings.length === 0) return "passed" as const;

  await source.flagRepository(job.repositoryId, findings.join(","));
  return "flagged" as const;
}

export function createModerationScanQueue(redisUrl?: string) {
  return new Queue<ModerationScanJob>(MODERATION_SCAN_QUEUE, {
    connection: createRedisConnection(redisUrl),
  });
}

export async function enqueuePendingModerationScanEvents(
  outbox: PendingSearchOutbox,
  queue: ModerationScanQueue,
  limit = 100,
) {
  const events = (await outbox.listPending(limit))
    .filter((event) => event.type === "repository.moderation_scan_requested");

  for (const event of events) {
    await queue.add(MODERATION_SCAN_JOB_NAME, {
      eventId: event.id,
      repositoryId: event.aggregateId,
    }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
      jobId: event.id,
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }

  return events.length;
}

export function createModerationScanWorker(options: {
  redisUrl?: string;
  source: ModerationScanSource;
}) {
  return new Worker<ModerationScanJob>(
    MODERATION_SCAN_QUEUE,
    async (job) => processModerationScanJob(job.data, options.source),
    { connection: createRedisConnection(options.redisUrl) },
  );
}
