import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionsService } from "../connections/connections.service";
import { ExportsService } from "../exports/exports.service";
import type { OfficialAssetDetailRecord, OfficialAssetRecord } from "../official-assets/official-assets.repository";
import type { OfficialAssetsService } from "../official-assets/official-assets.service";
import { WORLD_REPOSITORY } from "../worlds/world.repository";
import { WorldsController } from "../worlds/worlds.controller";
import { createHttpTestApp, createInMemoryWorlds, type InMemoryWorlds } from "../../../test/local-api-test-helpers";
import { PullClientService, type PullClientFetch } from "./pull-client.service";

describe("PullClientService", () => {
  it("pulls a release snapshot from WorldHub and imports it as a remapped local world", async () => {
    const worlds = createInMemoryWorlds();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const service = createPullClientService(worlds, async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(pulledRepositoryResponse());
    });

    const result = await service.pullWorld({ owner: "studio", slug: "memory-market" });

    expect(result.world).toMatchObject({
      name: "回忆所",
      type: "近未来",
      mode: "local",
      archive: 1,
      seeds: 1,
      conflicts: 1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://hub.example.test/v1/repositories/studio/memory-market/pull");
    expect(calls[0]?.init?.headers).toMatchObject({
      accept: "application/json",
      authorization: "Bearer wdpat_full_token_1234567890",
    });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);

    const remap = new Map(result.remap.assets.map((asset) => [asset.upstreamId, asset.localId]));
    const localArchiveId = remap.get("hub_archive_1");
    const localSeedId = remap.get("hub_seed_1");
    const localConflictId = remap.get("hub_conflict_1");
    expect(localArchiveId).toBeDefined();
    expect(localSeedId).toBeDefined();
    expect(localConflictId).toBeDefined();
    expect(localArchiveId).not.toBe("hub_archive_1");
    expect(localSeedId).not.toBe("hub_seed_1");
    expect(localConflictId).not.toBe("hub_conflict_1");
    expect(result.remap.counts).toEqual({ assets: 3, archive: 1, seeds: 1, conflicts: 1 });

    const [archive] = await worlds.listArchiveEntries(result.world.id);
    const [seed] = await worlds.listStorySeeds(result.world.id);
    const [conflict] = await worlds.listConflicts(result.world.id);
    expect(archive?.id).toBe(localArchiveId);
    expect(seed?.id).toBe(localSeedId);
    expect(conflict?.id).toBe(localConflictId);
    expect(archive?.relations).toEqual([localConflictId, "unknown_text_ref"]);
    expect(conflict?.related).toEqual([localArchiveId, "missing_related"]);
    expect(conflict?.derivedSeeds).toEqual([localSeedId]);
  });

  it("pulls a v2 release snapshot and imports official markdown assets", async () => {
    const worlds = createInMemoryWorlds();
    const officialAssets = createFakeOfficialAssetsService();
    const service = createPullClientService(
      worlds,
      async () => jsonResponse(pulledOfficialRepositoryResponse()),
      { officialAssets },
    );

    const result = await service.pullWorld({ owner: "studio", slug: "memory-market" });

    expect(result.world).toMatchObject({
      name: "回忆所",
      type: "近未来",
      mode: "local",
      archive: 0,
      seeds: 0,
      conflicts: 0,
    });
    expect(result.remap.counts).toEqual({ assets: 1, archive: 0, seeds: 0, conflicts: 0 });

    const listed = await officialAssets.listAssets(result.world.id);
    expect(listed.assets).toHaveLength(1);
    const detail = await officialAssets.getAsset(result.world.id, listed.assets[0].id);
    expect(detail.asset).toMatchObject({
      type: "rule",
      name: "记忆交易许可",
      tags: ["法律"],
      metadata: { authority: "记忆署" },
    });
    expect(detail.markdown).toContain("所有记忆交易都需要登记");
  });

  it("rejects when the Hub connection is not configured without calling fetch", async () => {
    const worlds = createInMemoryWorlds();
    const hubFetch = vi.fn(async () => jsonResponse(pulledRepositoryResponse()));
    const service = createPullClientService(worlds, hubFetch, { connection: null });

    await expect(service.pullWorld({ owner: "studio", slug: "memory-market" })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NOT_FOUND" }),
    });
    expect(hubFetch).not.toHaveBeenCalled();
  });

  it.each([
    { owner: "..", slug: "memory-market" },
    { owner: "studio", slug: "memory/market" },
    { owner: "studio", slug: "memory\\market" },
  ])("rejects unsafe repository path segments before calling fetch: %o", async (input) => {
    const worlds = createInMemoryWorlds();
    const hubFetch = vi.fn(async () => jsonResponse(pulledRepositoryResponse()));
    const service = createPullClientService(worlds, hubFetch);

    await expect(service.pullWorld(input)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "VALIDATION_FAILED" }),
    });
    expect(hubFetch).not.toHaveBeenCalled();
  });

  it("rejects duplicate upstream asset ids before creating a local world", async () => {
    const worlds = createInMemoryWorlds();
    const response = pulledRepositoryResponse();
    response.snapshot.assets[1].id = response.snapshot.assets[0].id;
    const service = createPullClientService(worlds, async () => jsonResponse(response));

    await expect(service.pullWorld({ owner: "studio", slug: "memory-market" })).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "VALIDATION_FAILED",
        details: { assetIds: ["hub_archive_1"] },
      }),
    });
    await expect(worlds.listWorlds()).resolves.toEqual([]);
  });

  it("cleans up the created world when asset import fails", async () => {
    const worlds = createInMemoryWorlds();
    const createConflict = worlds.createConflict.bind(worlds);
    worlds.createConflict = vi.fn(async (input) => {
      if (input.title === "许可与黑市") throw new Error("simulated asset write failure");
      return createConflict(input);
    });
    const service = createPullClientService(worlds, async () => jsonResponse(pulledRepositoryResponse()));

    await expect(service.pullWorld({ owner: "studio", slug: "memory-market" })).rejects.toThrow("simulated asset write failure");
    await expect(worlds.listWorlds()).resolves.toEqual([]);
    expect(worlds.stores.worlds.get("world_1")?.deletedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid WorldHub pull responses", async () => {
    const worlds = createInMemoryWorlds();
    const service = createPullClientService(worlds, async () => jsonResponse({
      repository: { owner: "studio", slug: "memory-market", name: "回忆所", summary: "" },
      snapshot: { contractVersion: "1.0.0" },
    }));

    await expect(service.pullWorld({ owner: "studio", slug: "memory-market" })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "HUB_PULL_INVALID_RESPONSE" }),
    });
  });

  it("rejects non-JSON WorldHub pull responses", async () => {
    const worlds = createInMemoryWorlds();
    const service = createPullClientService(worlds, async () => new Response("not json", { status: 200 }));

    await expect(service.pullWorld({ owner: "studio", slug: "memory-market" })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "HUB_PULL_INVALID_RESPONSE" }),
    });
  });

  it("maps non-2xx WorldHub responses to HUB_PULL_FAILED", async () => {
    const worlds = createInMemoryWorlds();
    const service = createPullClientService(worlds, async () => jsonResponse(
      { code: "UPSTREAM_ERROR" },
      { status: 503 },
    ));

    await expect(service.pullWorld({ owner: "studio", slug: "memory-market" })).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "HUB_PULL_FAILED",
        details: { status: 503 },
      }),
    });
  });

  it("maps fetch failures to HUB_PULL_FAILED without exposing the PAT", async () => {
    const worlds = createInMemoryWorlds();
    const service = createPullClientService(worlds, async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    try {
      await service.pullWorld({ owner: "studio", slug: "memory-market" });
      throw new Error("Expected fetch abort to fail.");
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          code: "HUB_PULL_FAILED",
          details: { reason: "request_failed" },
        }),
      });
      expect(JSON.stringify((error as { response?: unknown }).response)).not.toContain("wdpat_full_token_1234567890");
    }
  });
});

describe("world pull route", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("passes route input to PullClientService", async () => {
    const pullClient = {
      pullWorld: vi.fn(async () => ({
        world: { id: "world_2", name: "回忆所" },
        remap: { assets: [{ upstreamId: "hub_archive_1", localId: "archive_2" }], counts: { assets: 1, archive: 1, seeds: 0, conflicts: 0 } },
      })),
    };
    app = await createHttpTestApp({
      controllers: [WorldsController],
      providers: [
        { provide: WORLD_REPOSITORY, useValue: createInMemoryWorlds() },
        { provide: PullClientService, useValue: pullClient },
      ],
    });

    const response = await request(app.getHttpServer())
      .post("/v1/worlds/pull")
      .send({ owner: "studio", slug: "memory-market" })
      .expect(201);

    expect(response.body.world.id).toBe("world_2");
    expect(pullClient.pullWorld).toHaveBeenCalledWith({
      owner: "studio",
      slug: "memory-market",
    });
  });

  it("returns VALIDATION_FAILED for unsafe pull request path segments", async () => {
    const pullClient = {
      pullWorld: vi.fn(),
    };
    app = await createHttpTestApp({
      controllers: [WorldsController],
      providers: [
        { provide: WORLD_REPOSITORY, useValue: createInMemoryWorlds() },
        { provide: PullClientService, useValue: pullClient },
      ],
    });

    const response = await request(app.getHttpServer())
      .post("/v1/worlds/pull")
      .send({ owner: "..", slug: "memory/market" })
      .expect(400);

    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(pullClient.pullWorld).not.toHaveBeenCalled();
  });
});

function createPullClientService(
  worlds: InMemoryWorlds,
  hubFetch: PullClientFetch,
  options: {
    connection?: Awaited<ReturnType<ConnectionsService["getInternalHubConnection"]>> | null;
    officialAssets?: OfficialAssetsService;
  } = {},
) {
  const defaultConnection = {
    id: "default",
    hubUrl: "https://hub.example.test",
    token: "wdpat_full_token_1234567890",
    createdAt: new Date("2026-06-12T00:00:00.000Z"),
    updatedAt: new Date("2026-06-12T00:00:00.000Z"),
  };
  const connection = options.connection === undefined ? defaultConnection : options.connection;
  const connections = {
    async getInternalHubConnection() {
      return connection;
    },
  } as ConnectionsService;
  return new PullClientService(
    connections,
    new ExportsService(worlds, options.officialAssets),
    hubFetch,
  );
}

function pulledRepositoryResponse() {
  const assets = [
    {
      id: "hub_archive_1",
      kind: "setting" as const,
      title: "记忆交易法",
      summary: "所有交易都需要登记。",
      body: "未登记交易会触发城市信用审查。",
      payload: { category: "世界规则", relations: ["hub_conflict_1", "unknown_text_ref"] },
    },
    {
      id: "hub_seed_1",
      kind: "seed" as const,
      title: "继承的童年",
      summary: "主角买到一段陌生童年。",
      body: "这段记忆会改写他对家人的判断。",
      payload: {
        trigger: "一次非法交易",
        protagonists: "记忆修复师",
        questions: ["原主为何出售记忆？"],
      },
    },
    {
      id: "hub_conflict_1",
      kind: "conflict" as const,
      title: "许可与黑市",
      summary: "合法许可和地下交易互相挤压。",
      body: "黑市让弱者获得机会，也让记忆被掠夺。",
      payload: { related: ["hub_archive_1", "missing_related"], derivedSeeds: ["hub_seed_1"] },
    },
  ];

  return {
    repository: { owner: "studio", slug: "memory-market", name: "回忆所", summary: "公开仓库" },
    snapshot: {
      contractVersion: "1.0.0",
      repository: { owner: "studio", slug: "memory-market", name: "回忆所" },
      package: {
        format: "worlddock.world-package.v1",
        exportedAt: "2026-06-12T00:00:00.000Z",
        world: {
          name: "回忆所",
          type: "近未来",
          summary: "记忆可以被买卖。",
          tags: ["记忆", "城市"],
          maturity: 27,
        },
        assets: assets.map(({ id: _id, ...asset }) => asset),
        releases: [],
      },
      assets,
      createdAt: "2026-06-12T00:00:00.000Z",
    },
  };
}

function pulledOfficialRepositoryResponse() {
  const officialAsset = {
    id: "official_asset_upstream_1",
    type: "rule" as const,
    name: "记忆交易许可",
    summary: "所有记忆交易都需要登记。",
    markdown: "# 记忆交易许可\n\n## 概括\n\n所有记忆交易都需要登记。",
    tags: ["法律"],
    metadata: { authority: "记忆署" },
    status: "active" as const,
    version: 1,
  };
  const { id: _id, ...packageAsset } = officialAsset;

  return {
    repository: { owner: "studio", slug: "memory-market", name: "回忆所", summary: "公开仓库" },
    snapshot: {
      contractVersion: "1.0.0",
      repository: { owner: "studio", slug: "memory-market", name: "回忆所" },
      package: {
        format: "worlddock.world-package.v2",
        exportedAt: "2026-06-12T00:00:00.000Z",
        world: {
          name: "回忆所",
          type: "近未来",
          summary: "记忆可以被买卖。",
          tags: ["记忆", "城市"],
          maturity: 27,
        },
        assets: [packageAsset],
        releases: [],
      },
      assets: [officialAsset],
      createdAt: "2026-06-12T00:00:00.000Z",
    },
  };
}

function createFakeOfficialAssetsService(): OfficialAssetsService {
  const details = new Map<string, OfficialAssetDetailRecord & { markdown: string }>();
  let assetCount = 1;

  return {
    async createAsset(worldId: string, input: Parameters<OfficialAssetsService["createAsset"]>[1]) {
      const timestamp = new Date("2026-06-12T00:00:00.000Z");
      const asset: OfficialAssetRecord = {
        id: `official_asset_${assetCount++}`,
        worldId,
        type: input.type,
        name: input.name,
        summary: input.summary,
        documentKey: `worlds/${worldId}/official-assets/official_asset_${assetCount}.md`,
        status: "active",
        version: 1,
        tags: input.tags ?? [],
        metadata: input.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };
      const detail: OfficialAssetDetailRecord & { markdown: string } = {
        asset,
        markdown: input.markdown ?? input.summary,
        revisions: [],
        indexes: [],
      };
      details.set(asset.id, detail);
      return detail;
    },
    async listAssets(worldId: string) {
      return {
        assets: [...details.values()].map((detail) => detail.asset).filter((asset) => asset.worldId === worldId),
        nextCursor: null,
      };
    },
    async getAsset(worldId: string, assetId: string) {
      const detail = details.get(assetId);
      if (!detail || detail.asset.worldId !== worldId) {
        throw new Error("Official asset not found.");
      }
      return detail;
    },
    async updateAsset() {
      throw new Error("Not implemented in test fake.");
    },
  } as unknown as OfficialAssetsService;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}
