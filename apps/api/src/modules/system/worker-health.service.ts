import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue, type ConnectionOptions } from "bullmq";
import {
  WORKER_QUEUE_DESCRIPTORS,
  createQueueHealthSnapshot,
  type QueueHealthSnapshot,
  type QueueMetricReader,
} from "@worlddock/domain";

export const WORKER_QUEUE_READERS = Symbol("WORKER_QUEUE_READERS");

export type ClosableQueueMetricReader = QueueMetricReader & {
  close?: () => Promise<void>;
};

@Injectable()
export class WorkerHealthService implements OnModuleDestroy {
  constructor(@Inject(WORKER_QUEUE_READERS) private readonly queueReaders: ClosableQueueMetricReader[]) {}

  async getSnapshot(now = new Date()): Promise<QueueHealthSnapshot> {
    return createQueueHealthSnapshot(this.queueReaders, now);
  }

  async onModuleDestroy() {
    await Promise.all(this.queueReaders.map((queue) => queue.close?.()));
  }
}

export function createBullMqWorkerQueueReaders(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"): ClosableQueueMetricReader[] {
  const connection = createRedisConnection(redisUrl);
  return WORKER_QUEUE_DESCRIPTORS.map((descriptor) => {
    let queue: Queue | undefined;
    const getQueue = () => {
      queue ??= new Queue(descriptor.name, { connection });
      return queue;
    };

    return {
      name: descriptor.name,
      getJobCounts: (...statuses) => getQueue().getJobCounts(...statuses),
      isPaused: () => getQueue().isPaused(),
      close: async () => {
        await queue?.close();
      },
    };
  });
}

export function createRedisConnection(redisUrl: string): ConnectionOptions {
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
