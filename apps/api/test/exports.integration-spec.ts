import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExportsController } from "../src/modules/exports/exports.controller";
import { ExportsService } from "../src/modules/exports/exports.service";
import { LocalStorageService } from "../src/modules/local-storage/local-storage.service";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  type CreateOfficialAssetRecordInput,
  type ListOfficialAssetsQuery,
  type OfficialAssetDetailRecord,
  type OfficialAssetRecord,
  type OfficialAssetRevisionRecord,
  type OfficialAssetsRepository,
  type OfficialAssetSectionIndexRecord,
  type UpdateOfficialAssetRecordInput,
} from "../src/modules/official-assets/official-assets.repository";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import { createHttpTestApp, createInMemoryWorlds, type InMemoryWorlds } from "./local-api-test-helpers";

describe("exports local endpoints", () => {
  let app: INestApplication | undefined;
  let dataDir: string;
  let previousDataDir: string | undefined;

  beforeEach(async () => {
    previousDataDir = process.env.WORLD_DOCK_DATA_DIR;
    dataDir = await mkdtemp(join(tmpdir(), "worlddock-exports-"));
    process.env.WORLD_DOCK_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (previousDataDir === undefined) {
      delete process.env.WORLD_DOCK_DATA_DIR;
    } else {
      process.env.WORLD_DOCK_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  it("exports a local world package, reads it back, and imports it as a new local world", async () => {
    const worlds = createInMemoryWorlds();
    const world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆", "城市"],
      mode: "local",
      maturity: 27,
    });
    await worlds.createArchiveEntry({
      worldId: world.id,
      title: "记忆交易法",
      category: "世界规则",
      summary: "所有交易都需要登记。",
      body: "未登记交易会触发城市信用审查。",
      relations: ["城市信用"],
      position: 0,
    });
    await worlds.createStorySeed({
      worldId: world.id,
      title: "继承的童年",
      hook: "主角买到一段陌生童年。",
      trigger: "一次非法交易",
      conflict: "这段记忆会改写他对家人的判断。",
      protagonists: "记忆修复师",
      questions: ["原主为何出售记忆？"],
      position: 1,
    });
    await worlds.createConflict({
      worldId: world.id,
      title: "许可与黑市",
      summary: "合法许可和地下交易互相挤压。",
      body: "黑市让弱者获得机会，也让记忆被掠夺。",
      related: ["记忆交易法"],
      derivedSeeds: ["继承的童年"],
      position: 2,
    });
    app = await createExportsApp(worlds);

    const exported = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/export`)
      .expect(201);
    expect(exported.body.export).toMatchObject({ kind: "world", status: "ready" });

    const fetched = await request(app.getHttpServer())
      .get(`/v1/exports/${exported.body.export.id}`)
      .expect(200);
    expect(fetched.body.package).toMatchObject({
      format: "worlddock.world-package.v1",
      world: {
        name: "回忆所",
        type: "近未来",
        summary: "记忆可以被买卖。",
        tags: ["记忆", "城市"],
        maturity: 27,
      },
    });
    expect(fetched.body.package.assets.map((asset: { kind: string }) => asset.kind).sort()).toEqual([
      "conflict",
      "seed",
      "setting",
    ]);

    const imported = await request(app.getHttpServer())
      .post("/v1/worlds/import")
      .send({ package: fetched.body.package })
      .expect(201);
    expect(imported.body.world).toMatchObject({
      name: "回忆所",
      type: "近未来",
      mode: "local",
      archive: 1,
      seeds: 1,
      conflicts: 1,
    });
    expect(imported.body.world.id).not.toBe(world.id);
  });

  it("exports official markdown assets when a world has official assets", async () => {
    const worlds = createInMemoryWorlds();
    const world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆", "城市"],
      mode: "local",
      maturity: 27,
    });
    app = await createExportsApp(worlds);
    const officialAssets = app.get(OfficialAssetsService);
    await officialAssets.createAsset(world.id, {
      type: "rule",
      name: "记忆交易许可",
      summary: "所有记忆交易都需要登记。",
      markdown: "# 记忆交易许可\n\n## 概括\n\n所有记忆交易都需要登记。",
      tags: ["法律"],
      metadata: { authority: "记忆署" },
    });

    const exported = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/export`)
      .expect(201);
    const fetched = await request(app.getHttpServer())
      .get(`/v1/exports/${exported.body.export.id}`)
      .expect(200);

    const pkg = fetched.body.package;
    expect(pkg.format).toBe("worlddock.world-package.v2");
    expect(pkg.assets).toEqual([
      expect.objectContaining({
        type: "rule",
        name: "记忆交易许可",
        markdown: expect.stringContaining("所有记忆交易都需要登记"),
      }),
    ]);
  });

  it("imports v2 official markdown assets into local storage", async () => {
    const worlds = createInMemoryWorlds();
    app = await createExportsApp(worlds);

    const imported = await request(app.getHttpServer())
      .post("/v1/worlds/import")
      .send({
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
          assets: [
            {
              type: "rule",
              name: "记忆交易许可",
              summary: "所有记忆交易都需要登记。",
              markdown: "# 记忆交易许可\n\n## 概括\n\n所有记忆交易都需要登记。",
              tags: ["法律"],
              metadata: { authority: "记忆署" },
            },
          ],
          releases: [],
        },
      })
      .expect(201);

    const officialAssets = app.get(OfficialAssetsService);
    const listed = await officialAssets.listAssets(imported.body.world.id);
    expect(listed.assets).toHaveLength(1);

    const detail = await officialAssets.getAsset(imported.body.world.id, listed.assets[0].id);
    expect(detail.asset).toMatchObject({
      type: "rule",
      name: "记忆交易许可",
      tags: ["法律"],
      metadata: { authority: "记忆署" },
    });
    expect(detail.markdown).toContain("所有记忆交易都需要登记");
  });
});

async function createExportsApp(worlds: InMemoryWorlds) {
  return createHttpTestApp({
    controllers: [ExportsController],
    providers: [
      ExportsService,
      OfficialAssetsService,
      LocalStorageService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: createInMemoryOfficialAssets() },
    ],
  });
}

function createInMemoryOfficialAssets(): OfficialAssetsRepository {
  const assets = new Map<string, OfficialAssetRecord>();
  const revisions = new Map<string, OfficialAssetRevisionRecord[]>();
  const indexes = new Map<string, OfficialAssetSectionIndexRecord[]>();
  let assetCount = 1;
  let revisionCount = 1;
  let indexCount = 1;

  return {
    async createAsset(input: CreateOfficialAssetRecordInput) {
      const timestamp = new Date();
      const asset: OfficialAssetRecord = {
        id: `official_asset_${assetCount++}`,
        worldId: input.worldId,
        type: input.type,
        name: input.name,
        summary: input.summary,
        documentKey: input.documentKey,
        status: "active",
        version: 1,
        tags: [...(input.tags ?? [])],
        metadata: input.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };
      const revision: OfficialAssetRevisionRecord = {
        id: `official_asset_revision_${revisionCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        version: 1,
        markdown: input.initialRevision.markdown,
        summary: input.initialRevision.summary,
        metadata: input.initialRevision.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const sectionIndexes = input.indexes.map((section) => ({
        id: `official_asset_index_${indexCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        title: section.title,
        summary: section.summary ?? null,
        metadata: section.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      assets.set(asset.id, asset);
      revisions.set(asset.id, [revision]);
      indexes.set(asset.id, sectionIndexes);
      return { asset, revisions: [revision], indexes: sectionIndexes };
    },
    async updateAsset(
      worldId: string,
      assetId: string,
      input: UpdateOfficialAssetRecordInput,
    ): Promise<OfficialAssetDetailRecord | null> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      const timestamp = new Date();
      const archivedAt = nextArchivedAt({
        currentStatus: asset.status,
        currentArchivedAt: asset.archivedAt,
        nextStatus: input.status,
        now: timestamp,
      });
      const updated: OfficialAssetRecord = {
        ...asset,
        name: input.name ?? asset.name,
        summary: input.summary ?? asset.summary,
        tags: input.tags ?? asset.tags,
        metadata: input.metadata ?? asset.metadata,
        status: input.status ?? asset.status,
        archivedAt: archivedAt === undefined ? asset.archivedAt : archivedAt,
        updatedAt: timestamp,
      };
      assets.set(asset.id, updated);
      return {
        asset: updated,
        revisions: revisions.get(asset.id) ?? [],
        indexes: indexes.get(asset.id) ?? [],
      };
    },
    async listAssets(worldId: string, query: ListOfficialAssetsQuery = {}) {
      const filtered = [...assets.values()]
        .filter((asset) => asset.worldId === worldId)
        .filter((asset) => !query.type || asset.type === query.type)
        .filter((asset) => !query.q || searchableText(asset).includes(query.q.toLocaleLowerCase()));
      return { assets: filtered, nextCursor: null };
    },
    async getAsset(worldId: string, assetId: string): Promise<OfficialAssetDetailRecord | null> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      return {
        asset,
        revisions: revisions.get(asset.id) ?? [],
        indexes: indexes.get(asset.id) ?? [],
      };
    },
  };
}

function searchableText(asset: OfficialAssetRecord) {
  return `${asset.name}\n${asset.summary}`.toLocaleLowerCase();
}

function nextArchivedAt(input: {
  currentStatus: OfficialAssetRecord["status"];
  currentArchivedAt: Date | null;
  nextStatus: UpdateOfficialAssetRecordInput["status"];
  now: Date;
}) {
  if (input.nextStatus === undefined) return undefined;
  if (input.nextStatus === "active") return null;
  if (input.currentStatus !== "archived" || input.currentArchivedAt === null) return input.now;
  return undefined;
}
