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

    const blankSubject = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "asset_edit", title: "资产改写", subjectAssetId: "   " })
      .expect(400);
    expect(blankSubject.body).toMatchObject({ code: "VALIDATION_FAILED" });

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

    const blankIssue = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions`)
      .send({ kind: "consistency_repair", title: "一致性修复", issueId: "   " })
      .expect(400);
    expect(blankIssue.body).toMatchObject({ code: "VALIDATION_FAILED" });

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

  it("lists sessions by kind, status, and title query", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createAgentSessionsApp(worlds, createInMemoryAgentSessions());
    const server = app.getHttpServer();
    const createSession = (
      title: string,
      kind: "world_exploration" | "consistency_repair",
      input: Partial<{ issueId: string }> = {},
    ) =>
      request(server)
        .post(`/v1/worlds/${world.id}/agent-sessions`)
        .send({ kind, title, ...input })
        .expect(201);

    await createSession("记忆交易推演", "world_exploration");
    await createSession("白塔巡检", "world_exploration");
    await createSession("白塔时间修复", "consistency_repair", { issueId: "issue_1" });

    const listed = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions`)
      .query({ kind: "world_exploration", status: "active", q: "记忆" })
      .expect(200);

    expect(listed.body.nextCursor).toBeNull();
    expect(listed.body.sessions).toHaveLength(1);
    expect(listed.body.sessions[0]).toMatchObject({ title: "记忆交易推演" });
  });

  it("paginates sessions with limit and cursor", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createAgentSessionsApp(worlds, createInMemoryAgentSessions());
    const server = app.getHttpServer();

    for (const title of ["第一轮", "第二轮", "第三轮"]) {
      await request(server)
        .post(`/v1/worlds/${world.id}/agent-sessions`)
        .send({ kind: "world_exploration", title })
        .expect(201);
    }

    const firstPage = await request(server)
      .get(`/v1/worlds/${world.id}/agent-sessions`)
      .query({ limit: 2 })
      .expect(200);

    expect(firstPage.body.sessions).toHaveLength(2);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(server)
      .get(`/v1/worlds/${world.id}/agent-sessions`)
      .query({ limit: 2, cursor: firstPage.body.nextCursor })
      .expect(200);

    expect(secondPage.body.nextCursor).toBeNull();
    expect(secondPage.body.sessions).toHaveLength(1);
    expect(new Set([...firstPage.body.sessions, ...secondPage.body.sessions].map((session) => session.id)).size).toBe(3);
  });

  it("caps list limit at 50 instead of rejecting larger values", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createAgentSessionsApp(worlds, createInMemoryAgentSessions());
    const server = app.getHttpServer();

    for (let index = 1; index <= 51; index++) {
      await request(server)
        .post(`/v1/worlds/${world.id}/agent-sessions`)
        .send({ kind: "world_exploration", title: `第 ${index} 轮` })
        .expect(201);
    }

    const listed = await request(server)
      .get(`/v1/worlds/${world.id}/agent-sessions`)
      .query({ limit: 100 })
      .expect(200);

    expect(listed.body.sessions).toHaveLength(50);
    expect(listed.body.nextCursor).toEqual(expect.any(String));
  });

  it("returns 400 for an invalid list cursor", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createAgentSessionsApp(worlds, createInMemoryAgentSessions());

    const response = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/agent-sessions`)
      .query({ cursor: "not-a-cursor" })
      .expect(400);

    expect(response.body).toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid agent session cursor.",
    });
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
    expect(archived.body.session).toMatchObject({ id: second.body.session.id, status: "archived", current: false });

    const archivedCurrent = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-sessions/${second.body.session.id}/current`)
      .expect(400);
    expect(archivedCurrent.body).toMatchObject({
      code: "BAD_REQUEST",
      message: "Only active world exploration sessions can be current.",
    });
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
