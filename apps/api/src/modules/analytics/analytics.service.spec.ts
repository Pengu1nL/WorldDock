import { describe, expect, it, vi } from "vitest";
import { PrismaAnalyticsRepository } from "./analytics.service";

describe("PrismaAnalyticsRepository", () => {
  it("maps product analytics events without writing request userId", async () => {
    const create = vi.fn(async ({ data }) => ({
      id: "event_1",
      userId: "db_user",
      name: data.name,
      context: data.context,
      anonymousId: data.anonymousId,
      route: data.route,
      userAgent: data.userAgent,
      occurredAt: data.occurredAt,
      createdAt: new Date("2026-06-01T01:00:01.000Z"),
    }));
    const repository = new PrismaAnalyticsRepository({
      productAnalyticsEvent: { create },
      $disconnect: vi.fn(),
    });
    const occurredAt = new Date("2026-06-01T01:00:00.000Z");

    const event = await repository.createEvent({
      name: "billing_placeholder_clicked",
      context: { plan: "creator" },
      anonymousId: "anon_phase12",
      route: "/pricing",
      userAgent: "phase12-test",
      occurredAt,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        name: "billing_placeholder_clicked",
        context: { plan: "creator" },
        anonymousId: "anon_phase12",
        route: "/pricing",
        userAgent: "phase12-test",
        occurredAt,
      },
    });
    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty("userId");
    expect(event).toEqual({
      id: "event_1",
      userId: "db_user",
      name: "billing_placeholder_clicked",
      context: { plan: "creator" },
      anonymousId: "anon_phase12",
      route: "/pricing",
      userAgent: "phase12-test",
      occurredAt,
      createdAt: new Date("2026-06-01T01:00:01.000Z"),
    });
  });
});
