import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  WORLD_DOCK_API_BASE_URL: process.env.WORLD_DOCK_API_BASE_URL,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL: process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL,
};

describe("auth proxy route", () => {
  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses the shared web API base URL for auth proxy requests", async () => {
    process.env.WORLD_DOCK_API_BASE_URL = "";
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.worlddock.test";
    delete process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ token: "session_valid" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetcher);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "writer@example.com", password: "correct horse battery" }),
      }) as never,
      { params: Promise.resolve({ all: ["sign-in", "email"] }) },
    );

    expect(fetcher).toHaveBeenCalledWith("https://api.worlddock.test/v1/auth/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "writer@example.com", password: "correct horse battery" }),
    }));
    expect(response.status).toBe(200);
  });
});

function restoreEnv() {
  setEnv("WORLD_DOCK_API_BASE_URL", originalEnv.WORLD_DOCK_API_BASE_URL);
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
