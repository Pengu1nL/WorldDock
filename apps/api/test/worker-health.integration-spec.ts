import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import {
  DEPENDENCY_HEALTH_CHECKERS,
  type DependencyHealthChecker,
} from "../src/modules/system/readiness.service";

describe("worker health endpoint", () => {
  let app: INestApplication | undefined;
  const originalQueueHealth = process.env.WORKER_QUEUE_HEALTH_JSON;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (originalQueueHealth === undefined) {
      delete process.env.WORKER_QUEUE_HEALTH_JSON;
    } else {
      process.env.WORKER_QUEUE_HEALTH_JSON = originalQueueHealth;
    }
  });

  it("exposes worker queue health and marks failed queues as degraded", async () => {
    process.env.WORKER_QUEUE_HEALTH_JSON = JSON.stringify([
      { name: "repository-search", waiting: 2, active: 1, completed: 12, failed: 0, delayed: 0, paused: false },
      { name: "moderation-scan", waiting: 0, active: 0, completed: 5, failed: 1, delayed: 0, paused: false },
    ]);
    app = await createTestApp([
      { name: "database", check: async () => undefined },
      { name: "redis", check: async () => undefined },
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
        { name: "repository-search", status: "healthy" },
        { name: "moderation-scan", status: "degraded", failed: 1 },
      ],
    });
  });

  it("returns a healthy default snapshot when queue telemetry is not configured", async () => {
    delete process.env.WORKER_QUEUE_HEALTH_JSON;
    app = await createTestApp([
      { name: "database", check: async () => undefined },
      { name: "redis", check: async () => undefined },
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/worker-health")
      .expect(200);

    expect(response.body.status).toBe("healthy");
    expect(response.body.ready).toBe(true);
    expect(response.body.queues.map((queue: { name: string }) => queue.name)).toEqual([
      "repository-search",
      "moderation-scan",
      "exports",
    ]);
  });
});

async function createTestApp(checkers: DependencyHealthChecker[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DEPENDENCY_HEALTH_CHECKERS)
    .useValue(checkers)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}
