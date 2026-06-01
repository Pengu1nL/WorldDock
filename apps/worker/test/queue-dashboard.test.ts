import { afterEach, describe, expect, it, vi } from "vitest";
import { captureWorkerQueueHealth } from "../src/observability";
import {
  WORKER_QUEUE_DESCRIPTORS,
  assertWorkerReleaseReady,
  classifyQueueHealth,
  createQueueHealthSnapshot,
  readQueueHealth,
  summarizeQueueHealth,
} from "../src/queue-dashboard";

const sentryMocks = vi.hoisted(() => {
  const scopeMock = {
    setExtras: vi.fn(),
    setTag: vi.fn(),
  };

  return {
    captureException: vi.fn(),
    init: vi.fn(),
    scope: scopeMock,
    withScope: vi.fn((callback: (scope: typeof scopeMock) => void) => callback(scopeMock)),
  };
});

vi.mock("@sentry/node", () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  withScope: sentryMocks.withScope,
}));

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
  const originalSentryDsn = process.env.SENTRY_DSN;

  afterEach(() => {
    sentryMocks.captureException.mockClear();
    sentryMocks.init.mockClear();
    sentryMocks.scope.setExtras.mockClear();
    sentryMocks.scope.setTag.mockClear();
    sentryMocks.withScope.mockClear();

    if (originalSentryDsn === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = originalSentryDsn;
    }
  });

  it("captures degraded queue alerts with worker tags and extra data", () => {
    process.env.SENTRY_DSN = "https://public@example.com/1";
    const queue = {
      name: "moderation-scan",
      waiting: 0,
      active: 0,
      completed: 3,
      failed: 1,
      delayed: 0,
      paused: false,
    };

    expect(captureWorkerQueueHealth(queue)).toBe("degraded");

    expect(sentryMocks.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMocks.scope.setTag).toHaveBeenCalledTimes(3);
    expect(sentryMocks.scope.setTag).toHaveBeenNthCalledWith(1, "component", "worker");
    expect(sentryMocks.scope.setTag).toHaveBeenNthCalledWith(2, "queue", "moderation-scan");
    expect(sentryMocks.scope.setTag).toHaveBeenNthCalledWith(3, "queue_status", "degraded");
    expect(sentryMocks.scope.setExtras).toHaveBeenCalledWith(queue);
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect((sentryMocks.captureException.mock.calls[0]?.[0] as Error).message).toBe("Worker queue moderation-scan is degraded");
  });

  it("does not capture healthy queue alerts", () => {
    process.env.SENTRY_DSN = "https://public@example.com/1";

    expect(captureWorkerQueueHealth({
      name: "repository-search-indexing",
      waiting: 0,
      active: 0,
      completed: 3,
      failed: 0,
      delayed: 0,
      paused: false,
    })).toBe("healthy");

    expect(sentryMocks.withScope).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
    expect(sentryMocks.scope.setTag).not.toHaveBeenCalled();
    expect(sentryMocks.scope.setExtras).not.toHaveBeenCalled();
  });
});
