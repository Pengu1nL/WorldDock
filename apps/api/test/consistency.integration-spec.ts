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
  type ConsistencyIssueRecord,
  type ConsistencyRepository,
  type CreateConsistencyIssueRecordInput,
  type ListConsistencyIssuesQuery,
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
    const worlds = createInMemoryWorlds();
    const world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "local",
      maturity: 12,
    });
    app = await createConsistencyApp(worlds);

    await createOfficialAssetWithMarkdown("rule", "记忆交易许可", "所有记忆交易必须登记。");
    await createOfficialAssetWithMarkdown("event", "自由交易日", "自由交易日当天记忆交易无需登记。");

    const checked = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/consistency-issues/check`)
      .expect(201);

    expect(checked.body.issues).toHaveLength(1);
    expect(checked.body.issues[0]).toMatchObject({
      worldId: world.id,
      status: "open",
      severity: "normal",
    });

    const listed = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/consistency-issues`)
      .expect(200);

    expect(listed.body.issues).toHaveLength(1);

    async function createOfficialAssetWithMarkdown(type: "rule" | "event", name: string, markdown: string) {
      await app?.get(OfficialAssetsService).createAsset(world.id, {
        type,
        name,
        summary: markdown,
        markdown,
        tags: [],
      });
    }
  });
});

async function createConsistencyApp(worlds: InMemoryWorlds) {
  return createHttpTestApp({
    controllers: [ConsistencyController],
    providers: [
      ConsistencyService,
      ConsistencyChecker,
      OfficialAssetsService,
      OfficialAssetLockService,
      LocalStorageService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: createInMemoryOfficialAssets() },
      { provide: CONSISTENCY_REPOSITORY, useValue: createInMemoryConsistencyIssues() },
    ],
  });
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
    async createIssue(input: CreateConsistencyIssueRecordInput) {
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
        metadata: input.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
        resolvedAt: null,
      };
      issues.set(issue.id, issue);
      return issue;
    },
    async findOpenIssueByDedupeKey(worldId: string, dedupeKey: string) {
      return [...issues.values()].find((issue) =>
        issue.worldId === worldId &&
        issue.status === "open" &&
        issue.metadata.dedupeKey === dedupeKey,
      ) ?? null;
    },
    async listIssues(worldId: string, query: ListConsistencyIssuesQuery = {}) {
      const filtered = [...issues.values()]
        .filter((issue) => issue.worldId === worldId)
        .filter((issue) => !query.status || issue.status === query.status);
      return { issues: filtered, nextCursor: null };
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
}
