import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import {
  WORLD_REPOSITORY,
  type ArchiveEntryRecord,
  type ConflictRecord,
  type StorySeedRecord,
  type WorldRecord,
  type WorldRepository,
} from "../src/modules/worlds/world.repository";

describe("world asset endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates, lists, reads, updates, and archives owner worlds", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    addSession(auth, "session_user_1", "user_1");
    app = await createTestApp(auth, worlds);

    const created = await request(app.getHttpServer())
      .post("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .send({
        name: "回忆所",
        type: "近未来 / 软科幻",
        summary: "记忆可以被买卖的近未来社会。",
        tags: ["记忆", "制度"],
        mode: "cloud",
      })
      .expect(201);

    expect(created.body.world).toMatchObject({
      name: "回忆所",
      archive: 0,
      seeds: 0,
      conflicts: 0,
      status: "draft",
      visibility: "private",
    });

    const worldId = created.body.world.id;

    const list = await request(app.getHttpServer())
      .get("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(list.body.worlds).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/v1/worlds/${worldId}`)
      .set("authorization", "Bearer session_user_1")
      .send({ maturity: 35, summary: "更新后的世界摘要。" })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${worldId}`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(detail.body.world).toMatchObject({
      id: worldId,
      maturity: 35,
      summary: "更新后的世界摘要。",
    });

    await request(app.getHttpServer())
      .delete(`/v1/worlds/${worldId}`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    const archived = await request(app.getHttpServer())
      .get(`/v1/worlds/${worldId}`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(archived.body.world.status).toBe("unpublished");
  });

  it("persists archive entries, story seeds, and conflicts for the owner", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    addSession(auth, "session_user_1", "user_1");
    app = await createTestApp(auth, worlds);

    const { body } = await request(app.getHttpServer())
      .post("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .send({
        name: "市声",
        type: "都市奇幻",
        summary: "城市拥有意识。",
        tags: ["城市"],
        mode: "cloud",
      })
      .expect(201);
    const worldId = body.world.id;

    await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/archive`)
      .set("authorization", "Bearer session_user_1")
      .send({ title: "城市语", category: "世界规则", summary: "城市通过交通节奏说话。", body: "城市语没有语法。" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/seeds`)
      .set("authorization", "Bearer session_user_1")
      .send({ title: "她在央求拆掉那条地铁", hook: "城市请求拆掉 7 号线。", conflict: "城市意志 vs 居民意志" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/conflicts`)
      .set("authorization", "Bearer session_user_1")
      .send({ title: "城市意志 vs 居民意志", summary: "整体福祉与个体生存冲突。", body: "张力贯穿公共议题。" })
      .expect(201);

    const archive = await request(app.getHttpServer()).get(`/v1/worlds/${worldId}/archive`).set("authorization", "Bearer session_user_1").expect(200);
    const seeds = await request(app.getHttpServer()).get(`/v1/worlds/${worldId}/seeds`).set("authorization", "Bearer session_user_1").expect(200);
    const conflicts = await request(app.getHttpServer()).get(`/v1/worlds/${worldId}/conflicts`).set("authorization", "Bearer session_user_1").expect(200);
    const detail = await request(app.getHttpServer()).get(`/v1/worlds/${worldId}`).set("authorization", "Bearer session_user_1").expect(200);

    expect(archive.body.archiveEntries).toHaveLength(1);
    expect(seeds.body.storySeeds).toHaveLength(1);
    expect(conflicts.body.conflicts).toHaveLength(1);
    expect(detail.body.world).toMatchObject({ archive: 1, seeds: 1, conflicts: 1 });
  });

  it("blocks other users from reading private worlds", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    addSession(auth, "session_user_1", "user_1");
    addSession(auth, "session_user_2", "user_2");
    app = await createTestApp(auth, worlds);

    const { body } = await request(app.getHttpServer())
      .post("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .send({ name: "私有世界", type: "Fantasy", summary: "Private.", tags: [], mode: "cloud" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/worlds/${body.world.id}`)
      .set("authorization", "Bearer session_user_2")
      .expect(403);
  });
});

async function createTestApp(authRepository: AuthRepository, worldRepository: WorldRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(WORLD_REPOSITORY)
    .useValue(worldRepository)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
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
    async updateWorld(id, input) {
      const world = worlds.get(id);
      if (!world) return null;
      const next = { ...world, ...input, updatedAt: new Date() };
      worlds.set(id, next);
      return next;
    },
    async archiveWorld(id) {
      const world = worlds.get(id);
      if (!world) return null;
      const next = { ...world, status: "unpublished" as const, updatedAt: new Date() };
      worlds.set(id, next);
      return next;
    },
    async listArchiveEntries(worldId) { return [...archiveEntries.values()].filter((entry) => entry.worldId === worldId); },
    async createArchiveEntry(input) {
      const entry = { id: `archive_${archiveEntries.size + 1}`, ...input, createdAt: new Date(), updatedAt: new Date() };
      archiveEntries.set(entry.id, entry);
      return entry;
    },
    async listStorySeeds(worldId) { return [...storySeeds.values()].filter((seed) => seed.worldId === worldId); },
    async createStorySeed(input) {
      const seed = { id: `seed_${storySeeds.size + 1}`, ...input, createdAt: new Date(), updatedAt: new Date() };
      storySeeds.set(seed.id, seed);
      return seed;
    },
    async listConflicts(worldId) { return [...conflicts.values()].filter((conflict) => conflict.worldId === worldId); },
    async createConflict(input) {
      const conflict = { id: `conflict_${conflicts.size + 1}`, ...input, createdAt: new Date(), updatedAt: new Date() };
      conflicts.set(conflict.id, conflict);
      return conflict;
    },
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
