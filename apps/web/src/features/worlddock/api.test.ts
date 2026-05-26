import { describe, expect, it, vi } from "vitest";
import { createAccessToken, listAccessTokens, revokeAccessToken } from "./api";

describe("worlddock API client", () => {
  it("creates access tokens through the backend API", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      token: "wdl_prefix_secret",
      accessToken: { id: "at_1", name: "Local Push", prefix: "prefix", scopes: ["repository:push"] },
    }));

    const result = await createAccessToken(
      { name: "Local Push", scopes: ["repository:push"] },
      { sessionToken: "session_valid", fetcher },
    );

    expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/v1/access-tokens", {
      method: "POST",
      headers: {
        authorization: "Bearer session_valid",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Local Push", scopes: ["repository:push"] }),
    });
    expect(result.token).toBe("wdl_prefix_secret");
  });

  it("lists and revokes access tokens", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ accessTokens: [] }));

    await listAccessTokens({ sessionToken: "session_valid", fetcher });
    await revokeAccessToken("at_1", { sessionToken: "session_valid", fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/access-tokens", {
      method: "GET",
      headers: {
        authorization: "Bearer session_valid",
      },
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/access-tokens/at_1", {
      method: "DELETE",
      headers: {
        authorization: "Bearer session_valid",
      },
    });
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
