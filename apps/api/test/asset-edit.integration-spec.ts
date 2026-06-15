import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type INestApplication } from "@nestjs/common";
import type { OfficialWorldAssetType } from "@worlddock/contract/assets";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
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
  type UpdateOfficialAssetRecordInput,
} from "../src/modules/official-assets/official-assets.repository";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import {
  createHttpTestApp,
  createInMemoryAgentSessions,
  createInMemoryWorlds,
  type InMemoryAgentSessions,
  type InMemoryWorlds,
} from "./local-api-test-helpers";

describe("asset edit local endpoints", () => {
  let app: INestApplication | undefined;
  let dataDir: string;
  let previousDataDir: string | undefined;
  let worlds: InMemoryWorlds;
  let world: Awaited<ReturnType<InMemoryWorlds["createWorld"]>>;

  beforeEach(async () => {
    previousDataDir = process.env.WORLD_DOCK_DATA_DIR;
    dataDir = await mkdtemp(join(tmpdir(), "worlddock-asset-edit-"));
    process.env.WORLD_DOCK_DATA_DIR = dataDir;

    worlds = createInMemoryWorlds();
    world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "local",
      maturity: 12,
    });
    app = await createAssetEditApp(worlds);
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

  it("creates an asset edit session from an official asset", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");

    const created = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/edit-sessions`)
      .send({ title: "调整记忆交易许可" })
      .expect(201);

    expect(created.body.session).toMatchObject({
      worldId: world.id,
      kind: "asset_edit",
      title: "调整记忆交易许可",
      current: false,
    });
    expect(created.body.subjects).toEqual([
      expect.objectContaining({ subjectKind: "asset", subjectId: asset.id, role: "primary" }),
    ]);
    expect(created.body.contextItems).toEqual([
      expect.objectContaining({
        kind: "asset_document",
        targetId: asset.id,
        title: asset.name,
        summary: asset.summary,
        source: "initial",
        metadata: expect.objectContaining({
          documentKey: asset.documentKey,
          version: asset.version,
          source: "initial",
        }),
      }),
    ]);
  });

  it("creates default titled asset edit sessions when the body is omitted or empty", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");

    const omittedBody = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/edit-sessions`)
      .expect(201);

    expect(omittedBody.body.session).toMatchObject({
      worldId: world.id,
      kind: "asset_edit",
      title: "Asset edit",
      current: false,
    });

    const emptyBody = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/edit-sessions`)
      .send({})
      .expect(201);

    expect(emptyBody.body.session).toMatchObject({
      worldId: world.id,
      kind: "asset_edit",
      title: "Asset edit",
      current: false,
    });
  });

  it("does not leave an asset edit session when initial context creation fails", async () => {
    const sessions = createContextFailingAgentSessions();
    await app?.close();
    app = await createAssetEditApp(worlds, sessions);
    const asset = await createOfficialAsset("rule", "记忆交易许可");

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/edit-sessions`)
      .send({ title: "调整记忆交易许可" })
      .expect(500);

    await expect(sessions.listSessions(world.id, { kind: "asset_edit" })).resolves.toMatchObject({
      sessions: [],
    });
  });

  async function createOfficialAsset(type: OfficialWorldAssetType, name: string) {
    const created = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets`)
      .send({
        type,
        name,
        summary: "所有记忆交易都需要登记。",
        markdown: `# ${name}\n\n## 概括\n\n所有记忆交易都需要登记。`,
        tags: ["法律"],
      })
      .expect(201);

    return created.body.asset as OfficialAssetRecord;
  }
});

async function createAssetEditApp(worlds: InMemoryWorlds, sessions: InMemoryAgentSessions = createInMemoryAgentSessions()) {
  return createHttpTestApp({
    controllers: [OfficialAssetsController],
    providers: [
      AgentSessionsService,
      OfficialAssetsService,
      LocalStorageService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: createInMemoryOfficialAssets() },
    ],
  });
}

function createContextFailingAgentSessions(): InMemoryAgentSessions {
  const sessions = createInMemoryAgentSessions();
  return {
    ...sessions,
    async createSessionWithSubject(input) {
      if (input.contextItems?.length) throw new Error("context write failed");
      return sessions.createSessionWithSubject(input);
    },
    async createContextItem() {
      throw new Error("context write failed");
    },
  };
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
      const updated: OfficialAssetRecord = { ...asset, ...input, updatedAt: new Date() };
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
        .filter((asset) => !query.q || `${asset.name}\n${asset.summary}`.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()));
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
