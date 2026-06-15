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
    const [potentialAsset] = await potentialAssets.createMany([{
      worldId: world.id,
      sessionId: explorationSession.id,
      runId: explorationRun.id,
      type: "rule",
      title: "记忆交易许可",
      summary: "所有记忆交易都需要登记。",
      evidence: [{ quote: "所有记忆交易都需要登记。", confidence: 0.95 }],
      metadata: { detector: "test" },
    }]);
    app = await createAssetDepositionApp(worlds, agents, sessions, potentialAssets);

    const promoted = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${potentialAsset.id}/promote`)
      .send({
        name: "记忆交易许可",
        metadata: { reviewer: "codex" },
      })
      .expect(201);

    expect(promoted.body.asset).toMatchObject({
      type: "rule",
      name: "记忆交易许可",
      version: 1,
      metadata: expect.objectContaining({
        reviewer: "codex",
        sourcePotentialAssetId: potentialAsset.id,
        sourceSessionId: explorationSession.id,
        sourceRunId: explorationRun.id,
      }),
    });
    expect(promoted.body.markdown).toContain("所有记忆交易都需要登记");

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
    expect(depositionEvents[2].payload).toEqual(expect.objectContaining({
      toolCallId: "call_create_world_asset",
      result: expect.objectContaining({
        assetId: promoted.body.asset.id,
        sourcePotentialAssetId: potentialAsset.id,
      }),
    }));
  });
});

async function createAssetDepositionApp(
  worlds: InMemoryWorlds,
  agents: InMemoryAgents,
  sessions: InMemoryAgentSessions,
  potentialAssets: InMemoryPotentialAssets,
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
      LocalStorageService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_REPOSITORY, useValue: agents },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      { provide: POTENTIAL_ASSETS_REPOSITORY, useValue: potentialAssets },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: createInMemoryOfficialAssets() },
      { provide: AGENT_PROVIDER, useValue: provider },
    ],
  });
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

function createInMemoryOfficialAssets(): OfficialAssetsRepository {
  const assets = new Map<string, OfficialAssetRecord>();
  const revisions = new Map<string, OfficialAssetRevisionRecord[]>();
  const indexes = new Map<string, OfficialAssetSectionIndexRecord[]>();
  let revisionCount = 1;
  let indexCount = 1;

  return {
    async createAsset(input: CreateOfficialAssetRecordInput) {
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
