import { describe, expect, it, vi } from "vitest";
import { captureWorkerQueueHealth } from "../src/observability";
import {
  WORKER_QUEUE_DESCRIPTORS,
  assertWorkerReleaseReady,
  classifyQueueHealth,
  createQueueHealthSnapshot,
  readQueueHealth,
  summarizeQueueHealth,
} from "../src/queue-dashboard";

describe("queue dashboard", () => {
  it("exposes canonical Alpha worker queues", () => {
    expect(WORKER_QUEUE_DESCRIPTORS).toEqual([
      { name: "repository-search-indexing", purpose: "Sync public repository documents into Meilisearch" },
      { name: "moderation-scan", purpose: "Scan reported or risky public repositories" },
      { name: "exports", purpose: "Prepare account data export packages" },
    ]);
  });

  it("classifies queue health by paused, failed, backlog, and healthy states", () => {
    expect(classifyQueueHealth({ name: "search", waiting: 0, active: 0, completed: 1, failed: 0, delayed: 0, paused: true })).toBe("paused");
    expect(classifyQueueHealth({ name: "search", waiting: 0, active: 0, completed: 1, failed: 1, delayed: 0, paused: false })).toBe("degraded");
    expect(classifyQueueHealth({ name: "search", waiting: 1001, active: 0, completed: 1, failed: 0, delayed: 0, paused: false })).toBe("backlogged");
    expect(classifyQueueHealth({ name: "search", waiting: 4, active: 1, completed: 8, failed: 0, delayed: 0, paused: false })).toBe("healthy");
  });

  it("reads BullMQ-compatible queue counts into a snapshot", async () => {
    const queue = {
      name: "repository-search-indexing",
      getJobCounts: vi.fn(async () => ({ waiting: 3, active: 1, completed: 9, failed: 0, delayed: 2 })),
      isPaused: vi.fn(async () => false),
    };

    await expect(readQueueHealth(queue)).resolves.toEqual({
      name: "repository-search-indexing",
      waiting: 3,
      active: 1,
      completed: 9,
      failed: 0,
      delayed: 2,
      paused: false,
    });
    expect(queue.getJobCounts).toHaveBeenCalledWith("waiting", "active", "completed", "failed", "delayed");
  });

  it("summarizes overall health using the most severe queue status", async () => {
    const generatedAt = new Date("2026-06-01T01:00:00.000Z");
    const snapshot = await createQueueHealthSnapshot([
      {
        name: "moderation-scan",
        getJobCounts: async () => ({ waiting: 0, active: 0, completed: 2, failed: 1, delayed: 0 }),
        isPaused: async () => false,
      },
      {
        name: "exports",
        getJobCounts: async () => ({ waiting: 5, active: 0, completed: 4, failed: 0, delayed: 0 }),
        isPaused: async () => true,
      },
    ], generatedAt);

    expect(snapshot).toMatchObject({
      status: "degraded",
      generatedAt: "2026-06-01T01:00:00.000Z",
      queues: [
        { name: "moderation-scan", status: "degraded" },
        { name: "exports", status: "paused" },
      ],
    });
  });

  it("blocks production release without staging smoke or healthy queues", () => {
    const generatedAt = new Date("2026-06-01T01:00:00.000Z");
    const degraded = summarizeQueueHealth([
      { name: "moderation-scan", waiting: 0, active: 0, completed: 2, failed: 1, delayed: 0, paused: false },
    ], generatedAt);

    expect(() => assertWorkerReleaseReady({ snapshot: degraded, stagingSmokeCompleted: false })).toThrow("Staging smoke must pass");
    expect(() => assertWorkerReleaseReady({ snapshot: degraded, stagingSmokeCompleted: true })).toThrow("Worker queues are not healthy: moderation-scan:degraded");

    const healthy = summarizeQueueHealth([
      { name: "repository-search-indexing", waiting: 0, active: 0, completed: 1, failed: 0, delayed: 0, paused: false },
    ], generatedAt);

    expect(() => assertWorkerReleaseReady({ snapshot: healthy, stagingSmokeCompleted: true })).not.toThrow();
  });
});

describe("worker queue observability", () => {
  it("returns queue status from captureWorkerQueueHealth", () => {
    expect(captureWorkerQueueHealth({
      name: "moderation-scan",
      waiting: 0,
      active: 0,
      completed: 3,
      failed: 1,
      delayed: 0,
      paused: false,
    })).toBe("degraded");
  });
});
