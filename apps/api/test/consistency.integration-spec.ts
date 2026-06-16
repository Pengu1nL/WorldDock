import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type INestApplication } from "@nestjs/common";
import { type ConsistencyIssueStatus } from "@worlddock/contract/consistency";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
import { LocalStorageService } from "../src/modules/local-storage/local-storage.service";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  OfficialAssetPatchAlreadyRevertedError,
  OfficialAssetPatchConflictError,
  type ApplyOfficialAssetPatchRecordInput,
  type CreateOfficialAssetRecordInput,
  type CreateOfficialAssetPatchBatchRecordInput,
  type ListOfficialAssetsQuery,
  type OfficialAssetDetailRecord,
  type OfficialAssetPatchBatchRecord,
  type OfficialAssetPatchesRepository,
  type OfficialAssetPatchRecord,
  type OfficialAssetRecord,
  type OfficialAssetRevisionRecord,
  type OfficialAssetsRepository,
  type OfficialAssetSectionIndexRecord,
  type RevertOfficialAssetPatchRecordInput,
  type UpdateOfficialAssetRecordInput,
} from "../src/modules/official-assets/official-assets.repository";
import { OfficialAssetLockService } from "../src/modules/official-assets/official-asset-lock.service";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
import { WorldAssetPatchesService } from "../src/modules/official-assets/world-asset-patches.service";
import { ConsistencyChecker } from "../src/modules/consistency/consistency-checker";
import { ConsistencyController } from "../src/modules/consistency/consistency.controller";
import {
  CONSISTENCY_REPOSITORY,
  decodeConsistencyIssueListCursor,
  encodeConsistencyIssueListCursor,
  InvalidConsistencyIssueListCursorError,
  type ConsistencyIssueRecord,
  type ConsistencyRepository,
  type CreateConsistencyIssueRecordInput,
  type ListConsistencyIssuesQuery,
  normalizeConsistencyIssueListLimit,
} from "../src/modules/consistency/consistency.repository";
import { ConsistencyService } from "../src/modules/consistency/consistency.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createHttpTestApp,
  createInMemoryAgentSessions,
  createInMemoryWorlds,
  type InMemoryWorlds,
} from "./local-api-test-helpers";

describe("consistency issues local endpoints", () => {
  let app: INestApplication | undefined;
  let dataDir: string;
  let previousDataDir: string | undefined;

  beforeEach(async () => {
    previousDataDir = process.env.WORLD_DOCK_DATA_DIR;
    dataDir = await mkdtemp(join(tmpdir(), "worlddock-consistency-"));
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

  it("checks official assets and lists consistency issues", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;

    await setup.createOfficialAssetWithMarkdown("rule", "记忆交易许可", "所有记忆交易必须登记。");
    await setup.createOfficialAssetWithMarkdown("event", "自由交易日", "自由交易日当天记忆交易无需登记。");

    const checked = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/check`)
      .expect(201);

    expect(checked.body.issues).toHaveLength(1);
    expect(checked.body.issues[0]).toMatchObject({
      worldId: setup.world.id,
      status: "open",
      severity: "normal",
    });

    const listed = await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues`)
      .expect(200);

    expect(listed.body.issues).toHaveLength(1);
  });

  it("does not create duplicate open issues on repeated checks", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;

    await setup.createOfficialAssetWithMarkdown("rule", "记忆交易许可", "所有记忆交易必须登记。");
    await setup.createOfficialAssetWithMarkdown("event", "自由交易日", "自由交易日当天记忆交易无需登记。");

    const first = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/check`)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/check`)
      .expect(201);

    expect(first.body.issues).toHaveLength(1);
    expect(second.body.issues).toHaveLength(1);
    expect(second.body.issues[0].id).toBe(first.body.issues[0].id);

    const listed = await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues`)
      .expect(200);

    expect(listed.body.issues).toHaveLength(1);
  });

  it("filters ignored issues and clears resolvedAt when reopened", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;
    const issue = await setup.seedIssue("记忆交易许可冲突", "memory-trade");

    const ignored = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/ignore`)
      .expect(200);

    expect(ignored.body.issue).toMatchObject({ id: issue.id, status: "ignored" });
    expect(ignored.body.issue.resolvedAt).toEqual(expect.any(String));

    const defaultList = await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues`)
      .expect(200);
    expect(defaultList.body.issues).toHaveLength(0);

    const ignoredList = await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues?status=ignored`)
      .expect(200);
    expect(ignoredList.body.issues).toHaveLength(1);

    const reopened = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/reopen`)
      .expect(200);

    expect(reopened.body.issue).toMatchObject({ id: issue.id, status: "open", resolvedAt: null });

    const openList = await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues`)
      .expect(200);
    expect(openList.body.issues).toHaveLength(1);
  });

  it("paginates consistency issues with a stable cursor", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;
    await setup.seedIssue("第一条冲突", "first");
    await wait(5);
    await setup.seedIssue("第二条冲突", "second");

    const firstPage = await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues?limit=1`)
      .expect(200);

    expect(firstPage.body.issues).toHaveLength(1);
    expect(firstPage.body.issues[0].title).toBe("第二条冲突");
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues?limit=1&cursor=${firstPage.body.nextCursor}`)
      .expect(200);

    expect(secondPage.body.issues).toHaveLength(1);
    expect(secondPage.body.issues[0].title).toBe("第一条冲突");
    expect(secondPage.body.nextCursor).toBeNull();
  });

  it("rejects invalid list cursors", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;

    await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues?cursor=not-a-cursor`)
      .expect(400);
  });

  it("returns issue details and 404 for missing issues", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;
    const issue = await setup.seedIssue("记忆交易许可冲突", "memory-trade");

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}`)
      .expect(200);

    expect(detail.body.issue).toMatchObject({ id: issue.id, title: "记忆交易许可冲突" });

    await request(app.getHttpServer())
      .get(`/v1/worlds/${setup.world.id}/consistency-issues/missing_issue`)
      .expect(404);
  });

  it("creates a repair session and applies a patch batch", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;
    const { issue } = await setup.createOpenConsistencyIssue();

    const sessionResponse = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/repair-sessions`)
      .send({ title: "修复登记口径冲突" })
      .expect(201);

    expect(sessionResponse.body.session).toMatchObject({
      kind: "consistency_repair",
      current: false,
    });
    expect(sessionResponse.body.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectKind: "consistency_issue",
        subjectId: issue.id,
        role: "primary",
      }),
    ]));
    expect(sessionResponse.body.contextItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "asset_document", targetId: "official_asset_1" }),
      expect.objectContaining({ kind: "asset_document", targetId: "official_asset_2" }),
    ]));

    const batch = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/patch-batches`)
      .send({
        sessionId: sessionResponse.body.session.id,
        patches: [{
          assetId: "official_asset_2",
          afterMarkdown: "# 自由交易日\n\n## 概括\n\n自由交易日当天仍需登记，但费用为零。",
          reason: "统一登记口径",
        }],
      })
      .expect(201);

    expect(batch.body.batch).toMatchObject({
      issueId: issue.id,
      status: "applied",
      patchIds: [expect.any(String)],
    });

    const listedPatches = await setup.officialAssets.listPatches(setup.world.id, "official_asset_2");
    expect(listedPatches[0]).toMatchObject({
      id: batch.body.batch.patchIds[0],
      batchId: batch.body.batch.id,
      status: "applied",
    });
    const resolved = await setup.consistencyIssues.getIssue(setup.world.id, issue.id);
    expect(resolved?.status).toBe("resolved");
  });

  it("reverts a patch batch and reopens the issue", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;
    const { issue, asset2Markdown } = await setup.createOpenConsistencyIssue();

    const sessionResponse = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/repair-sessions`)
      .send({ title: "修复登记口径冲突" })
      .expect(201);
    const batch = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/patch-batches`)
      .send({
        sessionId: sessionResponse.body.session.id,
        patches: [{
          assetId: "official_asset_2",
          afterMarkdown: "# 自由交易日\n\n## 概括\n\n自由交易日当天仍需登记，但费用为零。",
          reason: "统一登记口径",
        }],
      })
      .expect(201);

    const reverted = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/patch-batches/${batch.body.batch.id}/revert`)
      .expect(200);

    expect(reverted.body.batch).toMatchObject({
      id: batch.body.batch.id,
      status: "reverted",
      patchIds: batch.body.batch.patchIds,
    });
    const reopened = await setup.consistencyIssues.getIssue(setup.world.id, issue.id);
    expect(reopened?.status).toBe("open");
    const asset = await setup.officialAssets.getAsset(setup.world.id, "official_asset_2");
    expect(asset?.revisions[0]?.markdown).toBe(asset2Markdown);
  });

  it("rejects patch batches with the wrong session kind or issue binding", async () => {
    const setup = await createConsistencyTestSetup();
    app = setup.app;
    const { issue } = await setup.createOpenConsistencyIssue();
    const assetEditSession = await app.get(AgentSessionsService).createSession(setup.world.id, {
      kind: "asset_edit",
      subjectAssetId: "official_asset_2",
      title: "错误会话",
    });

    await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/patch-batches`)
      .send({
        sessionId: assetEditSession.id,
        patches: [{
          assetId: "official_asset_2",
          afterMarkdown: "# 自由交易日\n\n## 概括\n\n自由交易日当天仍需登记，但费用为零。",
        }],
      })
      .expect(400);

    const otherIssue = await setup.seedIssue("另一条冲突", "other");
    const repairSession = await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${otherIssue.id}/repair-sessions`)
      .send({ title: "另一条修复" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${setup.world.id}/consistency-issues/${issue.id}/patch-batches`)
      .send({
        sessionId: repairSession.body.session.id,
        patches: [{
          assetId: "official_asset_2",
          afterMarkdown: "# 自由交易日\n\n## 概括\n\n自由交易日当天仍需登记，但费用为零。",
        }],
      })
      .expect(400);
  });
});

async function createConsistencyTestSetup() {
  const worlds = createInMemoryWorlds();
  const world = await worlds.createWorld({
    name: "回忆所",
    type: "近未来",
    summary: "记忆可以被买卖。",
    tags: ["记忆"],
    mode: "local",
    maturity: 12,
  });
  const consistencyIssues = createInMemoryConsistencyIssues();
  const agentSessions = createInMemoryAgentSessions();
  const officialAssets = createInMemoryOfficialAssets();
  const app = await createHttpTestApp({
    controllers: [ConsistencyController],
    providers: [
      AgentSessionsService,
      ConsistencyService,
      ConsistencyChecker,
      OfficialAssetsService,
      OfficialAssetLockService,
      WorldAssetPatchesService,
      LocalStorageService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: agentSessions },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: officialAssets },
      { provide: CONSISTENCY_REPOSITORY, useValue: consistencyIssues },
    ],
  });

  return {
    app,
    world,
    consistencyIssues,
    officialAssets,
    async createOfficialAssetWithMarkdown(type: "rule" | "event", name: string, markdown: string) {
      return app.get(OfficialAssetsService).createAsset(world.id, {
        type,
        name,
        summary: markdown,
        markdown,
        tags: [],
      });
    },
    async createOpenConsistencyIssue() {
      const asset1Markdown = "# 记忆交易许可\n\n## 概括\n\n所有记忆交易必须登记。";
      const asset2Markdown = "# 自由交易日\n\n## 概括\n\n自由交易日当天记忆交易无需登记。";
      await app.get(OfficialAssetsService).createAsset(world.id, {
        type: "rule",
        name: "记忆交易许可",
        summary: asset1Markdown,
        markdown: asset1Markdown,
        tags: [],
      });
      await app.get(OfficialAssetsService).createAsset(world.id, {
        type: "event",
        name: "自由交易日",
        summary: asset2Markdown,
        markdown: asset2Markdown,
        tags: [],
      });
      const issue = await consistencyIssues.createIssueIfOpenDedupeKeyAbsent({
        worldId: world.id,
        title: "记忆交易许可冲突",
        description: "记忆交易许可冲突 描述",
        involves: ["official_asset_1", "official_asset_2"],
        severity: "normal",
        subjectAssetIds: ["official_asset_1", "official_asset_2"],
        evidence: [
          { assetId: "official_asset_1", quote: "所有记忆交易必须登记。", confidence: 1 },
          { assetId: "official_asset_2", quote: "记忆交易无需登记。", confidence: 1 },
        ],
        metadata: { source: "test" },
      }, "memory-trade");
      return { issue, asset1Markdown, asset2Markdown };
    },
    async seedIssue(title: string, dedupeKey: string) {
      return consistencyIssues.createIssueIfOpenDedupeKeyAbsent({
        worldId: world.id,
        title,
        description: `${title} 描述`,
        involves: ["official_asset_1", "official_asset_2"],
        severity: "normal",
        subjectAssetIds: ["official_asset_1", "official_asset_2"],
        evidence: [
          { assetId: "official_asset_1", quote: "所有记忆交易必须登记。", confidence: 1 },
          { assetId: "official_asset_2", quote: "记忆交易无需登记。", confidence: 1 },
        ],
        metadata: { source: "test" },
      }, dedupeKey);
    },
  };
}

type InMemoryOfficialAssets = OfficialAssetsRepository & OfficialAssetPatchesRepository;

function createInMemoryOfficialAssets(): InMemoryOfficialAssets {
  const assets = new Map<string, OfficialAssetRecord>();
  const revisions = new Map<string, OfficialAssetRevisionRecord[]>();
  const indexes = new Map<string, OfficialAssetSectionIndexRecord[]>();
  const patches = new Map<string, OfficialAssetPatchRecord[]>();
  const batches = new Map<string, OfficialAssetPatchBatchRecord>();
  let assetCount = 1;
  let revisionCount = 1;
  let indexCount = 1;
  let patchCount = 1;
  let batchCount = 1;

  return {
    async createPatchBatch(input: CreateOfficialAssetPatchBatchRecordInput) {
      const timestamp = new Date();
      const batch: OfficialAssetPatchBatchRecord = {
        id: `world_asset_patch_batch_${batchCount++}`,
        worldId: input.worldId,
        sessionId: input.sessionId,
        issueId: input.issueId ?? null,
        status: input.status ?? "applying",
        metadata: input.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
        appliedAt: input.status === "applied" ? timestamp : null,
        revertedAt: input.status === "reverted" ? timestamp : null,
      };
      batches.set(batch.id, batch);
      return batch;
    },
    async getPatchBatch(worldId: string, batchId: string) {
      const batch = batches.get(batchId);
      return batch?.worldId === worldId ? batch : null;
    },
    async updatePatchBatchStatus(worldId: string, batchId: string, status: OfficialAssetPatchBatchRecord["status"]) {
      const batch = batches.get(batchId);
      if (!batch || batch.worldId !== worldId) return null;
      const timestamp = new Date();
      const updated: OfficialAssetPatchBatchRecord = {
        ...batch,
        status,
        updatedAt: timestamp,
        appliedAt: status === "applied" ? timestamp : batch.appliedAt,
        revertedAt: status === "reverted" ? timestamp : batch.revertedAt,
      };
      batches.set(batch.id, updated);
      return updated;
    },
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
      assets.set(asset.id, asset);
      revisions.set(asset.id, [revision]);
      indexes.set(asset.id, []);
      patches.set(asset.id, []);
      return { asset, revisions: [revision], indexes: [] };
    },
    async updateAsset(
      worldId: string,
      assetId: string,
      input: UpdateOfficialAssetRecordInput,
    ): Promise<OfficialAssetDetailRecord | null> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      const updated: OfficialAssetRecord = {
        ...asset,
        ...input,
        updatedAt: new Date(),
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
        .filter((asset) => !query.type || asset.type === query.type);
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
      const existingRevisions = revisions.get(asset.id) ?? [];
      if (
        asset.version !== input.expectedVersion ||
        (existingRevisions[0]?.id ?? null) !== input.expectedBeforeRevisionId
      ) {
        throw new OfficialAssetPatchConflictError();
      }

      const timestamp = new Date();
      const versionTo = input.expectedVersion + 1;
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
        batchId: input.batchId ?? null,
        beforeRevisionId: input.expectedBeforeRevisionId,
        afterRevisionId: revision.id,
        beforeMarkdown: input.beforeMarkdown,
        afterMarkdown: input.afterMarkdown,
        diff: input.diff,
        assetVersionFrom: input.expectedVersion,
        assetVersionTo: versionTo,
        status: "applied",
        metadata: { ...(input.metadata ?? {}), sessionId: input.sessionId },
        createdAt: timestamp,
        updatedAt: timestamp,
        appliedAt: timestamp,
        revertedAt: null,
      };

      assets.set(asset.id, {
        ...asset,
        summary: input.summary,
        version: versionTo,
        updatedAt: timestamp,
      });
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
    async listPatchesByBatch(worldId: string, batchId: string): Promise<OfficialAssetPatchRecord[]> {
      return [...patches.values()]
        .flat()
        .filter((patch) => patch.worldId === worldId && patch.batchId === batchId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
    },
    async getPatch(worldId: string, assetId: string, patchId: string): Promise<OfficialAssetPatchRecord | null> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      return (patches.get(assetId) ?? []).find((patch) => patch.id === patchId) ?? null;
    },
    async revertPatch(input: RevertOfficialAssetPatchRecordInput): Promise<OfficialAssetPatchRecord | null> {
      const asset = assets.get(input.assetId);
      if (!asset || asset.worldId !== input.worldId) return null;
      const patchList = patches.get(asset.id) ?? [];
      const patchIndex = patchList.findIndex((patch) => patch.id === input.patchId);
      if (patchIndex === -1) return null;
      const patch = patchList[patchIndex];
      if (patch.status !== "applied") throw new OfficialAssetPatchAlreadyRevertedError();
      const existingRevisions = revisions.get(asset.id) ?? [];
      if (
        asset.version !== input.expectedVersion ||
        (existingRevisions[0]?.id ?? null) !== input.expectedLatestRevisionId ||
        asset.version !== patch.assetVersionTo ||
        (existingRevisions[0]?.id ?? null) !== patch.afterRevisionId
      ) {
        throw new OfficialAssetPatchConflictError();
      }

      const timestamp = new Date();
      const versionTo = input.expectedVersion + 1;
      const revision: OfficialAssetRevisionRecord = {
        id: `official_asset_revision_${revisionCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        version: versionTo,
        markdown: input.markdown,
        summary: input.summary,
        metadata: input.metadata ?? {},
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
      const reverted: OfficialAssetPatchRecord = {
        ...patch,
        status: "reverted",
        updatedAt: timestamp,
        revertedAt: timestamp,
      };
      patchList[patchIndex] = reverted;
      assets.set(asset.id, {
        ...asset,
        summary: input.summary,
        version: versionTo,
        updatedAt: timestamp,
      });
      revisions.set(asset.id, [revision, ...existingRevisions]);
      indexes.set(asset.id, sectionIndexes);
      patches.set(asset.id, patchList);
      return reverted;
    },
  };
}

function createInMemoryConsistencyIssues(): ConsistencyRepository {
  const issues = new Map<string, ConsistencyIssueRecord>();
  let issueCount = 1;

  return {
    async createIssueIfOpenDedupeKeyAbsent(input: CreateConsistencyIssueRecordInput, dedupeKey: string) {
      const existing = findOpenByDedupeKey(worldIssues(input.worldId), dedupeKey);
      if (existing) return existing;
      const timestamp = new Date();
      const issue: ConsistencyIssueRecord = {
        id: `consistency_issue_${issueCount++}`,
        worldId: input.worldId,
        title: input.title,
        description: input.description,
        involves: input.involves,
        severity: input.severity,
        status: "open",
        subjectAssetIds: [...input.subjectAssetIds],
        evidence: [...input.evidence],
        metadata: { ...(input.metadata ?? {}), dedupeKey },
        createdAt: timestamp,
        updatedAt: timestamp,
        resolvedAt: null,
      };
      issues.set(issue.id, issue);
      return issue;
    },
    async listIssues(worldId: string, query: ListConsistencyIssuesQuery = {}) {
      const cursor = query.cursor ? decodeConsistencyIssueListCursor(query.cursor) : null;
      const limit = normalizeConsistencyIssueListLimit(query.limit);
      const filtered = worldIssues(worldId)
        .filter((issue) => !query.status || issue.status === query.status);
      if (query.cursor && !cursor) throw new InvalidConsistencyIssueListCursorError("Invalid consistency issue cursor.");
      const cursorFiltered = filtered.filter((issue) => !cursor || isAfterCursor(issue, cursor));
      const page = cursorFiltered.slice(0, limit);
      return {
        issues: page,
        nextCursor: cursorFiltered.length > limit ? encodeConsistencyIssueListCursor(page[page.length - 1]) : null,
      };
    },
    async getIssue(worldId: string, issueId: string) {
      const issue = issues.get(issueId);
      return issue?.worldId === worldId ? issue : null;
    },
    async updateIssueStatus(worldId: string, issueId: string, status: ConsistencyIssueStatus) {
      const issue = issues.get(issueId);
      if (!issue || issue.worldId !== worldId) return null;
      const resolvedAt = status === "open" || status === "repairing" ? null : new Date();
      const updated: ConsistencyIssueRecord = {
        ...issue,
        status,
        resolvedAt,
        updatedAt: new Date(),
      };
      issues.set(issue.id, updated);
      return updated;
    },
  };

  function worldIssues(worldId: string) {
    return [...issues.values()]
      .filter((issue) => issue.worldId === worldId)
      .sort(compareCreatedDesc);
  }
}

function findOpenByDedupeKey(issues: ConsistencyIssueRecord[], dedupeKey: string) {
  return issues.find((issue) => issue.status === "open" && issue.metadata.dedupeKey === dedupeKey) ?? null;
}

function isAfterCursor(issue: ConsistencyIssueRecord, cursor: { createdAt: Date; id: string }) {
  return issue.createdAt.getTime() < cursor.createdAt.getTime() ||
    (issue.createdAt.getTime() === cursor.createdAt.getTime() && issue.id > cursor.id);
}

function compareCreatedDesc(left: ConsistencyIssueRecord, right: ConsistencyIssueRecord) {
  return right.createdAt.getTime() - left.createdAt.getTime() || left.id.localeCompare(right.id);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
