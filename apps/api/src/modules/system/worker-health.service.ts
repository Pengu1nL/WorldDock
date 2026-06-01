import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue, type ConnectionOptions } from "bullmq";
import {
  WORKER_QUEUE_DESCRIPTORS,
  readQueueHealth,
  summarizeQueueHealth,
  type QueueHealth,
  type QueueHealthSnapshot,
  type QueueMetricReader,
} from "@worlddock/domain";

export const WORKER_QUEUE_READERS = Symbol("WORKER_QUEUE_READERS");
export const WORKER_QUEUE_READ_TIMEOUT_MS = 1_500;

export type ClosableQueueMetricReader = QueueMetricReader & {
  close?: () => Promise<void>;
};

@Injectable()
export class WorkerHealthService implements OnModuleDestroy {
  constructor(@Inject(WORKER_QUEUE_READERS) private readonly queueReaders: ClosableQueueMetricReader[]) {}

  async getSnapshot(now = new Date()): Promise<QueueHealthSnapshot> {
    const queues = await Promise.all(
      this.queueReaders.map((queue) => readQueueHealthWithTimeout(queue, WORKER_QUEUE_READ_TIMEOUT_MS)),
    );
    return summarizeQueueHealth(queues, now);
  }

  async onModuleDestroy() {
    await Promise.all(this.queueReaders.map((queue) => queue.close?.()));
  }
}

async function readQueueHealthWithTimeout(queue: QueueMetricReader, timeoutMs: number): Promise<QueueHealth> {
  try {
    return await withTimeout(readQueueHealth(queue), timeoutMs);
  } catch {
    return createUnavailableQueueHealth(queue.name);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Queue health read timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function createUnavailableQueueHealth(name: string): QueueHealth {
  return {
    name,
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 1,
    delayed: 0,
    paused: false,
  };
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
