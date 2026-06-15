import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type INestApplication } from "@nestjs/common";
import { LocalStorageService } from "../src/modules/local-storage/local-storage.service";
import { OfficialAssetsController } from "../src/modules/official-assets/official-assets.controller";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  type CreateOfficialAssetRecordInput,
  type ListOfficialAssetsQuery,
  type OfficialAssetDetailRecord,
  type OfficialAssetRecord,
  type OfficialAssetRevisionRecord,
  type OfficialAssetsRepository,
  type OfficialAssetSectionIndexRecord,
} from "../src/modules/official-assets/official-assets.repository";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpTestApp, createInMemoryWorlds, type InMemoryWorlds } from "./local-api-test-helpers";

describe("official assets local endpoints", () => {
  let app: INestApplication | undefined;
  let dataDir: string;
  let previousDataDir: string | undefined;

  beforeEach(async () => {
    previousDataDir = process.env.WORLD_DOCK_DATA_DIR;
    dataDir = await mkdtemp(join(tmpdir(), "worlddock-official-assets-"));
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

  it("creates an official asset and stores markdown in local storage", async () => {
    const worlds = createInMemoryWorlds();
    const world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "local",
      maturity: 12,
    });
    app = await createOfficialAssetsApp(worlds);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets`)
      .send({
        type: "rule",
        name: "记忆交易许可",
        summary: "所有记忆交易都需要登记。",
        markdown: "# 记忆交易许可\n\n## 概括\n\n所有记忆交易都需要登记。",
        tags: ["法律"],
      })
      .expect(201);

    expect(created.body.asset).toMatchObject({
      worldId: world.id,
      type: "rule",
      name: "记忆交易许可",
      version: 1,
      status: "active",
    });
    expect(created.body.asset.documentKey).toMatch(/^worlds\/world_1\/official-assets\/.+\.md$/);

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/official-assets/${created.body.asset.id}`)
      .expect(200);

    expect(detail.body.markdown).toContain("所有记忆交易都需要登记");
    expect(detail.body.revisions).toHaveLength(1);
  });
});

async function createOfficialAssetsApp(worlds: InMemoryWorlds) {
  return createHttpTestApp({
    controllers: [OfficialAssetsController],
    providers: [
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
