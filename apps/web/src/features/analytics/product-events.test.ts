import { describe, expect, it, vi } from "vitest";
import { PRODUCT_EVENTS, sendProductEvent } from "./product-events";

describe("product events analytics client", () => {
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
});
