import { describe, expect, it, vi } from "vitest";
import {
  createAccessToken,
  createArchiveEntry,
  createAgentRun,
  createWorld,
  fetchAgentEvents,
  listArchiveEntries,
  listAccessTokens,
  listConflicts,
  listStorySeeds,
  listWorlds,
  revokeAccessToken,
  saveAgentSuggestion,
  streamAgentEvents,
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

  it("creates agent runs, parses SSE events, and saves suggestions", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ run: { id: "run_1" }, suggestions: [] }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => [
          "event: message.delta",
          "data: {\"type\":\"message.delta\",\"payload\":{\"text\":\"好。\"}}",
          "",
          "event: suggestion.created",
          "data: {\"type\":\"suggestion.created\",\"payload\":{\"suggestionId\":\"ags_1\",\"suggestion\":{\"id\":\"s1\",\"kind\":\"setting\",\"category\":\"世界规则\",\"title\":\"规则\",\"summary\":\"摘要\",\"body\":\"正文\"}}}",
          "",
        ].join("\n"),
      } as Response)
      .mockResolvedValueOnce(jsonResponse({ suggestion: { id: "ags_1", status: "saved" } }));

    await createAgentRun("world_1", { prompt: "继续推演", mode: "expand" }, { sessionToken: "session_valid", fetcher });
    const events = await fetchAgentEvents("run_1", { sessionToken: "session_valid", fetcher });
    await saveAgentSuggestion("ags_1", { sessionToken: "session_valid", fetcher });

    expect(events.map((event) => event.type)).toEqual(["message.delta", "suggestion.created"]);
    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/worlds/world_1/agent-runs", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/agent-runs/run_1/events", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/agent-suggestions/ags_1/save", expect.objectContaining({ method: "POST" }));
  });

  it("streams agent SSE events as chunks arrive", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode([
          "event: message.delta",
          "data: {\"type\":\"message.delta\",\"payload\":{\"text\":\"好。\"}}",
        ].join("\n") + "\n\n"));
        controller.enqueue(encoder.encode([
          "event: run.completed",
          "data: {\"type\":\"run.completed\",\"payload\":{\"tokenUsage\":{\"inputTokens\":1,\"outputTokens\":2,\"totalTokens\":3}}}",
        ].join("\n") + "\n\n"));
        controller.close();
      },
    });
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: stream,
      text: async () => "",
    } as Response));
    const events: string[] = [];

    await streamAgentEvents("run_1", { sessionToken: "session_valid", fetcher }, (event) => {
      events.push(event.type);
    });

    expect(events).toEqual(["message.delta", "run.completed"]);
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
