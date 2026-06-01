import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_EVENTS, sendProductEvent } from "./product-events";

describe("product events analytics client", () => {
  const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalWorldDockApiBaseUrl = process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL;

  afterEach(() => {
    restoreEnv("NEXT_PUBLIC_API_BASE_URL", originalApiBaseUrl);
    restoreEnv("NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL", originalWorldDockApiBaseUrl);
  });

  it("sends product events to the analytics endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await sendProductEvent(
      PRODUCT_EVENTS.billingPlaceholderClicked,
      { plan: "creator" },
      {
        fetcher,
        baseUrl: "https://api.worlddock.test",
        anonymousId: "anon_test_123",
        route: "/pricing",
      },
    );

    expect(fetcher).toHaveBeenCalledWith("https://api.worlddock.test/v1/analytics/events", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: expect.any(String),
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      name: PRODUCT_EVENTS.billingPlaceholderClicked,
      context: { plan: "creator" },
      anonymousId: "anon_test_123",
      route: "/pricing",
      occurredAt: expect.any(String),
    });
  });

  it("skips blank API base URL values when resolving the endpoint", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "";
    process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL = "https://worlddock-api.test/";
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await sendProductEvent(PRODUCT_EVENTS.signedUp, {}, { fetcher });

    expect(fetcher.mock.calls[0][0]).toBe("https://worlddock-api.test/v1/analytics/events");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
