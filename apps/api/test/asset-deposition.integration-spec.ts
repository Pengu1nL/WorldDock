import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentController } from "../src/modules/agent/agent.controller";
import { AGENT_PROVIDER, type AgentProvider } from "../src/modules/agent/agent.provider";
import { AGENT_REPOSITORY } from "../src/modules/agent/agent.repository";
import { AgentService } from "../src/modules/agent/agent.service";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { LocalStorageService } from "../src/modules/local-storage/local-storage.service";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  type CreateOfficialAssetRecordInput,
  type ListOfficialAssetsQuery,
  type OfficialAssetDetailRecord,
  type OfficialAssetRecord,
  type OfficialAssetRevisionRecord,
  type OfficialAssetSectionIndexRecord,
  type OfficialAssetsRepository,
  type UpdateOfficialAssetRecordInput,
} from "../src/modules/official-assets/official-assets.repository";
import { OfficialAssetLockService } from "../src/modules/official-assets/official-asset-lock.service";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
import { PotentialAssetsAnalyzer } from "../src/modules/potential-assets/potential-assets.analyzer";
import { PotentialAssetsController } from "../src/modules/potential-assets/potential-assets.controller";
import { POTENTIAL_ASSETS_REPOSITORY } from "../src/modules/potential-assets/potential-assets.repository";
import { PotentialAssetsService } from "../src/modules/potential-assets/potential-assets.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import {
  createHttpTestApp,
  createInMemoryAgentSessions,
  createInMemoryAgents,
  createInMemoryPotentialAssets,
  createInMemoryWorlds,
  type InMemoryAgentSessions,
  type InMemoryAgents,
  type InMemoryPotentialAssets,
  type InMemoryWorlds,
} from "./local-api-test-helpers";

type InMemoryOfficialAssets = OfficialAssetsRepository & {
  stores: {
    assets: Map<string, OfficialAssetRecord>;
    revisions: Map<string, OfficialAssetRevisionRecord[]>;
    indexes: Map<string, OfficialAssetSectionIndexRecord[]>;
  };
};

describe("asset deposition local endpoints", () => {
  let app: INestApplication | undefined;
  let dataDir: string;
  let previousDataDir: string | undefined;

  beforeEach(async () => {
    previousDataDir = process.env.WORLD_DOCK_DATA_DIR;
    dataDir = await mkdtemp(join(tmpdir(), "worlddock-asset-deposition-"));
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

  it("promotes a potential asset into an official asset through controlled deposition", async () => {
    const {
      worlds,
      agents,
      sessions,
      potentialAssets,
      world,
      explorationSession,
      explorationRun,
      potentialAsset,
    } = await createPromotionFixture();
    app = await createAssetDepositionApp(worlds, agents, sessions, potentialAssets);
    const overrideMarkdown = "# 记忆交易登记令\n\n## 概括\n\n登记后的记忆交易规则摘要。\n\n## 正文\n\n这段正文只应存入正式资产 markdown。";

    const promoted = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${potentialAsset.id}/promote`)
      .send({
        name: "记忆交易登记令",
        markdown: overrideMarkdown,
        tags: ["法律", "登记"],
        metadata: { reviewer: "codex" },
      })
      .expect(201);

    expect(promoted.body.asset).toMatchObject({
      id: `official_asset_${potentialAsset.id}`,
      type: "rule",
      name: "记忆交易登记令",
      summary: "登记后的记忆交易规则摘要。",
      tags: ["法律", "登记"],
      version: 1,
      metadata: expect.objectContaining({
        reviewer: "codex",
        sourcePotentialAssetId: potentialAsset.id,
        sourceSessionId: explorationSession.id,
        sourceRunId: explorationRun.id,
      }),
    });
    expect(promoted.body.markdown).toBe(overrideMarkdown);
    expect(promoted.body.depositionRun).not.toHaveProperty("mode");

    const refreshed = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/potential-assets`)
      .query({ status: "promoted" })
      .expect(200);

    expect(refreshed.body.potentialAssets[0]).toMatchObject({
      id: potentialAsset.id,
      status: "promoted",
      promotedAssetId: promoted.body.asset.id,
      metadata: expect.objectContaining({
        detector: "test",
        officialAssetId: promoted.body.asset.id,
        sourcePotentialAssetId: potentialAsset.id,
        depositionRunId: expect.any(String),
      }),
    });

    const depositionRunId = refreshed.body.potentialAssets[0].metadata.depositionRunId;
    const depositionRun = await agents.findRunById(depositionRunId);
    expect(depositionRun).toMatchObject({
      worldId: world.id,
      sessionId: explorationSession.id,
      status: "completed",
    });

    const depositionEvents = await agents.listEvents(depositionRunId);
    expect(depositionEvents.map((event) => event.type)).toEqual([
      "run.started",
      "tool.requested",
      "tool.completed",
      "run.completed",
    ]);
    const requestedEvent = depositionEvents.find((event) => event.type === "tool.requested");
    if (!requestedEvent || requestedEvent.type !== "tool.requested") throw new Error("Expected tool.requested event.");
    const requestedArguments = (requestedEvent.payload as {
      toolCall: { arguments: Record<string, unknown> };
    }).toolCall.arguments;
    expect(requestedArguments).toEqual(expect.objectContaining({
      worldId: world.id,
      potentialAssetId: potentialAsset.id,
      type: "rule",
      name: "记忆交易登记令",
      summary: "所有记忆交易都需要登记。",
      tags: ["法律", "登记"],
      metadataKeys: [
        "reviewer",
        "sourcePotentialAssetId",
        "sourceRunId",
        "sourceSessionId",
      ],
      metadataSourceIds: {
        sourcePotentialAssetId: potentialAsset.id,
        sourceSessionId: explorationSession.id,
        sourceRunId: explorationRun.id,
      },
      markdownProvided: true,
      markdownLength: overrideMarkdown.length,
    }));
    expect(requestedArguments).not.toHaveProperty("markdown");
    expect(depositionEvents[2].payload).toEqual(expect.objectContaining({
      toolCallId: "call_create_world_asset",
      result: expect.objectContaining({
        assetId: promoted.body.asset.id,
        sourcePotentialAssetId: potentialAsset.id,
      }),
    }));
  });

  it("returns 409 on duplicate promotion without creating another official asset or deposition run", async () => {
    const { worlds, agents, sessions, potentialAssets, world, potentialAsset } = await createPromotionFixture();
    const officialAssets = createInMemoryOfficialAssets();
    app = await createAssetDepositionApp(worlds, agents, sessions, potentialAssets, officialAssets);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${potentialAsset.id}/promote`)
      .send({})
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${potentialAsset.id}/promote`)
      .send({})
      .expect(409);

    expect(duplicate.body).toMatchObject({
      code: "POTENTIAL_ASSET_NOT_ACTIVE",
      message: "Potential asset is not active and cannot be promoted.",
    });
    expect(officialAssets.stores.assets.size).toBe(1);
    expect([...officialAssets.stores.assets.keys()]).toEqual([`official_asset_${potentialAsset.id}`]);
    expect(countDepositionRuns(agents)).toBe(1);
  });

  it("returns 409 when a concurrent promotion already created the deterministic official asset", async () => {
    const { worlds, agents, sessions, potentialAssets, world, potentialAsset } = await createPromotionFixture();
    const officialAssets = createInMemoryOfficialAssets();
    seedOfficialAsset(officialAssets, world.id, `official_asset_${potentialAsset.id}`);
    app = await createAssetDepositionApp(worlds, agents, sessions, potentialAssets, officialAssets);

    const duplicate = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${potentialAsset.id}/promote`)
      .send({})
      .expect(409);

    expect(duplicate.body).toMatchObject({
      code: "POTENTIAL_ASSET_NOT_ACTIVE",
      message: "Potential asset is not active and cannot be promoted.",
    });
    expect(officialAssets.stores.assets.size).toBe(1);
    expect([...officialAssets.stores.assets.keys()]).toEqual([`official_asset_${potentialAsset.id}`]);
    expect(countDepositionRuns(agents)).toBe(0);
  });

  it("returns 409 when promoting a dismissed potential asset", async () => {
    const { worlds, agents, sessions, potentialAssets, world, potentialAsset } = await createPromotionFixture();
    const officialAssets = createInMemoryOfficialAssets();
    await potentialAssets.updateStatus(world.id, potentialAsset.id, "dismissed");
    app = await createAssetDepositionApp(worlds, agents, sessions, potentialAssets, officialAssets);

    const dismissed = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${potentialAsset.id}/promote`)
      .send({})
      .expect(409);

    expect(dismissed.body).toMatchObject({
      code: "POTENTIAL_ASSET_NOT_ACTIVE",
      message: "Potential asset is not active and cannot be promoted.",
    });
    expect(officialAssets.stores.assets.size).toBe(0);
    expect(countDepositionRuns(agents)).toBe(0);
  });

  it("returns 404 when promoting a potential asset through another world", async () => {
    const { worlds, agents, sessions, potentialAssets, potentialAsset } = await createPromotionFixture();
    const otherWorld = await createWorld(worlds);
    const officialAssets = createInMemoryOfficialAssets();
    app = await createAssetDepositionApp(worlds, agents, sessions, potentialAssets, officialAssets);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${otherWorld.id}/potential-assets/${potentialAsset.id}/promote`)
      .send({})
      .expect(404);

    expect(officialAssets.stores.assets.size).toBe(0);
    expect(countDepositionRuns(agents)).toBe(0);
  });
});

async function createAssetDepositionApp(
  worlds: InMemoryWorlds,
  agents: InMemoryAgents,
  sessions: InMemoryAgentSessions,
  potentialAssets: InMemoryPotentialAssets,
  officialAssets: InMemoryOfficialAssets = createInMemoryOfficialAssets(),
) {
  const provider: AgentProvider = {
    async *stream() {
      throw new Error("Agent provider should not be called during controlled asset deposition.");
    },
  };

  return createHttpTestApp({
    controllers: [AgentController, PotentialAssetsController],
    providers: [
      AgentService,
      PotentialAssetsAnalyzer,
      PotentialAssetsService,
      OfficialAssetsService,
      OfficialAssetLockService,
      LocalStorageService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_REPOSITORY, useValue: agents },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      { provide: POTENTIAL_ASSETS_REPOSITORY, useValue: potentialAssets },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: officialAssets },
      { provide: AGENT_PROVIDER, useValue: provider },
    ],
  });
}

async function createPromotionFixture() {
  const worlds = createInMemoryWorlds();
  const agents = createInMemoryAgents();
  const sessions = createInMemoryAgentSessions();
  const potentialAssets = createInMemoryPotentialAssets();
  const world = await createWorld(worlds);
  const explorationSession = await sessions.createSession({
    worldId: world.id,
    kind: "world_exploration",
    title: "记忆交易推演",
    status: "active",
    current: true,
    metadata: {},
  });
  const explorationRun = await agents.createRun({
    worldId: world.id,
    sessionId: explorationSession.id,
    mode: "expand",
    prompt: "探索记忆交易制度",
    model: null,
    provider: "pi",
  });
  await agents.updateRun(explorationRun.id, { status: "completed", completedAt: new Date() });
  const createdPotentialAssets = await potentialAssets.createMany([{
    worldId: world.id,
    sessionId: explorationSession.id,
    runId: explorationRun.id,
    type: "rule",
    title: "记忆交易许可",
    summary: "所有记忆交易都需要登记。",
    evidence: [{ quote: "所有记忆交易都需要登记。", confidence: 0.95 }],
    metadata: { detector: "test" },
  }]);
  const potentialAsset = createdPotentialAssets[0];
  if (!potentialAsset) throw new Error("Expected promotion fixture to create a potential asset.");

  return {
    worlds,
    agents,
    sessions,
    potentialAssets,
    world,
    explorationSession,
    explorationRun,
    potentialAsset,
  };
}

async function createWorld(worlds: InMemoryWorlds) {
  return worlds.createWorld({
    name: "回忆所",
    type: "近未来",
    summary: "记忆可以被买卖。",
    tags: ["记忆"],
    mode: "local",
    maturity: 20,
  });
}

function countDepositionRuns(agents: InMemoryAgents) {
  return [...agents.stores.runs.values()]
    .filter((run) => run.prompt.startsWith("Promote potential asset "))
    .length;
}

function seedOfficialAsset(officialAssets: InMemoryOfficialAssets, worldId: string, assetId: string) {
  const timestamp = new Date();
  officialAssets.stores.assets.set(assetId, {
    id: assetId,
    worldId,
    type: "rule",
    name: "已有正式资产",
    summary: "并发请求已创建的正式资产。",
    documentKey: `worlds/${worldId}/official-assets/${assetId}.md`,
    status: "active",
    version: 1,
    tags: [],
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  });
  officialAssets.stores.revisions.set(assetId, []);
  officialAssets.stores.indexes.set(assetId, []);
}

function createInMemoryOfficialAssets(): InMemoryOfficialAssets {
  const assets = new Map<string, OfficialAssetRecord>();
  const revisions = new Map<string, OfficialAssetRevisionRecord[]>();
  const indexes = new Map<string, OfficialAssetSectionIndexRecord[]>();
  let revisionCount = 1;
  let indexCount = 1;

  return {
    stores: { assets, revisions, indexes },
    async createAsset(input: CreateOfficialAssetRecordInput) {
      if (assets.has(input.id)) {
        const error = new Error(`Duplicate official asset id: ${input.id}`) as Error & { code: string };
        error.code = "P2002";
        throw error;
      }
      const timestamp = new Date();
      const asset: OfficialAssetRecord = {
        id: input.id,
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
      const updated: OfficialAssetRecord = {
        ...asset,
        name: input.name ?? asset.name,
        summary: input.summary ?? asset.summary,
        tags: input.tags ?? asset.tags,
        metadata: input.metadata ?? asset.metadata,
        status: input.status ?? asset.status,
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
      return {
        assets: [...assets.values()]
          .filter((asset) => asset.worldId === worldId)
          .filter((asset) => !query.type || asset.type === query.type),
        nextCursor: null,
      };
    },
    async getAsset(worldId: string, assetId: string) {
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
