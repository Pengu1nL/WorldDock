import { describe, expect, it, vi } from "vitest";
import {
  forkSyncPreviewSchema,
  forkSyncResultSchema,
  rollbackReleaseResponseSchema,
} from "@worlddock/domain";
import {
  canUseFixtures,
  clearStoredSessionToken,
  createAccessToken,
  createArchiveEntry,
  createAgentRun,
  createWorld,
  fetchAgentEvents,
  getBillingBalance,
  getBillingUsage,
  getCommunityCreator,
  getCommunityRepository,
  getPublicRepository,
  listCommunityCreatorRepositories,
  listCommunityRepositories,
  listCommunityRepositoryAssets,
  listArchiveEntries,
  listAccessTokens,
  listConflicts,
  listPublicRepositories,
  searchPublicRepositories,
  addRepositoryToCollection,
  listRepositoryReleases,
  listStorySeeds,
  listWorlds,
  localPushRepository,
  publishWorld,
  reportRepository,
  revokeAccessToken,
  removeRepositoryFromCollection,
  readStoredSessionToken,
  saveAgentSuggestion,
  starRepository,
  streamAgentEvents,
  unstarRepository,
  forkRepository,
  detachFork,
  getForkUpstreamDiff,
  previewWorldRelease,
  rollbackRelease,
  syncFork,
  writeStoredSessionToken,
} from "./api";

describe("worlddock API client", () => {
  it("allows fixture data only outside production when explicitly enabled", () => {
    expect(canUseFixtures({ NODE_ENV: "development", NEXT_PUBLIC_WORLD_DOCK_FIXTURES: "1" })).toBe(true);
    expect(canUseFixtures({ NODE_ENV: "test", NEXT_PUBLIC_WORLD_DOCK_FIXTURES: "1" })).toBe(true);
    expect(canUseFixtures({ NODE_ENV: "development", NEXT_PUBLIC_WORLD_DOCK_FIXTURES: undefined })).toBe(false);
    expect(canUseFixtures({ NODE_ENV: "production", NEXT_PUBLIC_WORLD_DOCK_FIXTURES: "1" })).toBe(false);
  });

  it("reads the stored session token through a single cloud auth helper", () => {
    expect(readStoredSessionToken({ getItem: () => "session_alpha" })).toBe("session_alpha");
    expect(readStoredSessionToken({ getItem: () => null })).toBe("");
    expect(readStoredSessionToken(null)).toBe("");
  });

  it("writes and clears the stored session token through a single cloud auth helper", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    writeStoredSessionToken(" session_alpha ", storage);
    expect(readStoredSessionToken(storage)).toBe("session_alpha");

    writeStoredSessionToken("", storage);
    expect(readStoredSessionToken(storage)).toBe("session_alpha");

    clearStoredSessionToken(storage);
    expect(readStoredSessionToken(storage)).toBe("");
  });

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

  it("reads billing balance and usage from the backend API", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ balance: { userId: "user_1", currency: "CNY", balanceCents: 9950 } }))
      .mockResolvedValueOnce(jsonResponse({ usage: { entries: [], lastAgentRun: null } }));

    await getBillingBalance({ sessionToken: "session_valid", fetcher });
    await getBillingUsage({ sessionToken: "session_valid", fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/billing/balance", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/billing/usage", expect.objectContaining({ method: "GET" }));
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

  it("publishes worlds and reads public repositories", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ repository: { id: "repo_1" }, release: { id: "rel_1" } }))
      .mockResolvedValueOnce(jsonResponse({ repositories: [] }))
      .mockResolvedValueOnce(jsonResponse({ repository: { id: "repo_1", slug: "memory-market" } }))
      .mockResolvedValueOnce(jsonResponse({ releases: [] }));

    await publishWorld("world_1", { releaseNote: "初始发布", license: "free-fork-attribution" }, { sessionToken: "session_valid", fetcher });
    await listPublicRepositories({ sessionToken: "session_valid", fetcher });
    await getPublicRepository("ren", "memory-market", { sessionToken: "session_valid", fetcher });
    await listRepositoryReleases("repo_1", { sessionToken: "session_valid", fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/worlds/world_1/publish", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/repositories", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/repositories/ren/memory-market", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "http://localhost:4000/v1/repositories/repo_1/releases", expect.objectContaining({ method: "GET" }));
  });

  it("searches public repositories", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ repositories: [{ id: "repo_1" }] }));

    await searchPublicRepositories("memory", { sessionToken: "session_valid", fetcher, tags: ["记忆"], sort: "stars" });

    expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/v1/repositories/search?q=memory&tag=%E8%AE%B0%E5%BF%86&sort=stars", expect.objectContaining({ method: "GET" }));
  });

  it("uses the community client contract for repositories, assets, creators, and collections", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ repositories: [], nextCursor: "cursor_2" }))
      .mockResolvedValueOnce(jsonResponse({ repository: { id: "repo_1", slug: "memory-market" } }))
      .mockResolvedValueOnce(jsonResponse({ repositoryId: "repo_1", releaseId: "rel_1", assets: [], nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ creator: { handle: "ren" } }))
      .mockResolvedValueOnce(jsonResponse({ repositories: [], nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ collection: { id: "collection_1" } }))
      .mockResolvedValueOnce(jsonResponse({ collection: { id: "collection_1" }, removed: true }));

    await listCommunityRepositories({
      sessionToken: "session_valid",
      fetcher,
      query: "memory",
      cursor: "cursor_1",
      tags: ["记忆", "交易"],
      sort: "stars",
    });
    await getCommunityRepository("ren", "memory-market", { sessionToken: "session_valid", fetcher });
    await listCommunityRepositoryAssets("repo_1", { sessionToken: "session_valid", fetcher, kind: "archive", cursor: "8" });
    await getCommunityCreator("ren", { sessionToken: "session_valid", fetcher });
    await listCommunityCreatorRepositories("ren", { sessionToken: "session_valid", fetcher, sort: "updated" });
    await addRepositoryToCollection("repo_1", { sessionToken: "session_valid", fetcher });
    await removeRepositoryFromCollection("repo_1", "collection_1", { sessionToken: "session_valid", fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/community/repositories?q=memory&cursor=cursor_1&tag=%E8%AE%B0%E5%BF%86&tag=%E4%BA%A4%E6%98%93&sort=stars", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/community/repositories/ren/memory-market", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/community/repositories/repo_1/assets?kind=archive&cursor=8", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "http://localhost:4000/v1/community/creators/ren", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(5, "http://localhost:4000/v1/community/creators/ren/repositories?sort=updated", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(6, "http://localhost:4000/v1/community/repositories/repo_1/collections", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(7, "http://localhost:4000/v1/community/repositories/repo_1/collections/collection_1", expect.objectContaining({ method: "DELETE" }));
  });

  it("stars, unstars, forks, reports, and local-pushes repositories", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ repository: { id: "repo_1", stars: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ repository: { id: "repo_1", stars: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ world: { id: "world_2" }, fork: { id: "fork_1" } }))
      .mockResolvedValueOnce(jsonResponse({ report: { id: "report_1" } }))
      .mockResolvedValueOnce(jsonResponse({ repository: { id: "repo_local" }, release: { id: "rel_1" } }));

    await starRepository("repo_1", { sessionToken: "session_valid", fetcher });
    await unstarRepository("repo_1", { sessionToken: "session_valid", fetcher });
    await forkRepository("repo_1", { sessionToken: "session_valid", fetcher });
    await reportRepository("repo_1", { reason: "other", detail: "复核这个世界。" }, { sessionToken: "session_valid", fetcher });
    await localPushRepository({
      name: "Local World",
      summary: "本地快照",
      tags: [],
      releaseNote: "Local Push",
      license: "free-fork-attribution",
      snapshot: { world: { name: "Local World", type: "本地", summary: "本地快照", tags: [], maturity: 0 }, archiveEntries: [], storySeeds: [], conflicts: [] },
    }, { sessionToken: "wdl_push_secret", fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/repositories/repo_1/star", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/repositories/repo_1/star", expect.objectContaining({ method: "DELETE" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/repositories/repo_1/fork", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "http://localhost:4000/v1/repositories/repo_1/reports", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ reason: "other", detail: "复核这个世界。" }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(5, "http://localhost:4000/v1/repositories/local-push", expect.objectContaining({ method: "POST" }));
  });

  it("previews releases, rolls back releases, and manages fork upstream sync", async () => {
    const releaseDetail = {
      id: "rel_2",
      repositoryId: "repo_1",
      version: "v1.0.1",
      note: "回滚前版本",
      status: "rolled_back",
      license: "free-fork-attribution",
      diff: { addedSettings: 0, changedSettings: 1, removedSettings: 0, addedSeeds: 0 },
      changes: [],
      createdAt: "2026-05-30T10:00:00.000Z",
    };
    const activeRelease = {
      ...releaseDetail,
      id: "rel_1",
      version: "v1.0.0",
      note: "稳定版本",
      status: "published",
      createdAt: "2026-05-29T10:00:00.000Z",
    };
    const upstreamDiff = {
      forkId: "fork_1",
      repositoryId: "repo_1",
      sourceReleaseId: "rel_1",
      upstreamReleaseId: "rel_2",
      hasUpstreamChanges: true,
      changes: [
        { assetId: "archive:upstream_1", kind: "changed", title: "档案", beforeHash: "old", afterHash: "new" },
      ],
    };
    const syncResult = {
      ...upstreamDiff,
      sourceReleaseId: "rel_2",
      hasUpstreamChanges: false,
      applied: upstreamDiff.changes,
      skipped: [
        { assetId: "archive:local_1", kind: "changed", title: "本地档案", beforeHash: "old", afterHash: "new" },
      ],
    };
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ preflight: { ok: true, checks: [], changes: upstreamDiff.changes } }))
      .mockResolvedValueOnce(jsonResponse({ release: releaseDetail, activeRelease }))
      .mockResolvedValueOnce(jsonResponse({ diff: upstreamDiff }))
      .mockResolvedValueOnce(jsonResponse({ sync: syncResult }))
      .mockResolvedValueOnce(jsonResponse({ fork: { forkId: "fork_1", detached: true } }));

    const preview = await previewWorldRelease(
      "world_1",
      { releaseNote: "发布说明", license: "free-fork-attribution" },
      { sessionToken: "session_valid", fetcher },
    );
    const rollback = await rollbackRelease("rel_2", { sessionToken: "session_valid", fetcher });
    const diff = await getForkUpstreamDiff("fork_1", { sessionToken: "session_valid", fetcher });
    const sync = await syncFork("fork_1", { sessionToken: "session_valid", fetcher });
    const detach = await detachFork("fork_1", { sessionToken: "session_valid", fetcher });

    expect(preview.preflight.changes).toEqual(upstreamDiff.changes);
    expect(rollbackReleaseResponseSchema.parse(rollback).activeRelease.id).toBe("rel_1");
    expect(forkSyncPreviewSchema.parse(diff.diff).changes).toHaveLength(1);
    expect(forkSyncResultSchema.parse(sync.sync).skipped[0]?.reason).toBeUndefined();
    expect(detach.fork).toEqual({ forkId: "fork_1", detached: true });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/worlds/world_1/releases/preview", expect.objectContaining({
      method: "POST",
      headers: {
        authorization: "Bearer session_valid",
        "content-type": "application/json",
      },
      body: JSON.stringify({ releaseNote: "发布说明", license: "free-fork-attribution" }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/releases/rel_2/rollback", expect.objectContaining({
      method: "POST",
      headers: { authorization: "Bearer session_valid" },
    }));
    expect(fetcher.mock.calls[1]?.[1]).not.toHaveProperty("body");
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/forks/fork_1/upstream-diff", expect.objectContaining({
      method: "GET",
      headers: { authorization: "Bearer session_valid" },
    }));
    expect(fetcher.mock.calls[2]?.[1]).not.toHaveProperty("body");
    expect(fetcher).toHaveBeenNthCalledWith(4, "http://localhost:4000/v1/forks/fork_1/sync", expect.objectContaining({
      method: "POST",
      headers: { authorization: "Bearer session_valid" },
    }));
    expect(fetcher.mock.calls[3]?.[1]).not.toHaveProperty("body");
    expect(fetcher).toHaveBeenNthCalledWith(5, "http://localhost:4000/v1/forks/fork_1/detach", expect.objectContaining({
      method: "POST",
      headers: { authorization: "Bearer session_valid" },
    }));
    expect(fetcher.mock.calls[4]?.[1]).not.toHaveProperty("body");
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
