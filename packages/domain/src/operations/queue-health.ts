import { z } from "zod";

export const WORKER_QUEUE_DESCRIPTORS = [
  { name: "repository-search-indexing", purpose: "Sync public repository documents into Meilisearch" },
  { name: "moderation-scan", purpose: "Scan reported or risky public repositories" },
  { name: "exports", purpose: "Prepare account data export packages" },
] as const;

export type WorkerQueueName = typeof WORKER_QUEUE_DESCRIPTORS[number]["name"];

export const queueHealthStatusSchema = z.enum(["healthy", "paused", "backlogged", "degraded"]);
export type QueueHealthStatus = z.infer<typeof queueHealthStatusSchema>;

export const queueHealthSchema = z.object({
  name: z.string().min(1),
  waiting: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  paused: z.boolean(),
});

export type QueueHealth = z.infer<typeof queueHealthSchema>;

export const queueHealthWithStatusSchema = queueHealthSchema.extend({
  status: queueHealthStatusSchema,
});

export type QueueHealthWithStatus = z.infer<typeof queueHealthWithStatusSchema>;

export const queueHealthSnapshotSchema = z.object({
  status: queueHealthStatusSchema,
  generatedAt: z.string().datetime(),
  queues: z.array(queueHealthWithStatusSchema),
});

export type QueueHealthSnapshot = z.infer<typeof queueHealthSnapshotSchema>;

export type QueueMetricReader = {
  name: string;
  getJobCounts(...statuses: Array<"waiting" | "active" | "completed" | "failed" | "delayed">): Promise<Partial<Record<"waiting" | "active" | "completed" | "failed" | "delayed", number>>>;
  isPaused(): Promise<boolean>;
};

const statusRank: Record<QueueHealthStatus, number> = {
  healthy: 0,
  paused: 1,
  backlogged: 2,
  degraded: 3,
};

export function classifyQueueHealth(queue: QueueHealth): QueueHealthStatus {
  if (queue.paused) return "paused";
  if (queue.failed > 0) return "degraded";
  if (queue.waiting > 1000) return "backlogged";
  return "healthy";
}

export async function readQueueHealth(queue: QueueMetricReader): Promise<QueueHealth> {
  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  return queueHealthSchema.parse({
    name: queue.name,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: await queue.isPaused(),
  });
}

export async function createQueueHealthSnapshot(queues: QueueMetricReader[], now = new Date()): Promise<QueueHealthSnapshot> {
  const health = await Promise.all(queues.map((queue) => readQueueHealth(queue)));
  return summarizeQueueHealth(health, now);
}

export function summarizeQueueHealth(queues: QueueHealth[], now = new Date()): QueueHealthSnapshot {
  const queuesWithStatus = queues.map((queue) => ({
    ...queueHealthSchema.parse(queue),
    status: classifyQueueHealth(queue),
  }));
  const status = queuesWithStatus.reduce<QueueHealthStatus>((current, queue) => {
    return statusRank[queue.status] > statusRank[current] ? queue.status : current;
  }, "healthy");

  return queueHealthSnapshotSchema.parse({
    status,
    generatedAt: now.toISOString(),
    queues: queuesWithStatus,
  });
}

export function assertWorkerReleaseReady(input: { snapshot: QueueHealthSnapshot; stagingSmokeCompleted: boolean }) {
  if (!input.stagingSmokeCompleted) {
    throw new Error("Staging smoke must pass before production release.");
  }

  const unhealthyQueues = input.snapshot.queues.filter((queue) => queue.status !== "healthy");
  if (unhealthyQueues.length > 0) {
    throw new Error(`Worker queues are not healthy: ${unhealthyQueues.map((queue) => `${queue.name}:${queue.status}`).join(", ")}`);
  }
}
