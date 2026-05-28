export type QueueHealth = {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
};

export type QueueHealthStatus = "healthy" | "backlogged" | "degraded" | "paused";

export type QueueHealthWithStatus = QueueHealth & {
  status: QueueHealthStatus;
};

export type QueueHealthSnapshot = {
  status: QueueHealthStatus;
  generatedAt: string;
  queues: QueueHealthWithStatus[];
};

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
  return {
    name: queue.name,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: await queue.isPaused(),
  };
}

export async function createQueueHealthSnapshot(queues: QueueMetricReader[], now = new Date()): Promise<QueueHealthSnapshot> {
  const health = await Promise.all(queues.map((queue) => readQueueHealth(queue)));
  return summarizeQueueHealth(health, now);
}

export function summarizeQueueHealth(queues: QueueHealth[], now = new Date()): QueueHealthSnapshot {
  const queuesWithStatus = queues.map((queue) => ({
    ...queue,
    status: classifyQueueHealth(queue),
  }));
  const status = queuesWithStatus.reduce<QueueHealthStatus>((current, queue) => {
    return statusRank[queue.status] > statusRank[current] ? queue.status : current;
  }, "healthy");

  return {
    status,
    generatedAt: now.toISOString(),
    queues: queuesWithStatus,
  };
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
