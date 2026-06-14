import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AgentController } from "../src/modules/agent/agent.controller";
import { AGENT_PROVIDER } from "../src/modules/agent/agent.provider";
import { AGENT_REPOSITORY } from "../src/modules/agent/agent.repository";
import { AgentService } from "../src/modules/agent/agent.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import {
  createHttpTestApp,
  createInMemoryAgents,
  createInMemoryWorlds,
  createMockStreamingAgentProvider,
  type InMemoryAgents,
  type InMemoryWorlds,
} from "./local-api-test-helpers";

describe("agent local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates a local run and streams provider events to completion", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const provider = createMockStreamingAgentProvider();
    const world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "local",
      maturity: 20,
    });
    await worlds.createArchiveEntry({
      worldId: world.id,
      title: "记忆交易法",
      category: "世界规则",
      summary: "记忆交易需要登记。",
      body: "许可制度决定谁能合法买卖记忆。",
      relations: [],
      position: 0,
    });
    app = await createAgentApp(worlds, agents, provider);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-runs`)
      .send({ prompt: "继续推演记忆交易", mode: "expand" })
      .expect(201);
    const runId = created.body.run.id;
    expect(created.body).toMatchObject({
      run: { worldId: world.id, status: "running", prompt: "继续推演记忆交易" },
      suggestions: [],
    });
    expect(created.body.run).not.toHaveProperty("mode");

    const streamed = await request(app.getHttpServer())
      .get(`/v1/agent-runs/${runId}/events`)
      .set("accept", "text/event-stream")
      .expect(200);
    expect(streamed.text).toContain("run.started");
    expect(streamed.text).toContain("context.used");
    expect(streamed.text).toContain("message.delta");
    expect(streamed.text).toContain("suggestion.created");
    expect(streamed.text).toContain("run.completed");

    const completedRun = await agents.findRunById(runId);
    expect(completedRun).toMatchObject({
      status: "completed",
      tokenUsage: { inputTokens: 12, outputTokens: 24, totalTokens: 36 },
    });
    const suggestions = await agents.listSuggestions(runId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.suggestion.title).toBe("记忆交易许可");
    expect(provider.calls[0]).toMatchObject({
      runId,
      prompt: "继续推演记忆交易",
      world: { id: world.id, name: "回忆所" },
    });
  });

  it("cancels a local running run", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const world = await worlds.createWorld({
      name: "白塔城",
      type: "奇幻城市",
      summary: "钟声管理所有人的时间。",
      tags: ["钟声"],
      mode: "local",
      maturity: 9,
    });
    app = await createAgentApp(worlds, agents, createMockStreamingAgentProvider());

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-runs`)
      .send({ prompt: "推演迟到者", mode: "challenge" })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(`/v1/agent-runs/${created.body.run.id}/cancel`)
      .expect(200);
    expect(cancelled.body.run).toMatchObject({ id: created.body.run.id, status: "cancelled" });

    const events = await agents.listEvents(created.body.run.id);
    expect(events.map((event) => event.type)).toEqual(["run.started", "run.cancelled"]);
  });
});

async function createAgentApp(worlds: InMemoryWorlds, agents: InMemoryAgents, provider: ReturnType<typeof createMockStreamingAgentProvider>) {
  return createHttpTestApp({
    controllers: [AgentController],
    providers: [
      AgentService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_REPOSITORY, useValue: agents },
      { provide: AGENT_PROVIDER, useValue: provider },
    ],
  });
}
