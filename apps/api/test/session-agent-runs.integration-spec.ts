import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSessionsController } from "../src/modules/agent-sessions/agent-sessions.controller";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
import { AgentController } from "../src/modules/agent/agent.controller";
import { AGENT_PROVIDER, type AgentProvider, type AgentProviderChunk, type AgentProviderInput } from "../src/modules/agent/agent.provider";
import { AGENT_REPOSITORY } from "../src/modules/agent/agent.repository";
import { AgentService } from "../src/modules/agent/agent.service";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import {
  createHttpTestApp,
  createInMemoryAgentSessions,
  createInMemoryAgents,
  createInMemoryWorlds,
  createMockStreamingAgentProvider,
  parseSseMessages,
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
    expect(streamed.text).not.toContain("suggestion.created");
    expect(streamed.text).toContain("run.completed");
    expect(await agents.listSuggestions(created.body.run.id)).toHaveLength(0);

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${session.id}`)
      .expect(200);

    expect(detail.body.messages.map((message: any) => message.role)).toEqual(["user", "assistant"]);
    expect(detail.body.messages[0].content).toBe("继续推演记忆交易");
  });

  it("persists provider context as session context items", async () => {
    const created = await createAndStreamSessionRun("检查亲属记忆交易的制度漏洞");
    app = created.app;

    const detail = await request(created.app.getHttpServer())
      .get(`/v1/worlds/${created.world.id}/agent-sessions/${created.sessionId}`)
      .expect(200);

    expect(detail.body.contextItems).toEqual([
      expect.objectContaining({
        sessionId: created.sessionId,
        kind: "asset_index",
        targetId: created.world.id,
        title: "回忆所 · 世界摘要",
        summary: "记忆可以被买卖。",
        source: "initial",
        metadata: expect.objectContaining({
          runId: created.runId,
          providerKind: "world",
          providerLevel: "manifest",
          source: "initial",
        }),
      }),
    ]);

    const contextUsed = created.events.find((event) => event.type === "context.used");
    expect(contextUsed?.data.payload).toEqual(expect.objectContaining({
      contextItemId: detail.body.contextItems[0].id,
      contextRef: expect.objectContaining({ title: "回忆所 · 世界摘要", source: "initial" }),
    }));
  });

  it("passes formal assets into the provider initial context for session runs", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const provider = createMockStreamingAgentProvider([
      { type: "delta", text: "继续推演现有资产。" },
    ]);
    const timestamp = new Date("2026-06-20T00:00:00.000Z");
    const world = await worlds.createWorld({
      name: "宇宙纪元",
      type: "近未来硬科幻",
      summary: "聚变能源与太空电梯开启宇宙殖民。",
      tags: ["硬科幻"],
      mode: "local",
      maturity: 20,
    });
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "宇宙纪元 推演",
      status: "active",
      current: true,
      metadata: {},
    });
    app = await createAgentSessionRunApp(worlds, agents, sessions, provider, {
      listAssets: async () => ({
        assets: [{
          id: "official_asset_existing_gravity",
          worldId: world.id,
          type: "rule",
          name: "重力",
          summary: "已有重力规则。",
          documentKey: `worlds/${world.id}/official-assets/official_asset_existing_gravity.md`,
          status: "active",
          version: 1,
          tags: [],
          metadata: {},
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
        }],
        nextCursor: null,
      }),
    });

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
      .send({ prompt: "继续推演" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream")
      .expect(200);

    expect(provider.calls[0].context).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "setting",
        level: "card",
        title: "重力",
        targetId: "official_asset_existing_gravity",
      }),
      expect.objectContaining({
        kind: "setting",
        level: "brief",
        title: "重力",
        targetId: "official_asset_existing_gravity",
      }),
    ]));
  });

  it("persists default provider context as source fragments", async () => {
    const provider = createMockStreamingAgentProvider([
      {
        type: "context",
        contextRef: {
          kind: "archive",
          title: "记忆交易法",
          excerpt: "许可制度决定谁能合法买卖记忆。",
          targetId: "archive_1",
        },
      },
      { type: "delta", text: "亲属记忆交易会暴露许可继承漏洞。" },
      {
        type: "usage",
        tokenUsage: { inputTokens: 8, outputTokens: 13, totalTokens: 21 },
      },
    ]);
    const created = await createAndStreamSessionRun("检查亲属记忆交易的制度漏洞", provider);
    app = created.app;

    const detail = await request(created.app.getHttpServer())
      .get(`/v1/worlds/${created.world.id}/agent-sessions/${created.sessionId}`)
      .expect(200);

    expect(detail.body.contextItems).toEqual([
      expect.objectContaining({
        sessionId: created.sessionId,
        kind: "source_fragment",
        targetId: "archive_1",
        title: "记忆交易法",
        summary: "许可制度决定谁能合法买卖记忆。",
        source: "initial",
        metadata: expect.objectContaining({
          runId: created.runId,
          providerKind: "archive",
          providerLevel: "card",
          source: "initial",
        }),
      }),
    ]);

    const contextUsed = created.events.find((event) => event.type === "context.used");
    expect(contextUsed?.data.payload).toEqual(expect.objectContaining({
      contextItemId: detail.body.contextItems[0].id,
    }));
  });

  it("persists and streams applied asset patch and consistency issue provider events", async () => {
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
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "asset_edit",
      title: "编辑记忆交易许可",
      status: "active",
      current: false,
      metadata: {},
    });
    const provider = createMockStreamingAgentProvider([
      {
        type: "asset-patch-applied",
        sessionId: session.id,
        assetId: "asset_1",
        patchId: "patch_1",
      },
      {
        type: "consistency-issue-created",
        issueId: "issue_1",
        worldId: world.id,
      },
      { type: "delta", text: "补丁已应用。" },
    ]);
    app = await createAgentSessionRunApp(worlds, agents, sessions, provider);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
      .send({ prompt: "应用补丁" })
      .expect(201);

    const streamed = await request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream")
      .expect(200);

    const events = parseSseMessages(streamed.text);
    expect(events).toContainEqual(expect.objectContaining({
      type: "asset.patch.applied",
      data: expect.objectContaining({
        payload: {
          sessionId: session.id,
          assetId: "asset_1",
          patchId: "patch_1",
        },
      }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "consistency.issue.created",
      data: expect.objectContaining({
        payload: {
          issueId: "issue_1",
          worldId: world.id,
        },
      }),
    }));
    expect(await agents.listEvents(created.body.run.id)).toContainEqual(expect.objectContaining({
      type: "asset.patch.applied",
      payload: {
        sessionId: session.id,
        assetId: "asset_1",
        patchId: "patch_1",
      },
    }));
    expect(await agents.listEvents(created.body.run.id)).toContainEqual(expect.objectContaining({
      type: "consistency.issue.created",
      payload: {
        issueId: "issue_1",
        worldId: world.id,
      },
    }));
  });

  it("does not create official suggestions for world exploration session runs", async () => {
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
    const runId = created.body.run.id;

    await request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${runId}/events`)
      .set("accept", "text/event-stream")
      .expect(200);

    expect(await agents.listSuggestions(runId)).toHaveLength(0);

    const events = await agents.listEvents(runId);
    expect(events.map((event) => event.type)).not.toContain("suggestion.created");
  });

  it.each([
    {
      kind: "asset_edit" as const,
      skillName: "asset-edit",
      allowedWriteTools: ["apply_world_asset_patch"],
      deniedTools: ["propose_setting", "propose_story_seed", "propose_conflict", "propose_release_notes", "create_world_asset", "resolve_consistency_issue"],
    },
    {
      kind: "consistency_repair" as const,
      skillName: "consistency-repair",
      allowedWriteTools: ["resolve_consistency_issue"],
      deniedTools: ["propose_setting", "propose_story_seed", "propose_conflict", "propose_release_notes", "create_world_asset", "apply_world_asset_patch"],
    },
  ])("passes $kind policy, tools, and skills to the provider", async ({ kind, skillName, allowedWriteTools, deniedTools }) => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const provider = createMockStreamingAgentProvider([
      { type: "delta", text: "已按会话类型处理。" },
      {
        type: "usage",
        tokenUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      },
    ]);
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
      kind,
      title: `${kind} session`,
      status: "active",
      current: false,
      metadata: {},
    });
    app = await createAgentSessionRunApp(worlds, agents, sessions, provider);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
      .send({ prompt: "按当前会话处理" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream")
      .expect(200);

    expect(provider.calls).toHaveLength(1);
    const providerInput = provider.calls[0];
    expect(providerInput.policy).toEqual({ kind });
    expect(providerInput.skills?.map((skill) => skill.name)).toEqual([skillName]);
    const toolNames = providerInput.tools?.map((tool) => tool.name) ?? [];
    expect(toolNames).toEqual(expect.arrayContaining([
      "get_world_manifest",
      "search_world_assets",
      "get_asset_brief",
      "get_asset_detail",
      "get_asset_source_fragments",
      "list_local_releases",
      ...allowedWriteTools,
    ]));
    for (const deniedTool of deniedTools) {
      expect(toolNames).not.toContain(deniedTool);
    }
  });

  it("uses asset deposition policy for explicit world exploration deposition prompts", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const provider = createMockStreamingAgentProvider([
      { type: "delta", text: "已准备沉淀资产。" },
    ]);
    const world = await worlds.createWorld({
      name: "宇宙纪元",
      type: "近未来硬科幻",
      summary: "聚变能源与太空电梯开启宇宙殖民。",
      tags: ["硬科幻"],
      mode: "local",
      maturity: 20,
    });
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "宇宙纪元 推演",
      status: "active",
      current: true,
      metadata: {},
    });
    await sessions.appendMessageAtEnd({
      sessionId: session.id,
      role: "assistant",
      content: "## 重力\n无人工重力，旋转模拟重力通常不超过 1/6g。",
      status: "complete",
      metadata: {},
    });
    app = await createAgentSessionRunApp(worlds, agents, sessions, provider);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
      .send({ prompt: "沉淀规则类资产“重力”" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream")
      .expect(200);

    expect(provider.calls).toHaveLength(1);
    const providerInput = provider.calls[0];
    expect(providerInput.policy).toEqual({ kind: "world_exploration", intent: "asset_deposition" });
    expect(providerInput.skills?.map((skill) => skill.name)).toEqual(["asset-deposition"]);
    expect(providerInput.tools?.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_world_manifest",
      "create_world_asset",
    ]));
    expect(providerInput.tools?.map((tool) => tool.name)).not.toContain("propose_setting");
    expect(providerInput.prompt).toContain("沉淀规则类资产“重力”");
    expect(providerInput.prompt).toContain("无人工重力");
  });

  it("uses recent session context for short re-deposition prompts", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const provider = createMockStreamingAgentProvider([
      { type: "delta", text: "已根据前文重新沉淀重力资产。" },
    ]);
    const world = await worlds.createWorld({
      name: "宇宙纪元",
      type: "近未来硬科幻",
      summary: "聚变能源与太空电梯开启宇宙殖民。",
      tags: ["硬科幻"],
      mode: "local",
      maturity: 20,
    });
    const session = await sessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "宇宙纪元 推演",
      status: "active",
      current: true,
      metadata: {},
    });
    await sessions.appendMessageAtEnd({
      sessionId: session.id,
      role: "user",
      content: "沉淀规则类资产“重力”",
      status: "complete",
      metadata: {},
    });
    await sessions.appendMessageAtEnd({
      sessionId: session.id,
      role: "assistant",
      content: "## 重力\n无人工重力，只有旋转模拟重力和飞船加速时产生的模拟重力。",
      status: "complete",
      metadata: {},
    });
    app = await createAgentSessionRunApp(worlds, agents, sessions, provider);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
      .send({ prompt: "重新沉淀" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream")
      .expect(200);

    expect(provider.calls).toHaveLength(1);
    const providerInput = provider.calls[0];
    expect(providerInput.policy).toEqual({ kind: "world_exploration", intent: "asset_deposition" });
    expect(providerInput.skills?.map((skill) => skill.name)).toEqual(["asset-deposition"]);
    expect(providerInput.tools?.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_world_manifest",
      "create_world_asset",
    ]));
    expect(providerInput.tools?.map((tool) => tool.name)).not.toContain("propose_setting");
    expect(providerInput.prompt).toContain("当前指令：重新沉淀");
    expect(providerInput.prompt).toContain("沉淀规则类资产“重力”");
    expect(providerInput.prompt).toContain("无人工重力");
  });

  it("appends session messages at the end without reusing sequences", async () => {
    const sessions = createInMemoryAgentSessions();
    const session = await sessions.createSession({
      worldId: "world_1",
      kind: "world_exploration",
      title: "记忆交易推演",
    });

    await Promise.all([
      sessions.appendMessageAtEnd({
        sessionId: session.id,
        role: "user",
        content: "第一轮",
      }),
      sessions.appendMessageAtEnd({
        sessionId: session.id,
        role: "assistant",
        content: "第二轮",
      }),
    ]);

    expect((await sessions.listMessages(session.id)).map((message) => message.sequence)).toEqual([1, 2]);
  });

  it("does not drive the provider twice for concurrent session run streams", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const provider = createBlockingAgentProvider([
      { type: "delta", text: "先确认记忆交易的边界。" },
      {
        type: "usage",
        tokenUsage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      },
    ]);
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
    app = await createAgentSessionRunApp(worlds, agents, sessions, provider);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
      .send({ prompt: "继续推演记忆交易" })
      .expect(201);

    const firstStream = request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream")
      .expect(200)
      .then((response) => response);
    await provider.waitForCalls(1);

    const secondStream = request(app.getHttpServer())
      .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream")
      .expect(200)
      .then((response) => response);
    await delay(20);
    provider.release();

    const [first, second] = await Promise.all([firstStream, secondStream]);
    expect(provider.calls).toHaveLength(1);
    expect(first.text).toContain("run.completed");
    expect(second.text).toContain("run.completed");
  });

  it("rejects legacy run events for session runs without driving the provider", async () => {
    const worlds = createInMemoryWorlds();
    const agents = createInMemoryAgents();
    const sessions = createInMemoryAgentSessions();
    const provider = createMockStreamingAgentProvider();
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
    app = await createAgentSessionRunApp(worlds, agents, sessions, provider);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
      .send({ prompt: "继续推演记忆交易" })
      .expect(201);

    const legacyStream = await request(app.getHttpServer())
      .get(`/v1/agent-runs/${created.body.run.id}/events`)
      .set("accept", "text/event-stream");

    expect(legacyStream.status).not.toBe(200);
    expect(provider.calls).toHaveLength(0);
    expect((await sessions.listMessages(session.id)).map((message) => message.role)).toEqual(["user"]);
    expect(await agents.listSuggestions(created.body.run.id)).toHaveLength(0);
  });

  it("parses CRLF SSE messages with optional data spacing", () => {
    const parsed = parseSseMessages([
      "id: event_1",
      "event: context.used",
      "data:{\"payload\":{\"contextItemId\":\"ctx_1\"}}",
      "",
      "id: event_2",
      "event: run.completed",
      "data: {\"payload\":{\"tokenUsage\":{\"totalTokens\":1}}}",
    ].join("\r\n"));

    expect(parsed).toEqual([
      expect.objectContaining({
        id: "event_1",
        type: "context.used",
        data: { payload: { contextItemId: "ctx_1" } },
      }),
      expect.objectContaining({
        id: "event_2",
        type: "run.completed",
        data: { payload: { tokenUsage: { totalTokens: 1 } } },
      }),
    ]);
  });
});

async function createAndStreamSessionRun(
  prompt: string,
  provider: AgentProvider = createMockStreamingAgentProvider(),
) {
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
  const app = await createAgentSessionRunApp(worlds, agents, sessions, provider);

  const created = await request(app.getHttpServer())
    .post(`/v1/worlds/${world.id}/agent-sessions/${session.id}/runs`)
    .send({ prompt })
    .expect(201);

  const streamed = await request(app.getHttpServer())
    .get(`/v1/agent-session-runs/${created.body.run.id}/events`)
    .set("accept", "text/event-stream")
    .expect(200);

  return {
    world,
    app,
    sessionId: session.id,
    runId: created.body.run.id,
    events: parseSseMessages(streamed.text),
  };
}

async function createAgentSessionRunApp(
  worlds: InMemoryWorlds,
  agents: InMemoryAgents,
  sessions: InMemoryAgentSessions,
  provider: AgentProvider = createMockStreamingAgentProvider(),
  officialAssets?: Pick<OfficialAssetsService, "listAssets">,
) {
  return createHttpTestApp({
    controllers: [AgentController, AgentSessionsController],
    providers: [
      AgentService,
      AgentSessionsService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_REPOSITORY, useValue: agents },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      { provide: AGENT_PROVIDER, useValue: provider },
      ...(officialAssets ? [{ provide: OfficialAssetsService, useValue: officialAssets }] : []),
    ],
  });
}

function createBlockingAgentProvider(chunks: AgentProviderChunk[]) {
  const calls: AgentProviderInput[] = [];
  let released = false;
  let releaseProvider = () => {};
  const releasedPromise = new Promise<void>((resolve) => {
    releaseProvider = () => {
      released = true;
      resolve();
    };
  });

  const provider: AgentProvider & {
    calls: AgentProviderInput[];
    release(): void;
    waitForCalls(count: number): Promise<void>;
  } = {
    calls,
    release: releaseProvider,
    async waitForCalls(count: number) {
      for (let attempt = 0; attempt < 20; attempt++) {
        if (calls.length >= count) return;
        await delay(10);
      }
      throw new Error(`Expected provider to be called ${count} times, got ${calls.length}.`);
    },
    async *stream(input) {
      calls.push(input);
      if (!released) await releasedPromise;
      for (const chunk of chunks) {
        if (input.signal?.aborted) return;
        yield chunk;
      }
    },
  };
  return provider;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
