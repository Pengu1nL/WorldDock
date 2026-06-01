import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { configureApiApp } from "../src/configure-api-app";
import { AnalyticsModule } from "../src/modules/analytics/analytics.module";
import {
  ANALYTICS_REPOSITORY,
  type AnalyticsRepository,
  type ProductEventRecord,
} from "../src/modules/analytics/analytics.service";

describe("analytics endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("records allowlisted product events with request metadata", async () => {
    const repository = createInMemoryAnalyticsRepository();
    app = await createTestApp(repository);

    const response = await request(app.getHttpServer())
      .post("/v1/analytics/events")
      .set("user-agent", "phase12-test")
      .send({
        name: "billing_placeholder_clicked",
        context: { plan: "creator", source: "pricing_card" },
        anonymousId: "anon_phase12",
        route: "/pricing",
        occurredAt: "2026-06-01T01:00:00.000Z",
      })
      .expect(201);

    expect(response.body.event).toMatchObject({
      id: "event_1",
      name: "billing_placeholder_clicked",
      context: { plan: "creator", source: "pricing_card" },
      anonymousId: "anon_phase12",
      route: "/pricing",
      userAgent: "phase12-test",
      occurredAt: "2026-06-01T01:00:00.000Z",
      createdAt: "2026-06-01T01:00:01.000Z",
    });
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]?.context).toEqual({ plan: "creator", source: "pricing_card" });
  });

  it("rejects unknown product events without storing them", async () => {
    const repository = createInMemoryAnalyticsRepository();
    app = await createTestApp(repository);

    const response = await request(app.getHttpServer())
      .post("/v1/analytics/events")
      .send({ name: "stripe_checkout_started" })
      .expect(400);

    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(repository.events).toHaveLength(0);
  });
});

async function createTestApp(repository: AnalyticsRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [AnalyticsModule],
  })
    .overrideProvider(ANALYTICS_REPOSITORY)
    .useValue(repository)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function createInMemoryAnalyticsRepository() {
  const events: ProductEventRecord[] = [];
  return {
    events,
    async createEvent(input) {
      const event: ProductEventRecord = {
        id: `event_${events.length + 1}`,
        createdAt: new Date("2026-06-01T01:00:01.000Z"),
        ...input,
      };
      events.push(event);
      return event;
    },
  } satisfies AnalyticsRepository & { events: ProductEventRecord[] };
}
