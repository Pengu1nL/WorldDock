import { Controller, Get, Req } from "@nestjs/common";
import type { QueueHealthWithStatus } from "@worlddock/domain";
import { captureMessage } from "../../common/observability";
import { getRequestId, type RequestWithRequestId } from "../../common/request-id";
import { WorkerHealthService } from "./worker-health.service";

@Controller("system")
export class WorkerHealthController {
  constructor(private readonly workerHealth: WorkerHealthService) {}

  @Get("worker-health")
  async getWorkerHealth(@Req() request: RequestWithRequestId) {
    const snapshot = await this.workerHealth.getSnapshot();
    captureUnhealthyQueueMessages(snapshot.queues);

    return {
      status: snapshot.status,
      ready: snapshot.status === "healthy",
      generatedAt: snapshot.generatedAt,
      timestamp: snapshot.generatedAt,
      queues: snapshot.queues,
      requestId: getRequestId(request),
    };
  }
}

export function captureUnhealthyQueueMessages(queues: QueueHealthWithStatus[]) {
  for (const queue of queues) {
    if (queue.status === "healthy") continue;

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
