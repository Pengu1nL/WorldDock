import { Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import { processSearchIndexingEvent, type SearchIndex, type SearchOutboxEvent } from "./search-indexing";

export const REPOSITORY_SEARCH_QUEUE = "repository-search-indexing";
export const SEARCH_INDEX_JOB_NAME = "sync-repository-search-document";

export type RepositorySearchJob = {
  eventId: string;
  eventType: string;
  repositoryId: string;
};

export type PendingSearchOutbox = {
  listPending(limit?: number): Promise<SearchOutboxEvent[]>;
};

export type SearchJobQueue = {
  add(name: string, data: RepositorySearchJob, options?: JobsOptions): Promise<unknown>;
};

export type SearchWorkerSource = {
  loadRepository: (repositoryId: string) => Promise<Parameters<typeof processSearchIndexingEvent>[2] extends (id: string) => Promise<infer Result> ? Result : never>;
  markProcessed(eventId: string, processedAt: Date): Promise<unknown>;
};

export function createRedisConnection(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined,
    maxRetriesPerRequest: null,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function createRepositorySearchQueue(redisUrl?: string) {
  return new Queue<RepositorySearchJob>(REPOSITORY_SEARCH_QUEUE, {
    connection: createRedisConnection(redisUrl),
  });
}

export async function enqueuePendingSearchOutboxEvents(
  outbox: PendingSearchOutbox,
  queue: SearchJobQueue,
  limit = 100,
) {
  const events = (await outbox.listPending(limit))
    .filter((event) => event.type.startsWith("repository."));

  for (const event of events) {
    await queue.add(SEARCH_INDEX_JOB_NAME, {
      eventId: event.id,
      eventType: event.type,
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

export function createRepositorySearchWorker(options: {
  redisUrl?: string;
  index: SearchIndex;
  source: SearchWorkerSource;
}) {
  return new Worker<RepositorySearchJob>(
    REPOSITORY_SEARCH_QUEUE,
    async (job) => {
      const result = await processSearchIndexingEvent(
        {
          id: job.data.eventId,
          type: job.data.eventType,
          aggregateId: job.data.repositoryId,
          payload: job.data,
        },
        options.index,
        options.source.loadRepository,
      );
      await options.source.markProcessed(job.data.eventId, new Date());
      return result;
    },
    { connection: createRedisConnection(options.redisUrl) },
  );
}
