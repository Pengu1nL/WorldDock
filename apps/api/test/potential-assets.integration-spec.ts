import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSessionsController } from "../src/modules/agent-sessions/agent-sessions.controller";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
import { AgentController } from "../src/modules/agent/agent.controller";
import { AGENT_PROVIDER, type AgentProvider } from "../src/modules/agent/agent.provider";
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
});

async function createAndStreamSessionRunWithText(textChunks: string[]) {
  const provider = createMockStreamingAgentProvider(textChunks.map((text) => ({ type: "delta", text })));
  const worlds = createInMemoryWorlds();
  const agents = createInMemoryAgents();
  const sessions = createInMemoryAgentSessions();
  const potentialAssets = createInMemoryPotentialAssets();
  const world = await worlds.createWorld({
    name: "回忆所",
    type: "近未来",
    summary: "记忆可以被买卖。",
    tags: ["记忆"],
    mode: "local",
    maturity: 20,
  });
  const session = await sessions.createSession({
    worldId: world.id,
    kind: "world_exploration",
    title: "记忆交易推演",
    status: "active",
    current: true,
    metadata: {},
  });
  const testApp = await createPotentialAssetApp(worlds, agents, sessions, potentialAssets, provider);

  const created = await request(testApp.getHttpServer())
    .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
    .send({ prompt: "继续推演记忆交易" })
    .expect(201);

  const streamed = await request(testApp.getHttpServer())
    .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
    .set("accept", "text/event-stream")
    .expect(200);

  return {
    app: testApp,
    world,
    sessionId: session.id,
    runId: created.body.run.id,
    events: parseSseMessages(streamed.text),
  };
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
