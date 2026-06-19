import { type INestApplication } from "@nestjs/common";
import {
  potentialAssetDetailResponseSchema,
  potentialAssetListResponseSchema,
} from "@worlddock/contract/potential-assets";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSessionsController } from "../src/modules/agent-sessions/agent-sessions.controller";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
import { AgentController } from "../src/modules/agent/agent.controller";
import { AGENT_PROVIDER, type AgentProvider, type AgentProviderChunk } from "../src/modules/agent/agent.provider";
import { AGENT_REPOSITORY } from "../src/modules/agent/agent.repository";
import { AgentService } from "../src/modules/agent/agent.service";
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
  createMockStreamingAgentProvider,
  parseSseMessages,
  type InMemoryAgentSessions,
  type InMemoryAgents,
  type InMemoryPotentialAssets,
  type InMemoryWorlds,
} from "./local-api-test-helpers";

describe("potential assets local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("persists potential assets after a completed session run", async () => {
    const created = await createAndStreamSessionRunWithText([
      "### 记忆交易许可\n这是一条世界规则，所有记忆交易都需要登记。",
    ]);
    app = created.app;

    const listed = await request(app.getHttpServer())
      .get(`/v1/worlds/${created.world.id}/agent-sessions/${created.sessionId}/potential-assets`)
      .expect(200);

    expect(listed.body.potentialAssets).toEqual([
      expect.objectContaining({
        id: "potential_asset_1",
        worldId: created.world.id,
        sessionId: created.sessionId,
        runId: created.runId,
        type: "rule",
        title: "记忆交易许可",
        summary: "这是一条世界规则，所有记忆交易都需要登记。",
        status: "active",
        promotedAssetId: null,
        metadata: {},
      }),
    ]);
    expect(listed.body.nextCursor).toBeNull();

    const detected = created.events.find((event) => event.type === "potential_asset.detected");
    expect(detected?.data.payload).toEqual(expect.objectContaining({
      potentialAssetId: "potential_asset_1",
      potentialAsset: expect.objectContaining({
        id: "potential_asset_1",
        title: "记忆交易许可",
        type: "rule",
      }),
    }));
    expect(created.events.map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "potential_asset.detected",
      "run.completed",
    ]);
  });

  it("lists potential assets by world, session, and run, and dismisses them", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const potentialAssets = createInMemoryPotentialAssets();
    const provider = createSequenceAgentProvider([
      [
        { type: "delta", text: "### 镜港\n镜港是一座会记录梦境的城市。" },
      ],
      [
        { type: "delta", text: "### 梦税局\n梦税局负责征收梦境交易税。" },
      ],
    ]);
    const world = await createWorld(worlds);
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "镜港推演",
      status: "active",
      current: true,
      metadata: {},
    });
    const testApp = await createPotentialAssetApp(worlds, agents, sessions, potentialAssets, provider);
    app = testApp;

    const firstRun = await createAndStreamExistingSessionRun(testApp, world.id, session.id);
    const secondRun = await createAndStreamExistingSessionRun(testApp, world.id, session.id);

    const firstRunListed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-runs/${firstRun.runId}/potential-assets`)
      .expect(200);
    const firstRunBody = potentialAssetListResponseSchema.parse(firstRunListed.body);

    expect(firstRunBody.nextCursor).toBeNull();
    expect(firstRunBody.potentialAssets.map((asset) => asset.title)).toEqual(["镜港"]);
    expect(firstRunBody.potentialAssets[0]).toEqual(expect.objectContaining({
      runId: firstRun.runId,
      type: "location",
      status: "active",
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    }));

    const secondRunListed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-runs/${secondRun.runId}/potential-assets`)
      .expect(200);
    const secondRunBody = potentialAssetListResponseSchema.parse(secondRunListed.body);

    expect(secondRunBody.potentialAssets.map((asset) => asset.title)).toEqual(["梦税局"]);
    expect(secondRunBody.potentialAssets[0]?.runId).toBe(secondRun.runId);

    const dismissed = await request(testApp.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${firstRunBody.potentialAssets[0].id}/dismiss`)
      .expect(200);
    const dismissedBody = potentialAssetDetailResponseSchema.parse(dismissed.body);

    expect(dismissedBody.potentialAsset).toEqual(expect.objectContaining({
      id: firstRunBody.potentialAssets[0].id,
      status: "dismissed",
    }));

    const sessionListed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${session.id}/potential-assets`)
      .expect(200);
    const sessionBody = potentialAssetListResponseSchema.parse(sessionListed.body);

    expect(sessionBody.nextCursor).toBeNull();
    expect(sessionBody.potentialAssets.map((asset) => ({
      title: asset.title,
      status: asset.status,
    }))).toEqual([
      { title: "镜港", status: "dismissed" },
      { title: "梦税局", status: "active" },
    ]);

    const worldDefaultListed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/potential-assets`)
      .expect(200);
    const worldDefaultBody = potentialAssetListResponseSchema.parse(worldDefaultListed.body);

    expect(worldDefaultBody.potentialAssets.map((asset) => asset.title)).toEqual(["梦税局"]);
    expect(worldDefaultBody.potentialAssets.every((asset) => asset.status === "active")).toBe(true);

    const worldDismissedListed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/potential-assets`)
      .query({ status: "dismissed" })
      .expect(200);
    const worldDismissedBody = potentialAssetListResponseSchema.parse(worldDismissedListed.body);

    expect(worldDismissedBody.potentialAssets.map((asset) => asset.title)).toEqual(["镜港"]);
    expect(worldDismissedBody.potentialAssets.every((asset) => asset.status === "dismissed")).toBe(true);
  });

  it.each([
    ["invalid status", { status: "deleted" }],
    ["invalid type", { type: "artifact" }],
    ["invalid cursor", { cursor: "not-a-valid-cursor" }],
    ["zero limit", { limit: "0" }],
    ["non-numeric limit", { limit: "abc" }],
  ])("rejects %s in world potential asset query", async (_label, query) => {
    const created = await createAndStreamSessionRunWithText([
      "### 记忆交易许可\n这是一条世界规则，所有记忆交易都需要登记。",
    ]);
    app = created.app;

    await request(app.getHttpServer())
      .get(`/v1/worlds/${created.world.id}/potential-assets`)
      .query(query)
      .expect(400);
  });

  it("paginates world potential assets without repeating records", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const potentialAssets = createInMemoryPotentialAssets();
    const provider = createSequenceAgentProvider([
      [
        { type: "delta", text: "### 镜港\n镜港是一座会记录梦境的城市。" },
      ],
      [
        { type: "delta", text: "### 梦税局\n梦税局负责征收梦境交易税。" },
      ],
      [
        { type: "delta", text: "### 旧梦节\n旧梦节是每年交换回忆的事件。" },
      ],
    ]);
    const world = await createWorld(worlds);
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "镜港推演",
      status: "active",
      current: true,
      metadata: {},
    });
    const testApp = await createPotentialAssetApp(worlds, agents, sessions, potentialAssets, provider);
    app = testApp;

    await createAndStreamExistingSessionRun(testApp, world.id, session.id);
    await createAndStreamExistingSessionRun(testApp, world.id, session.id);
    await createAndStreamExistingSessionRun(testApp, world.id, session.id);

    const firstPageListed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/potential-assets`)
      .query({ limit: 1 })
      .expect(200);
    const firstPage = potentialAssetListResponseSchema.parse(firstPageListed.body);

    expect(firstPage.potentialAssets).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPageListed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/potential-assets`)
      .query({ limit: 1, cursor: firstPage.nextCursor })
      .expect(200);
    const secondPage = potentialAssetListResponseSchema.parse(secondPageListed.body);

    expect(secondPage.potentialAssets).toHaveLength(1);
    expect(secondPage.potentialAssets[0].id).not.toBe(firstPage.potentialAssets[0].id);
  });

  it("handles dismiss idempotency, cross-world isolation, and missing assets", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const potentialAssets = createInMemoryPotentialAssets();
    const provider = createSequenceAgentProvider([
      [
        { type: "delta", text: "### 镜港\n镜港是一座会记录梦境的城市。" },
      ],
    ]);
    const world = await createWorld(worlds);
    const otherWorld = await createWorld(worlds);
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "镜港推演",
      status: "active",
      current: true,
      metadata: {},
    });
    const testApp = await createPotentialAssetApp(worlds, agents, sessions, potentialAssets, provider);
    app = testApp;

    await createAndStreamExistingSessionRun(testApp, world.id, session.id);
    const listed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${session.id}/potential-assets`)
      .expect(200);
    const assetId = potentialAssetListResponseSchema.parse(listed.body).potentialAssets[0].id;

    const firstDismissed = await request(testApp.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${assetId}/dismiss`)
      .expect(200);
    expect(potentialAssetDetailResponseSchema.parse(firstDismissed.body).potentialAsset.status).toBe("dismissed");

    const secondDismissed = await request(testApp.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${assetId}/dismiss`)
      .expect(200);
    expect(potentialAssetDetailResponseSchema.parse(secondDismissed.body).potentialAsset.status).toBe("dismissed");

    const activeAsset = (await potentialAssets.createMany([{
      worldId: world.id,
      sessionId: session.id,
      runId: null,
      type: "rule",
      title: "梦境登记",
      summary: "新的梦境交易必须登记。",
      evidence: [{ quote: "新的梦境交易必须登记。", confidence: 0.9 }],
    }]))[0];

    await request(testApp.getHttpServer())
      .post(`/v1/worlds/${otherWorld.id}/potential-assets/${activeAsset.id}/dismiss`)
      .expect(404);

    const afterCrossWorldAttempt = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${session.id}/potential-assets`)
      .expect(200);
    const activeAfterCrossWorldAttempt = potentialAssetListResponseSchema
      .parse(afterCrossWorldAttempt.body)
      .potentialAssets.find((asset) => asset.id === activeAsset.id);

    expect(activeAfterCrossWorldAttempt?.status).toBe("active");

    const promotedAsset = (await potentialAssets.createMany([{
      worldId: world.id,
      sessionId: session.id,
      runId: null,
      type: "rule",
      title: "梦境赎回许可",
      summary: "梦境赎回必须持有许可。",
      evidence: [{ quote: "梦境赎回必须持有许可。", confidence: 0.9 }],
    }]))[0];
    await potentialAssets.markPromoted(world.id, promotedAsset.id, "official_asset_1");

    const lateDismiss = await request(testApp.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/${promotedAsset.id}/dismiss`)
      .expect(409);

    expect(lateDismiss.body).toMatchObject({
      code: "POTENTIAL_ASSET_NOT_ACTIVE",
      message: "Potential asset is promoted and cannot be dismissed.",
    });
    expect((await potentialAssets.findById(world.id, promotedAsset.id))?.status).toBe("promoted");

    await request(testApp.getHttpServer())
      .post(`/v1/worlds/${world.id}/potential-assets/potential_asset_missing/dismiss`)
      .expect(404);
  });

  it("returns 404 for missing worlds and runs in list endpoints", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const potentialAssets = createInMemoryPotentialAssets();
    const provider = createSequenceAgentProvider([
      [
        { type: "delta", text: "### 镜港\n镜港是一座会记录梦境的城市。" },
      ],
    ]);
    const world = await createWorld(worlds);
    const otherWorld = await createWorld(worlds);
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "镜港推演",
      status: "active",
      current: true,
      metadata: {},
    });
    const testApp = await createPotentialAssetApp(worlds, agents, sessions, potentialAssets, provider);
    app = testApp;

    const run = await createAndStreamExistingSessionRun(testApp, world.id, session.id);

    await request(testApp.getHttpServer())
      .get("/v1/worlds/world_missing/potential-assets")
      .expect(404);

    await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-runs/run_missing/potential-assets`)
      .expect(404);

    await request(testApp.getHttpServer())
      .get(`/v1/worlds/${otherWorld.id}/agent-runs/${run.runId}/potential-assets`)
      .expect(404);
  });

  it("deduplicates active potential assets within the same session", async () => {
    const created = await createAndStreamSessionRunWithText([
      "### 记忆交易许可\n这是一条世界规则，所有记忆交易都需要登记。",
      "\n### 记忆交易许可\n重复的世界规则不应在同一轮里重复入库。",
    ]);
    app = created.app;

    const listed = await request(app.getHttpServer())
      .get(`/v1/worlds/${created.world.id}/agent-sessions/${created.sessionId}/potential-assets`)
      .expect(200);

    expect(listed.body.potentialAssets).toHaveLength(1);
    expect(listed.body.potentialAssets[0]).toEqual(expect.objectContaining({
      id: "potential_asset_1",
      title: "记忆交易许可",
      type: "rule",
    }));
    expect(created.events.filter((event) => event.type === "potential_asset.detected")).toHaveLength(1);
  });

  it("still completes the run when potential asset persistence fails", async () => {
    const potentialAssets = createInMemoryPotentialAssets();
    potentialAssets.createMany = async () => {
      throw new Error("potential asset store unavailable");
    };
    const created = await createAndStreamSessionRunWithText([
      "### 记忆交易许可\n这是一条世界规则，所有记忆交易都需要登记。",
    ], { potentialAssets });
    app = created.app;

    expect(created.events.map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "run.completed",
    ]);
    expect(await created.agents.findRunById(created.runId)).toEqual(expect.objectContaining({
      status: "completed",
    }));
  });

  it("does not extract potential assets from failed assistant messages on later completed runs", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const potentialAssets = createInMemoryPotentialAssets();
    const provider = createSequenceAgentProvider([
      [
        { type: "delta", text: "### 失败记忆许可\n这条失败输出不应被落库。" },
        { type: "failed", code: "PROVIDER_FAILED", message: "provider failed" },
      ],
      [
        { type: "delta", text: "### 完成记忆许可\n这条完成输出应被落库。" },
      ],
    ]);
    const world = await createWorld(worlds);
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "记忆交易推演",
      status: "active",
      current: true,
      metadata: {},
    });
    const testApp = await createPotentialAssetApp(worlds, agents, sessions, potentialAssets, provider);
    app = testApp;

    await createAndStreamExistingSessionRun(testApp, world.id, session.id);
    const completed = await createAndStreamExistingSessionRun(testApp, world.id, session.id);

    expect(completed.events.map((event) => event.type)).toContain("potential_asset.detected");
    const listed = await request(testApp.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${session.id}/potential-assets`)
      .expect(200);

    expect(listed.body.potentialAssets.map((asset: any) => asset.title)).toEqual(["完成记忆许可"]);
  });

  it.each([
    ["asset_edit" as const, { subjectAssetId: "archive_1" }],
    ["consistency_repair" as const, { issueId: "issue_1" }],
  ])("does not create potential assets for %s sessions", async (kind, metadata) => {
    const created = await createAndStreamSessionRunWithText([
      "### 记忆交易许可\n这是一条世界规则，所有记忆交易都需要登记。",
    ], { sessionKind: kind, sessionMetadata: metadata });
    app = created.app;

    expect(created.events.map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "run.completed",
    ]);

    const listed = await request(app.getHttpServer())
      .get(`/v1/worlds/${created.world.id}/agent-sessions/${created.sessionId}/potential-assets`)
      .expect(200);

    expect(listed.body.potentialAssets).toEqual([]);
  });
});

async function createAndStreamSessionRunWithText(
  textChunks: string[],
  options: {
    potentialAssets?: InMemoryPotentialAssets;
    sessionKind?: "world_exploration" | "asset_edit" | "consistency_repair";
    sessionMetadata?: Record<string, unknown>;
  } = {},
) {
  const provider = createMockStreamingAgentProvider(textChunks.map((text) => ({ type: "delta", text })));
  const worlds = createInMemoryWorlds();
  const agents = createInMemoryAgents();
  const sessions = createInMemoryAgentSessions();
  const potentialAssets = options.potentialAssets ?? createInMemoryPotentialAssets();
  const world = await createWorld(worlds);
  const session = await sessions.createSession({
    worldId: world.id,
    kind: options.sessionKind ?? "world_exploration",
    title: "记忆交易推演",
    status: "active",
    current: true,
    metadata: options.sessionMetadata ?? {},
  });
  const testApp = await createPotentialAssetApp(worlds, agents, sessions, potentialAssets, provider);

  const streamed = await createAndStreamExistingSessionRun(testApp, world.id, session.id);

  return {
    app: testApp,
    agents,
    world,
    sessionId: session.id,
    runId: streamed.runId,
    events: streamed.events,
  };
}

async function createAndStreamExistingSessionRun(testApp: INestApplication, worldId: string, sessionId: string) {
  const created = await request(testApp.getHttpServer())
    .post(`/v1/worlds/${worldId}/agent-sessions/${sessionId}/runs`)
    .send({ prompt: "继续推演记忆交易" })
    .expect(201);

  const streamed = await request(testApp.getHttpServer())
    .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
    .set("accept", "text/event-stream")
    .expect(200);

  return {
    runId: created.body.run.id,
    events: parseSseMessages(streamed.text),
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

function createSequenceAgentProvider(chunksByCall: AgentProviderChunk[][]) {
  let callIndex = 0;
  const provider: AgentProvider = {
    async *stream() {
      const chunks = chunksByCall[callIndex++] ?? [];
      for (const chunk of chunks) yield chunk;
    },
  };
  return provider;
}

async function createPotentialAssetApp(
  worlds: InMemoryWorlds,
  agents: InMemoryAgents,
  sessions: InMemoryAgentSessions,
  potentialAssets: InMemoryPotentialAssets,
  provider: AgentProvider,
) {
  return createHttpTestApp({
    controllers: [AgentController, AgentSessionsController, PotentialAssetsController],
    providers: [
      AgentService,
      AgentSessionsService,
      PotentialAssetsAnalyzer,
      PotentialAssetsService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_REPOSITORY, useValue: agents },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      { provide: POTENTIAL_ASSETS_REPOSITORY, useValue: potentialAssets },
      { provide: AGENT_PROVIDER, useValue: provider },
    ],
  });
}
