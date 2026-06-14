import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSessionsController } from "../src/modules/agent-sessions/agent-sessions.controller";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import {
  createHttpTestApp,
  createInMemoryAgentSessions,
  createInMemoryWorlds,
  type InMemoryAgentSessions,
  type InMemoryWorlds,
} from "./local-api-test-helpers";

describe("agent sessions local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates and reads a world exploration session", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createAgentSessionsApp(worlds, createInMemoryAgentSessions());

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "world_exploration", title: "记忆交易推演", current: true })
      .expect(201);

    expect(created.body.session).toMatchObject({
      worldId: world.id,
      kind: "world_exploration",
      title: "记忆交易推演",
      status: "active",
      current: true,
    });
    expect(created.body.session.createdAt).toEqual(expect.any(String));
    expect(created.body.session.updatedAt).toEqual(expect.any(String));

    const list = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions`)
      .expect(200);
    expect(list.body.sessions.map((session: { id: string }) => session.id)).toEqual([created.body.session.id]);

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${created.body.session.id}`)
      .expect(200);

    expect(detail.body).toMatchObject({
      session: { id: created.body.session.id },
      subjects: [{ subjectKind: "world", subjectId: world.id, role: "primary" }],
      contextItems: [],
      messages: [],
    });
  });

  it("requires a subject asset when creating an asset edit session", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createAgentSessionsApp(worlds, createInMemoryAgentSessions());

    const missingSubject = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "asset_edit", title: "资产改写" })
      .expect(400);
    expect(missingSubject.body).toMatchObject({ code: "VALIDATION_FAILED" });

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "asset_edit", title: "资产改写", subjectAssetId: "asset_memory_law", current: true })
      .expect(201);
    expect(created.body.session).toMatchObject({ kind: "asset_edit", current: false });

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${created.body.session.id}`)
      .expect(200);
    expect(detail.body.subjects).toEqual([
      expect.objectContaining({ subjectKind: "asset", subjectId: "asset_memory_law", role: "primary" }),
    ]);
  });

  it("requires an issue when creating a consistency repair session", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createAgentSessionsApp(worlds, createInMemoryAgentSessions());

    const missingIssue = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "consistency_repair", title: "一致性修复" })
      .expect(400);
    expect(missingIssue.body).toMatchObject({ code: "VALIDATION_FAILED" });

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "consistency_repair", title: "一致性修复", issueId: "issue_memory_law", current: true })
      .expect(201);
    expect(created.body.session).toMatchObject({ kind: "consistency_repair", current: false });

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${created.body.session.id}`)
      .expect(200);
    expect(detail.body.subjects).toEqual([
      expect.objectContaining({
        subjectKind: "consistency_issue",
        subjectId: "issue_memory_law",
        role: "primary",
      }),
    ]);
  });

  it("archives a session and switches the current world exploration session", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createAgentSessionsApp(worlds, createInMemoryAgentSessions());

    const first = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "world_exploration", title: "第一轮", current: true })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "world_exploration", title: "第二轮", current: true })
      .expect(201);

    const firstAfterSecondCreate = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${first.body.session.id}`)
      .expect(200);
    expect(firstAfterSecondCreate.body.session).toMatchObject({ id: first.body.session.id, current: false });

    const third = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "world_exploration", title: "第三轮" })
      .expect(201);

    const current = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${third.body.session.id}/current`)
      .expect(200);
    expect(current.body.session).toMatchObject({ id: third.body.session.id, current: true });

    const secondAfterCurrent = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${second.body.session.id}/current`)
      .expect(200);
    expect(secondAfterCurrent.body.session).toMatchObject({ id: second.body.session.id, current: true });

    const firstDetail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions/${first.body.session.id}`)
      .expect(200);
    expect(firstDetail.body.session).toMatchObject({ id: first.body.session.id, current: false });

    const archived = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${second.body.session.id}/archive`)
      .expect(200);
    expect(archived.body.session).toMatchObject({ id: second.body.session.id, status: "archived" });
  });

  it("returns 404 when the world does not exist", async () => {
    app = await createAgentSessionsApp(createInMemoryWorlds(), createInMemoryAgentSessions());

    const response = await request(app.getHttpServer())
      .post("/v1/worlds/missing_world/agent-sessions")
      .send({ kind: "world_exploration", title: "不存在的世界" })
      .expect(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Agent session not found.",
    });
  });
});

async function createAgentSessionsApp(worlds: InMemoryWorlds, sessions: InMemoryAgentSessions) {
  return createHttpTestApp({
    controllers: [AgentSessionsController],
    providers: [
      AgentSessionsService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
    ],
  });
}

function createWorld(worlds: InMemoryWorlds) {
  return worlds.createWorld({
    name: "回忆所",
    type: "近未来",
    summary: "记忆可以被买卖。",
    tags: ["记忆"],
    mode: "local",
    maturity: 12,
  });
}
