import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";

const runLocalReadiness = process.env.WORLD_DOCK_LOCAL_READINESS === "1";
const describeLocal = runLocalReadiness ? describe : describe.skip;

describeLocal("local database-only readiness", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApiApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns ready against the local PostgreSQL database", async () => {
    const response = await request(app.getHttpServer())
      .get("/v1/system/readiness")
      .expect(200);

    expect(response.body).toMatchObject({
      status: "ready",
      dependencies: [
        { name: "database", status: "ok" },
      ],
    });
  });
});
