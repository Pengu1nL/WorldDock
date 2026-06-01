import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { QueueMetricReader } from "@worlddock/domain";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import {
  DEPENDENCY_HEALTH_CHECKERS,
  type DependencyHealthChecker,
} from "../src/modules/system/readiness.service";
import { WORKER_QUEUE_READERS, WorkerHealthService } from "../src/modules/system/worker-health.service";

describe("worker health endpoint", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("exposes worker queue health from injected queue readers", async () => {
    app = await createTestApp([
      queueReader("repository-search-indexing", { waiting: 2, active: 1, completed: 12, failed: 0, delayed: 0, paused: false }),
      queueReader("moderation-scan", { waiting: 0, active: 0, completed: 5, failed: 1, delayed: 0, paused: false }),
      queueReader("exports", { waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false }),
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .set("x-request-id", "req_worker_health")
      .expect(200);

    expect(response.body).toMatchObject({
      status: "degraded",
      ready: false,
      requestId: "req_worker_health",
      queues: [
        { name: "repository-search-indexing", status: "healthy", waiting: 2 },
        { name: "moderation-scan", status: "degraded", failed: 1 },
        { name: "exports", status: "healthy" },
      ],
    });
    expect(response.body.generatedAt).toEqual(expect.any(String));
  });

  it("marks a backlog as not ready", async () => {
    app = await createTestApp([
      queueReader("repository-search-indexing", { waiting: 1001, active: 0, completed: 12, failed: 0, delayed: 0, paused: false }),
      queueReader("moderation-scan", { waiting: 0, active: 0, completed: 5, failed: 0, delayed: 0, paused: false }),
      queueReader("exports", { waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false }),
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .expect(200);

    expect(response.body.status).toBe("backlogged");
    expect(response.body.ready).toBe(false);
    expect(response.body.queues[0]).toMatchObject({ name: "repository-search-indexing", status: "backlogged" });
  });

  it("returns ready when all queues are healthy", async () => {
    app = await createTestApp([
      queueReader("repository-search-indexing", { waiting: 0, active: 0, completed: 12, failed: 0, delayed: 0, paused: false }),
      queueReader("moderation-scan", { waiting: 0, active: 0, completed: 5, failed: 0, delayed: 0, paused: false }),
      queueReader("exports", { waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false }),
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .expect(200);

    expect(response.body.status).toBe("healthy");
    expect(response.body.ready).toBe(true);
    expect(response.body.queues.map((queue: { name: string }) => queue.name)).toEqual([
      "repository-search-indexing",
      "moderation-scan",
      "exports",
    ]);
  });

  it("returns degraded when a queue reader rejects", async () => {
    app = await createTestApp([
      queueReader("repository-search-indexing", { waiting: 0, active: 0, completed: 12, failed: 0, delayed: 0, paused: false }),
      rejectingQueueReader("moderation-scan"),
      queueReader("exports", { waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false }),
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .expect(200);

    expect(response.body.status).toBe("degraded");
    expect(response.body.ready).toBe(false);
    expect(response.body.queues[1]).toMatchObject({
      name: "moderation-scan",
      status: "degraded",
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 1,
      delayed: 0,
      paused: false,
    });
  });

  it("returns degraded when a queue reader times out", async () => {
    app = await createTestApp([
      neverResolvingQueueReader("repository-search-indexing"),
      queueReader("moderation-scan", { waiting: 0, active: 0, completed: 5, failed: 0, delayed: 0, paused: false }),
      queueReader("exports", { waiting: 0, active: 0, completed: 3, failed: 0, delayed: 0, paused: false }),
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .timeout({ deadline: 2_200 })
      .expect(200);

    expect(response.body.status).toBe("degraded");
    expect(response.body.ready).toBe(false);
    expect(response.body.queues[0]).toMatchObject({
      name: "repository-search-indexing",
      status: "degraded",
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 1,
      delayed: 0,
      paused: false,
    });
  });
});

describe("WorkerHealthService", () => {
  it("closes queue readers on module destroy", async () => {
    const close = vi.fn(async () => undefined);
    const service = new WorkerHealthService([
      {
        ...queueReader("repository-search-indexing", { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false }),
        close,
      },
    ]);

    await service.onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
  });
});

async function createTestApp(queueReaders: QueueMetricReader[]) {
  const checkers: DependencyHealthChecker[] = [
    { name: "database", check: async () => undefined },
    { name: "redis", check: async () => undefined },
  ];

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DEPENDENCY_HEALTH_CHECKERS)
    .useValue(checkers)
    .overrideProvider(WORKER_QUEUE_READERS)
    .useValue(queueReaders)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function queueReader(name: string, counts: { waiting: number; active: number; completed: number; failed: number; delayed: number; paused: boolean }): QueueMetricReader {
  return {
    name,
    getJobCounts: vi.fn(async () => ({
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
    })),
    isPaused: vi.fn(async () => counts.paused),
  };
}

function rejectingQueueReader(name: string): QueueMetricReader {
  return {
    name,
    getJobCounts: vi.fn(async () => {
      throw new Error("queue unavailable");
    }),
    isPaused: vi.fn(async () => false),
  };
}

function neverResolvingQueueReader(name: string): QueueMetricReader {
  return {
    name,
    getJobCounts: vi.fn(() => new Promise<Awaited<ReturnType<QueueMetricReader["getJobCounts"]>>>(() => undefined)),
    isPaused: vi.fn(async () => false),
  };
}
