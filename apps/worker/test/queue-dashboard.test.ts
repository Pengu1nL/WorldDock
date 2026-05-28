import { describe, expect, it, vi } from "vitest";
import {
  assertWorkerReleaseReady,
  classifyQueueHealth,
  createQueueHealthSnapshot,
  readQueueHealth,
  summarizeQueueHealth,
} from "../src/queue-dashboard";

describe("queue dashboard", () => {
  it("classifies queue health by paused, failed, backlog, and healthy states", () => {
    expect(classifyQueueHealth({ name: "search", waiting: 0, active: 0, completed: 1, failed: 0, delayed: 0, paused: true })).toBe("paused");
    expect(classifyQueueHealth({ name: "search", waiting: 0, active: 0, completed: 1, failed: 1, delayed: 0, paused: false })).toBe("degraded");
    expect(classifyQueueHealth({ name: "search", waiting: 1001, active: 0, completed: 1, failed: 0, delayed: 0, paused: false })).toBe("backlogged");
    expect(classifyQueueHealth({ name: "search", waiting: 4, active: 1, completed: 8, failed: 0, delayed: 0, paused: false })).toBe("healthy");
  });

  it("reads BullMQ-compatible queue counts into a snapshot", async () => {
    const queue = {
      name: "repository-search",
      getJobCounts: vi.fn(async () => ({ waiting: 3, active: 1, completed: 9, failed: 0, delayed: 2 })),
      isPaused: vi.fn(async () => false),
    };

    await expect(readQueueHealth(queue)).resolves.toEqual({
      name: "repository-search",
      waiting: 3,
      active: 1,
      completed: 9,
      failed: 0,
      delayed: 2,
      paused: false,
    });
    expect(queue.getJobCounts).toHaveBeenCalledWith("waiting", "active", "completed", "failed", "delayed");
  });

  it("summarizes overall health and blocks production release without staging smoke", async () => {
    const generatedAt = new Date("2026-05-27T12:00:00.000Z");
    const snapshot = await createQueueHealthSnapshot([
      {
        name: "moderation",
        getJobCounts: async () => ({ waiting: 0, active: 0, completed: 2, failed: 1, delayed: 0 }),
        isPaused: async () => false,
      },
    ], generatedAt);

    expect(snapshot).toMatchObject({
      status: "degraded",
      generatedAt: "2026-05-27T12:00:00.000Z",
      queues: [{ name: "moderation", status: "degraded" }],
    });
    expect(() => assertWorkerReleaseReady({ snapshot, stagingSmokeCompleted: false })).toThrow("Staging smoke must pass");
    expect(() => assertWorkerReleaseReady({ snapshot, stagingSmokeCompleted: true })).toThrow("Worker queues are not healthy");

    const healthy = summarizeQueueHealth([
      { name: "search", waiting: 0, active: 0, completed: 1, failed: 0, delayed: 0, paused: false },
    ], generatedAt);
    expect(() => assertWorkerReleaseReady({ snapshot: healthy, stagingSmokeCompleted: true })).not.toThrow();
  });
});
