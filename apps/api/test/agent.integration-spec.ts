import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { AGENT_REPOSITORY, type AgentEventRecord, type AgentRepository, type AgentRunRecord, type AgentSuggestionRecord, type ContextRefRecord } from "../src/modules/agent/agent.repository";
import { AGENT_PROVIDER, type AgentProvider } from "../src/modules/agent/agent.provider";
import {
  WORLD_REPOSITORY,
  type ArchiveEntryRecord,
  type ConflictRecord,
  type StorySeedRecord,
  type WorldRecord,
  type WorldRepository,
} from "../src/modules/worlds/world.repository";

describe("agent run endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates a run, streams SSE events, and keeps suggestions pending until saved", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const agent = createInMemoryAgentRepository();
    addSession(auth, "session_user_1", "user_1");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "cloud",
    });
    app = await createTestApp(auth, worlds, agent, createMockAgentProvider());

    const createRun = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-runs`)
      .set("authorization", "Bearer session_user_1")
      .send({ prompt: "推演记忆交易制度", mode: "expand" })
      .expect(201);

    expect(createRun.body.run).toMatchObject({ worldId: world.id, status: "running" });
    expect(createRun.body.suggestions).toEqual([]);
    expect(await agent.listSuggestions(createRun.body.run.id)).toEqual([]);
    expect((await worlds.countAssets(world.id)).archive).toBe(0);

    const sse = await request(app.getHttpServer())
      .get(`/v1/agent-runs/${createRun.body.run.id}/events`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(sse.headers["content-type"]).toContain("text/event-stream");
    expect(sse.text).toContain("event: message.delta");
    expect(sse.text).toContain("event: suggestion.created");
    expect(sse.text).toContain("event: run.completed");

    const suggestionId = (await agent.listSuggestions(createRun.body.run.id))[0].id;
    await request(app.getHttpServer())
      .post(`/v1/agent-suggestions/${suggestionId}/save`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);

    expect((await worlds.countAssets(world.id)).archive).toBe(1);
  });

  it("cancels runs and emits a cancelled event", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const agent = createInMemoryAgentRepository();
    addSession(auth, "session_user_1", "user_1");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "市声",
      type: "都市奇幻",
      summary: "城市拥有意识。",
      tags: [],
      mode: "cloud",
    });
    app = await createTestApp(auth, worlds, agent, createMockAgentProvider());

    const createRun = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-runs`)
      .set("authorization", "Bearer session_user_1")
      .send({ prompt: "继续推演", mode: "expand" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/agent-runs/${createRun.body.run.id}/cancel`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    const sse = await request(app.getHttpServer())
      .get(`/v1/agent-runs/${createRun.body.run.id}/events`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(sse.text).toContain("event: run.cancelled");
    expect(sse.text).not.toContain("event: message.delta");
    expect(sse.text).not.toContain("event: suggestion.created");
  });

  it("records provider failures as MODEL_UNAVAILABLE in the SSE stream", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const agent = createInMemoryAgentRepository();
    addSession(auth, "session_user_1", "user_1");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "故障世界",
      type: "科幻",
      summary: "模型失败路径。",
      tags: [],
      mode: "cloud",
    });
    app = await createTestApp(auth, worlds, agent, createFailingAgentProvider());

    const createRun = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/agent-runs`)
      .set("authorization", "Bearer session_user_1")
      .send({ prompt: "fail", mode: "expand" })
      .expect(201);

    const sse = await request(app.getHttpServer())
      .get(`/v1/agent-runs/${createRun.body.run.id}/events`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(sse.text).toContain("event: run.failed");
    expect(sse.text).toContain("MODEL_UNAVAILABLE");
  });
});

async function createTestApp(
  authRepository: AuthRepository,
  worldRepository: WorldRepository,
  agentRepository: AgentRepository,
  agentProvider: AgentProvider,
) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(WORLD_REPOSITORY)
    .useValue(worldRepository)
    .overrideProvider(AGENT_REPOSITORY)
    .useValue(agentRepository)
    .overrideProvider(AGENT_PROVIDER)
    .useValue(agentProvider)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function createMockAgentProvider(): AgentProvider {
  return {
    async *stream() {
      yield { type: "context", contextRef: { kind: "world", title: "世界摘要", excerpt: "记忆可以被买卖。" } };
      yield { type: "delta", text: "好。" };
      yield { type: "delta", text: "让我先把这个灵感拆成可保存的设定。" };
      yield {
        type: "suggestion",
        suggestion: {
          id: "s1",
          kind: "setting",
          category: "世界规则",
          title: "《记忆交易法》",
          summary: "确立记忆作为可交易资产的法律地位。",
          body: "仅认证机构可以主持交易。",
        },
      };
      yield { type: "usage", tokenUsage: { inputTokens: 12, outputTokens: 30, totalTokens: 42 } };
    },
  };
}

function createFailingAgentProvider(): AgentProvider {
  return {
    async *stream() {
      throw new Error("model unavailable");
    }
  };
}

function addSession(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string) {
  repository.users.set(userId, { id: userId, email: `${userId}@example.com`, name: userId, role: "user" });
  repository.sessions.set(token, { token, userId, expiresAt: new Date(Date.now() + 60_000) });
}

function createInMemoryAuthRepository() {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, StoredSession>();
  const accessTokens = new Map<string, StoredAccessToken>();
  return {
    users,
    sessions,
    accessTokens,
    async findUserById(id: string) { return users.get(id) ?? null; },
    async findSessionByToken(token: string) { return sessions.get(token) ?? null; },
    async deleteSession(token: string) { sessions.delete(token); },
    async listAccessTokens(userId: string) { return [...accessTokens.values()].filter((item) => item.userId === userId); },
    async createAccessToken(input: StoredAccessToken) { accessTokens.set(input.id, input); return input; },
    async findAccessTokenByHash(tokenHash: string) { return [...accessTokens.values()].find((item) => item.tokenHash === tokenHash) ?? null; },
    async markAccessTokenUsed(id: string, usedAt: Date) { const token = accessTokens.get(id); if (token) token.lastUsedAt = usedAt; },
    async revokeAccessToken(userId: string, tokenId: string, revokedAt: Date) {
      const token = accessTokens.get(tokenId);
      if (!token || token.userId !== userId) return null;
      token.revokedAt = revokedAt;
      return token;
    },
  } satisfies AuthRepository & { users: typeof users; sessions: typeof sessions; accessTokens: typeof accessTokens };
}

function createInMemoryWorldRepository() {
  const worlds = new Map<string, WorldRecord>();
  const archiveEntries = new Map<string, ArchiveEntryRecord>();
  const storySeeds = new Map<string, StorySeedRecord>();
  const conflicts = new Map<string, ConflictRecord>();

  const repository: WorldRepository = {
    async createWorld(input) {
      const now = new Date();
      const world: WorldRecord = {
        id: `world_${worlds.size + 1}`,
        ownerId: input.ownerId,
        name: input.name,
        type: input.type,
        summary: input.summary,
        tags: input.tags,
        status: "draft",
        visibility: "private",
        mode: input.mode,
        maturity: input.maturity ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      worlds.set(world.id, world);
      return world;
    },
    async listWorlds(ownerId) { return [...worlds.values()].filter((world) => world.ownerId === ownerId); },
    async findWorldById(id) { return worlds.get(id) ?? null; },
    async updateWorld(id, input) { const world = worlds.get(id); if (!world) return null; const next = { ...world, ...input, updatedAt: new Date() }; worlds.set(id, next); return next; },
    async archiveWorld(id) { const world = worlds.get(id); if (!world) return null; const next = { ...world, status: "unpublished" as const, updatedAt: new Date() }; worlds.set(id, next); return next; },
    async listArchiveEntries(worldId) { return [...archiveEntries.values()].filter((entry) => entry.worldId === worldId); },
    async createArchiveEntry(input) { const entry = { id: `archive_${archiveEntries.size + 1}`, ...input, relations: input.relations ?? [], createdAt: new Date(), updatedAt: new Date() }; archiveEntries.set(entry.id, entry); return entry; },
    async listStorySeeds(worldId) { return [...storySeeds.values()].filter((seed) => seed.worldId === worldId); },
    async createStorySeed(input) { const seed = { id: `seed_${storySeeds.size + 1}`, ...input, questions: input.questions ?? [], createdAt: new Date(), updatedAt: new Date() }; storySeeds.set(seed.id, seed); return seed; },
    async listConflicts(worldId) { return [...conflicts.values()].filter((conflict) => conflict.worldId === worldId); },
    async createConflict(input) { const conflict = { id: `conflict_${conflicts.size + 1}`, ...input, related: input.related ?? [], derivedSeeds: input.derivedSeeds ?? [], createdAt: new Date(), updatedAt: new Date() }; conflicts.set(conflict.id, conflict); return conflict; },
    async countAssets(worldId) {
      return {
        archive: [...archiveEntries.values()].filter((entry) => entry.worldId === worldId).length,
        seeds: [...storySeeds.values()].filter((seed) => seed.worldId === worldId).length,
        conflicts: [...conflicts.values()].filter((conflict) => conflict.worldId === worldId).length,
      };
    },
  };

  return repository;
}

function createInMemoryAgentRepository() {
  const runs = new Map<string, AgentRunRecord>();
  const events = new Map<string, AgentEventRecord[]>();
  const suggestions = new Map<string, AgentSuggestionRecord>();
  const contextRefs = new Map<string, ContextRefRecord>();
  let runCounter = 0;
  let eventCounter = 0;

  const repository: AgentRepository = {
    async createRun(input) {
      const now = new Date();
      const run: AgentRunRecord = {
        id: `run_${++runCounter}`,
        worldId: input.worldId,
        userId: input.userId,
        mode: input.mode,
        prompt: input.prompt,
        status: "running",
        model: input.model,
        tokenUsage: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        errorMessage: null,
      };
      runs.set(run.id, run);
      return run;
    },
    async findRunById(id) { return runs.get(id) ?? null; },
    async updateRun(id, input) { const run = runs.get(id); if (!run) return null; const next = { ...run, ...input, updatedAt: new Date() }; runs.set(id, next); return next; },
    async appendEvent(input) {
      const event = { id: `evt_${++eventCounter}`, createdAt: new Date(), ...input };
      events.set(input.runId, [...(events.get(input.runId) ?? []), event]);
      return event;
    },
    async listEvents(runId) { return events.get(runId) ?? []; },
    async createContextRef(input) {
      const contextRef = { id: `ctx_${contextRefs.size + 1}`, ...input };
      contextRefs.set(contextRef.id, contextRef);
      return contextRef;
    },
    async createSuggestion(input) { const suggestion = { id: `ags_${suggestions.size + 1}`, status: "pending" as const, savedAssetId: null, ...input }; suggestions.set(suggestion.id, suggestion); return suggestion; },
    async listSuggestions(runId) { return [...suggestions.values()].filter((item) => item.runId === runId); },
    async findSuggestionById(id) { return suggestions.get(id) ?? null; },
    async updateSuggestion(id, input) { const suggestion = suggestions.get(id); if (!suggestion) return null; const next = { ...suggestion, ...input }; suggestions.set(id, next); return next; },
  };

  return repository;
}
