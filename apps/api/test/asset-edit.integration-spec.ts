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
  type ApplyOfficialAssetPatchRecordInput,
  type CreateOfficialAssetRecordInput,
  type ListOfficialAssetsQuery,
  type OfficialAssetDetailRecord,
  type OfficialAssetPatchesRepository,
  type OfficialAssetPatchRecord,
  type OfficialAssetRecord,
  type OfficialAssetRevisionRecord,
  type OfficialAssetsRepository,
  type OfficialAssetSectionIndexRecord,
  type UpdateOfficialAssetRecordInput,
} from "../src/modules/official-assets/official-assets.repository";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
import { WorldAssetPatchesService } from "../src/modules/official-assets/world-asset-patches.service";
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
  let agentSessions: InMemoryAgentSessions;

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
    agentSessions = createInMemoryAgentSessions();
    app = await createAssetEditApp(worlds, agentSessions);
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

  it("applies a markdown patch and creates revision", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const session = await createAssetEditSession(asset.id);

    const applied = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .send({
        sessionId: session.id,
        afterMarkdown: "# 记忆交易许可\n\n## 概括\n\n登记许可必须每年续期。",
        reason: "补充续期规则",
      })
      .expect(201);

    expect(applied.body.patch).toMatchObject({
      assetId: asset.id,
      sessionId: session.id,
      status: "applied",
      assetVersionFrom: 1,
      assetVersionTo: 2,
    });
    expect(applied.body.patch.diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "add", text: expect.stringContaining("续期") }),
    ]));

    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(2);
    expect(detail.markdown).toContain("每年续期");
    expect(detail.revisions).toHaveLength(2);
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

  it("returns 404 and creates no session when the official asset is missing", async () => {
    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/missing/edit-sessions`)
      .expect(404);

    await expect(agentSessions.listSessions(world.id, { kind: "asset_edit" })).resolves.toMatchObject({
      sessions: [],
    });
  });

  it("returns 404 and creates no session when the asset belongs to another world", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const otherWorld = await worlds.createWorld({
      name: "白塔城",
      type: "奇幻",
      summary: "白塔管理整座城市的记忆。",
      tags: ["白塔"],
      mode: "local",
      maturity: 12,
    });

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${otherWorld.id}/official-assets/${asset.id}/edit-sessions`)
      .expect(404);

    await expect(agentSessions.listSessions(otherWorld.id, { kind: "asset_edit" })).resolves.toMatchObject({
      sessions: [],
    });
  });

  it("does not leave an asset edit session when initial context creation fails", async () => {
    const sessions = createInMemoryAgentSessions({ failContextItemKinds: new Set<"asset_document">(["asset_document"]) });
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
    expect(sessions.stores.sessions.size).toBe(0);
    expect(sessions.stores.subjects).toEqual([]);
    expect(sessions.stores.contextItems).toEqual([]);
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

  async function createAssetEditSession(assetId: string) {
    const created = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${assetId}/edit-sessions`)
      .send({})
      .expect(201);

    return created.body.session as { id: string };
  }

  async function getOfficialAsset(assetId: string) {
    const detail = await request(app?.getHttpServer())
      .get(`/v1/worlds/${world.id}/official-assets/${assetId}`)
      .expect(200);

    return detail.body as { asset: OfficialAssetRecord; markdown: string; revisions: unknown[] };
  }
});

async function createAssetEditApp(worlds: InMemoryWorlds, sessions: InMemoryAgentSessions = createInMemoryAgentSessions()) {
  return createHttpTestApp({
    controllers: [OfficialAssetsController],
    providers: [
      AgentSessionsService,
      OfficialAssetsService,
      WorldAssetPatchesService,
      LocalStorageService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: createInMemoryOfficialAssets() },
    ],
  });
}

function createInMemoryOfficialAssets(): OfficialAssetsRepository & OfficialAssetPatchesRepository {
  const assets = new Map<string, OfficialAssetRecord>();
  const revisions = new Map<string, OfficialAssetRevisionRecord[]>();
  const indexes = new Map<string, OfficialAssetSectionIndexRecord[]>();
  const patches = new Map<string, OfficialAssetPatchRecord[]>();
  let assetCount = 1;
  let revisionCount = 1;
  let indexCount = 1;
  let patchCount = 1;

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
      patches.set(asset.id, []);
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
    async applyPatch(input: ApplyOfficialAssetPatchRecordInput): Promise<OfficialAssetPatchRecord | null> {
      const asset = assets.get(input.assetId);
      if (!asset || asset.worldId !== input.worldId) return null;
      const timestamp = new Date();
      const existingRevisions = revisions.get(asset.id) ?? [];
      const versionFrom = asset.version;
      const versionTo = versionFrom + 1;
      const updated: OfficialAssetRecord = {
        ...asset,
        summary: input.summary,
        version: versionTo,
        updatedAt: timestamp,
      };
      const revision: OfficialAssetRevisionRecord = {
        id: `official_asset_revision_${revisionCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        version: versionTo,
        markdown: input.afterMarkdown,
        summary: input.summary,
        metadata: { sessionId: input.sessionId, source: "patch" },
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
      const patch: OfficialAssetPatchRecord = {
        id: `world_asset_patch_${patchCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        sessionId: input.sessionId,
        batchId: null,
        beforeRevisionId: existingRevisions[0]?.id ?? null,
        afterRevisionId: revision.id,
        beforeMarkdown: input.beforeMarkdown,
        afterMarkdown: input.afterMarkdown,
        diff: input.diff,
        assetVersionFrom: versionFrom,
        assetVersionTo: versionTo,
        status: "applied",
        metadata: { ...(input.metadata ?? {}), sessionId: input.sessionId },
        createdAt: timestamp,
        updatedAt: timestamp,
        appliedAt: timestamp,
        revertedAt: null,
      };

      assets.set(asset.id, updated);
      revisions.set(asset.id, [revision, ...existingRevisions]);
      indexes.set(asset.id, sectionIndexes);
      patches.set(asset.id, [patch, ...(patches.get(asset.id) ?? [])]);
      return patch;
    },
    async listPatches(worldId: string, assetId: string): Promise<OfficialAssetPatchRecord[]> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return [];
      return patches.get(assetId) ?? [];
    },
    async getPatch(worldId: string, assetId: string, patchId: string): Promise<OfficialAssetPatchRecord | null> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      return (patches.get(assetId) ?? []).find((patch) => patch.id === patchId) ?? null;
    },
  };
}
