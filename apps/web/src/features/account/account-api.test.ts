import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL: process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL,
};

describe("account API client", () => {
  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses the shared web API base URL for account requests", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.worlddock.test";
    delete process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL;
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ profile: { id: "profile_1" } }),
    } as Response));
    vi.stubGlobal("fetch", fetcher);

    const { completeOnboarding } = await import("./account-api");
    await completeOnboarding("session_valid");

    expect(fetcher).toHaveBeenCalledWith("https://api.worlddock.test/v1/account/onboarding/complete", expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({
        authorization: "Bearer session_valid",
      }),
    }));
  });
});

function restoreEnv() {
  setEnv("NEXT_PUBLIC_API_BASE_URL", originalEnv.NEXT_PUBLIC_API_BASE_URL);
  setEnv("NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL", originalEnv.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL);
}

function setEnv(key: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
