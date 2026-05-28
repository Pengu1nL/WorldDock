import { Controller, Get, Req } from "@nestjs/common";
import { captureMessage } from "../../common/observability";
import { getRequestId, type RequestWithRequestId } from "../../common/request-id";

type QueueHealth = {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
};

type QueueHealthStatus = "healthy" | "backlogged" | "degraded" | "paused";

const defaultQueues: QueueHealth[] = [
  { name: "repository-search", waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false },
  { name: "moderation-scan", waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false },
  { name: "exports", waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false },
];

const statusRank: Record<QueueHealthStatus, number> = {
  healthy: 0,
  paused: 1,
  backlogged: 2,
  degraded: 3,
};

@Controller("system")
export class WorkerHealthController {
  @Get("worker-health")
  workerHealth(@Req() request: RequestWithRequestId) {
    const queues = loadQueueHealth().map((queue) => ({
      ...queue,
      status: classifyQueueHealth(queue),
    }));
    const status = queues.reduce<QueueHealthStatus>((current, queue) => {
      return statusRank[queue.status] > statusRank[current] ? queue.status : current;
    }, "healthy");

    for (const queue of queues) {
      if (queue.status !== "healthy") {
        captureMessage(`Worker queue ${queue.name} is ${queue.status}`, {
          tags: {
            component: "worker",
            queue: queue.name,
            queue_status: queue.status,
          },
          extra: {
            waiting: queue.waiting,
            active: queue.active,
            completed: queue.completed,
            failed: queue.failed,
            delayed: queue.delayed,
            paused: queue.paused,
          },
        });
      }
    }

    return {
      status,
      ready: status === "healthy",
      queues,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(request),
    };
  }
}

function classifyQueueHealth(queue: QueueHealth): QueueHealthStatus {
  if (queue.paused) return "paused";
  if (queue.failed > 0) return "degraded";
  if (queue.waiting > 1000) return "backlogged";
  return "healthy";
}

function loadQueueHealth(): QueueHealth[] {
  if (!process.env.WORKER_QUEUE_HEALTH_JSON) {
    return defaultQueues;
  }

  const parsed = JSON.parse(process.env.WORKER_QUEUE_HEALTH_JSON) as QueueHealth[];
  return parsed.map((queue) => ({
    name: String(queue.name),
    waiting: Number(queue.waiting ?? 0),
    active: Number(queue.active ?? 0),
    completed: Number(queue.completed ?? 0),
    failed: Number(queue.failed ?? 0),
    delayed: Number(queue.delayed ?? 0),
    paused: Boolean(queue.paused),
  }));
}
