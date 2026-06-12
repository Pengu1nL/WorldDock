import { describe, expect, it, vi } from "vitest";
import {
  canUseFixtures,
  createAgentRun,
  createArchiveEntry,
  createConflict,
  createStorySeed,
  createWorld,
  createWorldAsset,
  deleteWorld,
  deleteWorldAsset,
  duplicateWorld,
  exportWorldPackage,
  fetchAgentEvents,
  generateWorldDraft,
  getWorldExport,
  importWorldPackage,
  listArchiveEntries,
  listConflicts,
  listStorySeeds,
  listWorldAssets,
  listWorlds,
  relateWorldAssets,
  reorderWorldAssets,
  saveAgentSuggestion,
  streamAgentEvents,
  unrelateWorldAssets,
  updateWorldAsset,
} from "./api";

describe("worlddock local API client", () => {
  it("allows fixture data only outside production when explicitly enabled", () => {
    expect(canUseFixtures({ NODE_ENV: "development", NEXT_PUBLIC_WORLD_DOCK_FIXTURES: "1" })).toBe(true);
    expect(canUseFixtures({ NODE_ENV: "test", NEXT_PUBLIC_WORLD_DOCK_FIXTURES: "1" })).toBe(true);
    expect(canUseFixtures({ NODE_ENV: "development", NEXT_PUBLIC_WORLD_DOCK_FIXTURES: undefined })).toBe(false);
    expect(canUseFixtures({ NODE_ENV: "production", NEXT_PUBLIC_WORLD_DOCK_FIXTURES: "1" })).toBe(false);
  });

  it("calls local world endpoints without authorization by default", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ worlds: [] }))
      .mockResolvedValueOnce(jsonResponse({ world: { id: "world_1", name: "回忆所" } }))
      .mockResolvedValueOnce(jsonResponse({ world: { id: "world_2", name: "回忆所 · 副本" } }))
      .mockResolvedValueOnce(jsonResponse({ world: { id: "world_1" } }));

    await listWorlds({ fetcher });
    await createWorld(
      { name: "回忆所", type: "近未来", summary: "记忆交易社会。", tags: ["记忆"], mode: "local" },
      { fetcher },
    );
    await duplicateWorld("world_1", { fetcher });
    await deleteWorld("world_1", { fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/worlds", {
      method: "GET",
      headers: {},
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/worlds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "回忆所", type: "近未来", summary: "记忆交易社会。", tags: ["记忆"], mode: "local" }),
    });
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/worlds/world_1/duplicate", {
      method: "POST",
      headers: {},
    });
    expect(fetcher).toHaveBeenNthCalledWith(4, "http://localhost:4000/v1/worlds/world_1", {
      method: "DELETE",
      headers: {},
    });
  });

  it("adds authorization only when an auth token is explicitly provided", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ worlds: [] }));

    await listWorlds({ authToken: "local_secret", fetcher });

    expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/v1/worlds", {
      method: "GET",
      headers: {
        authorization: "Bearer local_secret",
      },
    });
  });

  it("uses local asset and legacy pool endpoints", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ assets: [], nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ asset: { id: "asset_1", title: "规则" } }))
      .mockResolvedValueOnce(jsonResponse({ asset: { id: "asset_1", title: "规则新版" } }))
      .mockResolvedValueOnce(jsonResponse({ assetIds: ["asset_1"] }))
      .mockResolvedValueOnce(jsonResponse({ relation: { sourceAssetId: "asset_1", targetAssetId: "asset_2" } }))
      .mockResolvedValueOnce(jsonResponse({ relation: { sourceAssetId: "asset_1", targetAssetId: "asset_2" } }))
      .mockResolvedValueOnce(jsonResponse({ asset: { id: "asset_1" } }))
      .mockResolvedValueOnce(jsonResponse({ archiveEntry: { id: "archive_1" } }))
      .mockResolvedValueOnce(jsonResponse({ archiveEntries: [] }))
      .mockResolvedValueOnce(jsonResponse({ storySeed: { id: "seed_1" } }))
      .mockResolvedValueOnce(jsonResponse({ storySeeds: [] }))
      .mockResolvedValueOnce(jsonResponse({ conflict: { id: "conflict_1" } }))
      .mockResolvedValueOnce(jsonResponse({ conflicts: [] }));

    await listWorldAssets("world_1", { fetcher, kind: "setting", q: "规则", cursor: "8" });
    await createWorldAsset("world_1", { kind: "setting", title: "规则", summary: "摘要" }, { fetcher });
    await updateWorldAsset("world_1", "asset_1", { title: "规则新版" }, { fetcher });
    await reorderWorldAssets("world_1", ["asset_1"], { fetcher });
    await relateWorldAssets("world_1", "asset_1", "asset_2", { fetcher });
    await unrelateWorldAssets("world_1", "asset_1", "asset_2", { fetcher });
    await deleteWorldAsset("world_1", "asset_1", { fetcher });
    await createArchiveEntry("world_1", { title: "规则", category: "世界规则", summary: "摘要", body: "正文" }, { fetcher });
    await listArchiveEntries("world_1", { fetcher });
    await createStorySeed("world_1", { title: "开端", hook: "钩子", conflict: "冲突" }, { fetcher });
    await listStorySeeds("world_1", { fetcher });
    await createConflict("world_1", { title: "张力", summary: "摘要", body: "正文" }, { fetcher });
    await listConflicts("world_1", { fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/worlds/world_1/assets?kind=setting&q=%E8%A7%84%E5%88%99&cursor=8", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/worlds/world_1/assets", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/worlds/world_1/assets/asset_1", expect.objectContaining({ method: "PATCH" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "http://localhost:4000/v1/worlds/world_1/assets/reorder", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(5, "http://localhost:4000/v1/worlds/world_1/assets/asset_1/relations", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(6, "http://localhost:4000/v1/worlds/world_1/assets/asset_1/relations/asset_2", expect.objectContaining({ method: "DELETE" }));
    expect(fetcher).toHaveBeenNthCalledWith(7, "http://localhost:4000/v1/worlds/world_1/assets/asset_1", expect.objectContaining({ method: "DELETE" }));
    expect(fetcher).toHaveBeenNthCalledWith(8, "http://localhost:4000/v1/worlds/world_1/archive", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(9, "http://localhost:4000/v1/worlds/world_1/archive", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(10, "http://localhost:4000/v1/worlds/world_1/seeds", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(11, "http://localhost:4000/v1/worlds/world_1/seeds", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(12, "http://localhost:4000/v1/worlds/world_1/conflicts", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(13, "http://localhost:4000/v1/worlds/world_1/conflicts", expect.objectContaining({ method: "GET" }));
  });

  it("generates world drafts through the local agent API", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      draft: {
        suggestedName: "雾港",
        suggestedType: "港口奇幻 / 悬疑",
        styles: ["低魔", "悬疑"],
        coreSetting: "雾港每天清晨都会吐出居民遗忘的秘密。",
        coreConflict: "秘密既是私人记忆，也是城市权力的燃料。",
        directions: ["秘密盐税", "失忆者身份", "外来船只筛选"],
        firstQuestion: "秘密潮汐是自然现象，还是古老契约的副作用？",
        tools: [{ id: "ctx", label: "分析灵感主题", detail: "提取核心概念" }],
      },
      tokenUsage: { inputTokens: 18, outputTokens: 90, totalTokens: 108 },
    }));

    const result = await generateWorldDraft(
      { inspiration: "一座港口每天清晨都会吐出居民遗忘的秘密。", styleKw: "低魔 悬疑" },
      { fetcher },
    );

    expect(result.draft.suggestedName).toBe("雾港");
    expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/v1/world-drafts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ inspiration: "一座港口每天清晨都会吐出居民遗忘的秘密。", styleKw: "低魔 悬疑" }),
    });
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

    await createAgentRun("world_1", { prompt: "继续推演", mode: "expand" }, { fetcher });
    const events = await fetchAgentEvents("run_1", { fetcher });
    await saveAgentSuggestion("ags_1", { fetcher });

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

    await streamAgentEvents("run_1", { fetcher }, (event) => {
      events.push(event.type);
    });

    expect(events).toEqual(["message.delta", "run.completed"]);
  });

  it("exports and imports world packages through local endpoints", async () => {
    const worldPackage = {
      schemaVersion: "worlddock.world-package.v1",
      exportedAt: "2026-06-12T00:00:00.000Z",
      world: { name: "本地世界", type: "奇幻", summary: "摘要", tags: [], maturity: 0 },
      archiveEntries: [],
      storySeeds: [],
      conflicts: [],
    } as any;
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ export: { id: "export_1", kind: "world", status: "ready", createdAt: "now" } }))
      .mockResolvedValueOnce(jsonResponse({ export: { id: "export_1", kind: "world", status: "ready", createdAt: "now" }, package: worldPackage }))
      .mockResolvedValueOnce(jsonResponse({ world: { id: "world_imported" } }));

    await exportWorldPackage("world_1", { fetcher });
    const loaded = await getWorldExport("export_1", { fetcher });
    await importWorldPackage(loaded.package, { fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/worlds/world_1/export", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/exports/export_1", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/worlds/import", expect.objectContaining({ method: "POST" }));
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
