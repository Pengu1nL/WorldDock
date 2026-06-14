import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSessionsController } from "../src/modules/agent-sessions/agent-sessions.controller";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
import { AgentController } from "../src/modules/agent/agent.controller";
import { AGENT_PROVIDER } from "../src/modules/agent/agent.provider";
import { AGENT_REPOSITORY } from "../src/modules/agent/agent.repository";
import { AgentService } from "../src/modules/agent/agent.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import {
  createHttpTestApp,
  createInMemoryAgentSessions,
  createInMemoryAgents,
  createInMemoryWorlds,
  createMockStreamingAgentProvider,
  type InMemoryAgentSessions,
  type InMemoryAgents,
  type InMemoryWorlds,
} from "./local-api-test-helpers";

describe("agent session run local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates a run inside an agent session and streams persisted session messages", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
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
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "记忆交易推演",
      status: "active",
      current: true,
      metadata: {},
    });
    app = await createAgentSessionRunApp(worlds, agents, sessions);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
      .send({ prompt: "继续推演记忆交易" })
      .expect(201);

    expect(created.body.run).toMatchObject({
      worldId: world.id,
      sessionId: session.id,
      status: "running",
      prompt: "继续推演记忆交易",
    });

    const streamed = await request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream")
      .expect(200);

    expect(streamed.text).toContain("run.started");
    expect(streamed.text).toContain("message.delta");
    expect(streamed.text).toContain("run.completed");

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${session.id}`)
      .expect(200);

    expect(detail.body.messages.map((message: any) => message.role)).toEqual(["user", "assistant"]);
    expect(detail.body.messages[0].content).toBe("继续推演记忆交易");
  });
});

async function createAgentSessionRunApp(
  worlds: InMemoryWorlds,
  agents: InMemoryAgents,
  sessions: InMemoryAgentSessions,
) {
  return createHttpTestApp({
    controllers: [AgentController, AgentSessionsController],
    providers: [
      AgentService,
      AgentSessionsService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_REPOSITORY, useValue: agents },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      { provide: AGENT_PROVIDER, useValue: createMockStreamingAgentProvider() },
    ],
  });
}
