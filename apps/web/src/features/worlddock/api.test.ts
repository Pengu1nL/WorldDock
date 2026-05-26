import { describe, expect, it, vi } from "vitest";
import {
  createAccessToken,
  createArchiveEntry,
  createWorld,
  listArchiveEntries,
  listAccessTokens,
  listConflicts,
  listStorySeeds,
  listWorlds,
  revokeAccessToken,
} from "./api";

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

  it("creates worlds and archive entries through the backend API", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ world: { id: "world_1", name: "回忆所" } }))
      .mockResolvedValueOnce(jsonResponse({ worlds: [] }))
      .mockResolvedValueOnce(jsonResponse({ archiveEntry: { id: "archive_1", title: "《记忆交易法》" } }));

    await createWorld(
      { name: "回忆所", type: "近未来", summary: "记忆交易社会。", tags: ["记忆"], mode: "cloud" },
      { sessionToken: "session_valid", fetcher },
    );
    await listWorlds({ sessionToken: "session_valid", fetcher });
    await createArchiveEntry(
      "world_1",
      { title: "《记忆交易法》", category: "世界规则", summary: "确立交易规则。", body: "只允许认证机构交易。" },
      { sessionToken: "session_valid", fetcher },
    );
    await listArchiveEntries("world_1", { sessionToken: "session_valid", fetcher });
    await listStorySeeds("world_1", { sessionToken: "session_valid", fetcher });
    await listConflicts("world_1", { sessionToken: "session_valid", fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/worlds", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/worlds", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/worlds/world_1/archive", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "http://localhost:4000/v1/worlds/world_1/archive", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(5, "http://localhost:4000/v1/worlds/world_1/seeds", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(6, "http://localhost:4000/v1/worlds/world_1/conflicts", expect.objectContaining({ method: "GET" }));
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
