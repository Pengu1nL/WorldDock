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

describe("world endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates, lists, reads, updates, and hides deleted owner worlds", async () => {
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

    await request(app.getHttpServer())
      .get(`/v1/worlds/${worldId}`)
      .set("authorization", "Bearer session_user_1")
      .expect(404);

    const afterDelete = await request(app.getHttpServer())
      .get("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(afterDelete.body.worlds).toHaveLength(0);
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

  it("duplicates a cloud world with its persisted assets", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const archiveTitle = "《记忆交易法》";
    const seedTitle = "被继承的童年";
    const conflictTitle = "记忆人格权 vs 记忆财产权";
    addSession(auth, "session_user_1", "user_1");
    app = await createTestApp(auth, worlds);

    const { body } = await request(app.getHttpServer())
      .post("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .send({
        name: "回忆所",
        type: "近未来",
        summary: "记忆可以被买卖。",
        tags: ["记忆"],
        mode: "cloud",
      })
      .expect(201);
    const originalWorldId = body.world.id;

    const originalSeed = await request(app.getHttpServer())
      .post(`/v1/worlds/${originalWorldId}/seeds`)
      .set("authorization", "Bearer session_user_1")
      .send({
        title: seedTitle,
        hook: "她继承了一段陌生童年。",
        conflict: "人格权与继承权冲突。",
      })
      .expect(201);
    const originalSeedId = originalSeed.body.storySeed.id;

    const originalArchiveEntry = await request(app.getHttpServer())
      .post(`/v1/worlds/${originalWorldId}/archive`)
      .set("authorization", "Bearer session_user_1")
      .send({
        title: archiveTitle,
        category: "世界规则",
        summary: "确立记忆资产交易制度。",
        body: "只有认证机构可以主持记忆交易。",
        relations: [originalSeedId, "制度"],
      })
      .expect(201);
    const originalArchiveId = originalArchiveEntry.body.archiveEntry.id;

    await request(app.getHttpServer())
      .post(`/v1/worlds/${originalWorldId}/conflicts`)
      .set("authorization", "Bearer session_user_1")
      .send({
        title: conflictTitle,
        summary: "个人身份与交易制度之间的冲突。",
        body: "记忆一旦成为资产，人是否还能完整拥有自己。",
        related: [originalArchiveId, "市场制度"],
        derivedSeeds: [originalSeedId],
      })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post(`/v1/worlds/${originalWorldId}/duplicate`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    const duplicateWorldId = duplicate.body.world.id;

    expect(duplicate.body.world).toMatchObject({
      name: "回忆所 · 副本",
    });

    const duplicateArchive = await request(app.getHttpServer())
      .get(`/v1/worlds/${duplicateWorldId}/archive`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    const duplicateSeeds = await request(app.getHttpServer())
      .get(`/v1/worlds/${duplicateWorldId}/seeds`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    const duplicateConflicts = await request(app.getHttpServer())
      .get(`/v1/worlds/${duplicateWorldId}/conflicts`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    const originalArchive = await request(app.getHttpServer())
      .get(`/v1/worlds/${originalWorldId}/archive`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    const originalSeeds = await request(app.getHttpServer())
      .get(`/v1/worlds/${originalWorldId}/seeds`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    const originalConflicts = await request(app.getHttpServer())
      .get(`/v1/worlds/${originalWorldId}/conflicts`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(duplicateArchive.body.archiveEntries).toHaveLength(1);
    expect(duplicateArchive.body.archiveEntries[0]).toMatchObject({ title: archiveTitle, worldId: duplicateWorldId });
    expect(duplicateSeeds.body.storySeeds).toHaveLength(1);
    expect(duplicateSeeds.body.storySeeds[0]).toMatchObject({ title: seedTitle, worldId: duplicateWorldId });
    expect(duplicateConflicts.body.conflicts).toHaveLength(1);
    expect(duplicateConflicts.body.conflicts[0]).toMatchObject({ title: conflictTitle, worldId: duplicateWorldId });

    const duplicateArchiveId = duplicateArchive.body.archiveEntries[0].id;
    const duplicateSeedId = duplicateSeeds.body.storySeeds[0].id;
    expect(duplicateArchiveId).not.toBe(originalArchiveId);
    expect(duplicateSeedId).not.toBe(originalSeedId);
    expect(duplicateArchive.body.archiveEntries[0].relations).toEqual([duplicateSeedId, "制度"]);
    expect(duplicateConflicts.body.conflicts[0].related).toEqual([duplicateArchiveId, "市场制度"]);
    expect(duplicateConflicts.body.conflicts[0].derivedSeeds).toEqual([duplicateSeedId]);

    expect(originalArchive.body.archiveEntries).toHaveLength(1);
    expect(originalArchive.body.archiveEntries[0]).toMatchObject({ title: archiveTitle, worldId: originalWorldId });
    expect(originalSeeds.body.storySeeds).toHaveLength(1);
    expect(originalSeeds.body.storySeeds[0]).toMatchObject({ title: seedTitle, worldId: originalWorldId });
    expect(originalConflicts.body.conflicts).toHaveLength(1);
    expect(originalConflicts.body.conflicts[0]).toMatchObject({ title: conflictTitle, worldId: originalWorldId });
    expect(originalArchive.body.archiveEntries[0].relations).toEqual([originalSeedId, "制度"]);
    expect(originalConflicts.body.conflicts[0].related).toEqual([originalArchiveId, "市场制度"]);
    expect(originalConflicts.body.conflicts[0].derivedSeeds).toEqual([originalSeedId]);

    expect(duplicate.body.world).toMatchObject({
      archive: 1,
      seeds: 1,
      conflicts: 1,
    });
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
        deletedAt: null,
      };
      worlds.set(world.id, world);
      return world;
    },
    async listWorlds(ownerId) { return [...worlds.values()].filter((world) => world.ownerId === ownerId && !world.deletedAt); },
    async findWorldById(id) {
      const world = worlds.get(id);
      return world && !world.deletedAt ? world : null;
    },
    async updateWorld(id, input) {
      const world = worlds.get(id);
      if (!world || world.deletedAt) return null;
      const next = { ...world, ...input, updatedAt: new Date() };
      worlds.set(id, next);
      return next;
    },
    async deleteWorld(id) {
      return this.updateWorld(id, { status: "unpublished", deletedAt: new Date() });
    },
    async duplicateWorldAssets(input) {
      const { sourceWorldId, targetWorldId } = input;
      const idMap = new Map<string, string>();
      const copiedArchiveIds: string[] = [];
      const copiedConflictIds: string[] = [];

      for (const entry of [...archiveEntries.values()].filter((item) => item.worldId === sourceWorldId)) {
        const now = new Date();
        const copy = {
          ...entry,
          id: `archive_${archiveEntries.size + 1}`,
          worldId: targetWorldId,
          createdAt: now,
          updatedAt: now,
        };
        archiveEntries.set(copy.id, copy);
        idMap.set(entry.id, copy.id);
        copiedArchiveIds.push(copy.id);
      }

      for (const seed of [...storySeeds.values()].filter((item) => item.worldId === sourceWorldId)) {
        const now = new Date();
        const copy = {
          ...seed,
          id: `seed_${storySeeds.size + 1}`,
          worldId: targetWorldId,
          createdAt: now,
          updatedAt: now,
        };
        storySeeds.set(copy.id, copy);
        idMap.set(seed.id, copy.id);
      }

      for (const conflict of [...conflicts.values()].filter((item) => item.worldId === sourceWorldId)) {
        const now = new Date();
        const copy = {
          ...conflict,
          id: `conflict_${conflicts.size + 1}`,
          worldId: targetWorldId,
          createdAt: now,
          updatedAt: now,
        };
        conflicts.set(copy.id, copy);
        idMap.set(conflict.id, copy.id);
        copiedConflictIds.push(copy.id);
      }

      for (const archiveId of copiedArchiveIds) {
        const entry = archiveEntries.get(archiveId);
        if (entry) archiveEntries.set(archiveId, { ...entry, relations: remapInMemoryAssetIds(entry.relations, idMap) });
      }

      for (const conflictId of copiedConflictIds) {
        const conflict = conflicts.get(conflictId);
        if (conflict) {
          conflicts.set(conflictId, {
            ...conflict,
            related: remapInMemoryAssetIds(conflict.related, idMap),
            derivedSeeds: remapInMemoryAssetIds(conflict.derivedSeeds, idMap),
          });
        }
      }
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
    async listAssetRelations() { return []; },
    async countAssets(worldId) {
      return {
        archive: [...archiveEntries.values()].filter((entry) => entry.worldId === worldId).length,
        seeds: [...storySeeds.values()].filter((seed) => seed.worldId === worldId).length,
        conflicts: [...conflicts.values()].filter((conflict) => conflict.worldId === worldId).length,
      };
    },
    async replaceWorldFromSnapshot() { return null; },
    async createAssetFromSnapshot() { return null; },
    async remapForkAssetReferences() { return; },
    async replaceForkAssetRelationsFromSnapshot() { return true; },
    async forkAssetRelationsMatchSnapshot() { return true; },
    async applyForkSnapshotChange(input) { return { status: "skipped", change: input.change, reason: "missing_source" }; },
  };

  return repository;
}

function remapInMemoryAssetIds(values: string[] | undefined, idMap: Map<string, string>) {
  return values?.map((value) => idMap.get(value) ?? value);
}
