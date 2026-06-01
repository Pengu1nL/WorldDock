import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueueHealthWithStatus } from "@worlddock/domain";

const captureMessage = vi.fn();

vi.mock("../../common/observability", () => ({
  captureMessage,
}));

describe("captureUnhealthyQueueMessages", () => {
  afterEach(() => {
    captureMessage.mockClear();
  });

  it("captures a Sentry message for every non-healthy worker queue", async () => {
    const { captureUnhealthyQueueMessages } = await import("./worker-health.controller");

    const queues: QueueHealthWithStatus[] = [
      { name: "repository-search-indexing", waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false, status: "healthy" },
      { name: "moderation-scan", waiting: 0, active: 0, completed: 3, failed: 1, delayed: 0, paused: false, status: "degraded" },
      { name: "exports", waiting: 1200, active: 0, completed: 3, failed: 0, delayed: 0, paused: false, status: "backlogged" },
    ];

    captureUnhealthyQueueMessages(queues);

    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(captureMessage).toHaveBeenNthCalledWith(1, "Worker queue moderation-scan is degraded", {
      tags: {
        component: "worker",
        queue: "moderation-scan",
        queue_status: "degraded",
      },
      extra: {
        waiting: 0,
        active: 0,
        completed: 3,
        failed: 1,
        delayed: 0,
        paused: false,
      },
    });
    expect(captureMessage).toHaveBeenNthCalledWith(2, "Worker queue exports is backlogged", {
      tags: {
        component: "worker",
        queue: "exports",
        queue_status: "backlogged",
      },
      extra: {
        waiting: 1200,
        active: 0,
        completed: 3,
        failed: 0,
        delayed: 0,
        paused: false,
      },
    });
  });
});
