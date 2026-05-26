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

describe("system endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns process health with a request id", async () => {
    app = await createTestApp([
      { name: "database", check: async () => undefined },
      { name: "redis", check: async () => undefined },
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/health")
      .set("x-request-id", "req_test_health")
      .expect(200);

    expect(response.headers["x-request-id"]).toBe("req_test_health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toMatchObject({
      status: "ok",
      service: "worlddock-api",
      requestId: "req_test_health",
    });
  });

  it("returns baseline process metrics", async () => {
    app = await createTestApp([
      { name: "database", check: async () => undefined },
      { name: "redis", check: async () => undefined },
      { name: "search", check: async () => undefined },
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/metrics")
      .expect(200);

    expect(response.body).toMatchObject({ service: "worlddock-api" });
    expect(response.body.memory.rss).toBeGreaterThan(0);
  });

  it("returns readiness details when dependencies are healthy", async () => {
    app = await createTestApp([
      { name: "database", check: async () => undefined },
      { name: "redis", check: async () => undefined },
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/readiness")
      .expect(200);

    expect(response.body.status).toBe("ready");
    expect(response.body.dependencies).toEqual([
      { name: "database", status: "ok" },
      { name: "redis", status: "ok" },
    ]);
    expect(response.body.requestId).toMatch(/^req_[a-z0-9]+$/);
  });

  it("normalizes dependency failures into ApiError", async () => {
    app = await createTestApp([
      { name: "database", check: async () => undefined },
      {
        name: "redis",
        check: async () => {
          throw new Error("connection refused");
        },
      },
    ]);

    const response = await request(app.getHttpServer())
      .get("/v1/system/readiness")
      .set("x-request-id", "req_unready")
      .expect(503);

    expect(response.body).toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Service dependencies are not ready.",
      requestId: "req_unready",
      details: {
        dependencies: [
          { name: "database", status: "ok" },
          { name: "redis", status: "error" },
        ],
      },
    });
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
