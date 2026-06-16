import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type INestApplication } from "@nestjs/common";
import { type ConsistencyIssueStatus } from "@worlddock/contract/consistency";
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
import { OfficialAssetLockService } from "../src/modules/official-assets/official-asset-lock.service";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
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
  const app = await createHttpTestApp({
    controllers: [ConsistencyController],
    providers: [
      ConsistencyService,
      ConsistencyChecker,
      OfficialAssetsService,
      OfficialAssetLockService,
      LocalStorageService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: createInMemoryOfficialAssets() },
      { provide: CONSISTENCY_REPOSITORY, useValue: consistencyIssues },
    ],
  });

  return {
    app,
    world,
    consistencyIssues,
    async createOfficialAssetWithMarkdown(type: "rule" | "event", name: string, markdown: string) {
      await app.get(OfficialAssetsService).createAsset(world.id, {
        type,
        name,
        summary: markdown,
        markdown,
        tags: [],
      });
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

function createInMemoryOfficialAssets(): OfficialAssetsRepository {
  const assets = new Map<string, OfficialAssetRecord>();
  const revisions = new Map<string, OfficialAssetRevisionRecord[]>();
  const indexes = new Map<string, OfficialAssetSectionIndexRecord[]>();
  let assetCount = 1;
  let revisionCount = 1;

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
      assets.set(asset.id, asset);
      revisions.set(asset.id, [revision]);
      indexes.set(asset.id, []);
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
