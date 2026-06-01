import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, hashToken, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { ExportsModule } from "../src/modules/exports/exports.module";
import { OUTBOX_REPOSITORY, type OutboxRepository } from "../src/modules/outbox/outbox.repository";
import {
  REPOSITORY_REPOSITORY,
  type ForkRecord,
  type PublicRepositoryRecord,
  type ReleaseRecord,
  type ReleaseSnapshotRecord,
  type RepositoryRepository,
} from "../src/modules/repositories/repository.repository";
import { REPOSITORY_SEARCH_CLIENT, type RepositorySearchClient } from "../src/modules/repositories/repository-search.client";
import {
  WORLD_REPOSITORY,
  type ArchiveEntryRecord,
  type ConflictRecord,
  type StorySeedRecord,
  type WorldRecord,
  type WorldRepository,
} from "../src/modules/worlds/world.repository";

describe("exports endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("exports a world package, imports it, and returns account export data", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Export World",
      type: "奇幻",
      summary: "可以导入导出的世界。",
      tags: ["export"],
      mode: "cloud",
      maturity: 66,
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "规则", category: "设定", summary: "摘要", body: "正文", relations: ["seed_1"] });
    await worlds.createStorySeed({ worldId: world.id, title: "种子", hook: "钩子", trigger: "触发", conflict: "冲突", protagonists: "主角", questions: ["问题"] });
    await worlds.createConflict({ worldId: world.id, title: "冲突", summary: "摘要", body: "正文", related: [], derivedSeeds: [] });
    app = await createTestApp(auth, worlds, repositories);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/export`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    expect(created.body.export).toMatchObject({ kind: "world", status: "ready" });

    await request(app.getHttpServer())
      .get(`/v1/exports/${created.body.export.id}`)
      .set("authorization", "Bearer session_user_2")
      .expect(403);

    const loaded = await request(app.getHttpServer())
      .get(`/v1/exports/${created.body.export.id}`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(loaded.body.package).toMatchObject({
      format: "worlddock.world-package.v1",
      world: { name: "Export World", maturity: 66 },
    });
    expect(loaded.body.package.assets.map((asset: any) => asset.kind)).toEqual(["setting", "seed", "conflict"]);

    const imported = await request(app.getHttpServer())
      .post("/v1/worlds/import")
      .set("authorization", "Bearer session_user_1")
      .send({ package: loaded.body.package })
      .expect(201);
    expect(imported.body.world).toMatchObject({ name: "Export World", archive: 1, seeds: 1, conflicts: 1, visibility: "private" });

    const accountExport = await request(app.getHttpServer())
      .post("/v1/account/data-export")
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    const accountData = await request(app.getHttpServer())
      .get(`/v1/account/data-export/${accountExport.body.export.id}`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(accountData.body.data).toMatchObject({
      format: "worlddock.account-export.v1",
      user: { id: "user_1", email: "user_1@example.com" },
    });
    expect(accountData.body.data.worlds).toHaveLength(2);
  });

  it("enforces world package access token scopes", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addAccessToken(auth, "wdl_world_read", "user_1", "ren", ["world:read"]);
    addAccessToken(auth, "wdl_world_write", "user_1", "ren", ["world:write"]);
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Scoped Export World",
      type: "奇幻",
      summary: "验证 PAT scope 的世界。",
      tags: ["scope"],
      mode: "cloud",
      maturity: 51,
    });
    app = await createTestApp(auth, worlds, repositories);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/export`)
      .set("authorization", "Bearer wdl_world_read")
      .expect(201);

    const loaded = await request(app.getHttpServer())
      .get(`/v1/exports/${created.body.export.id}`)
      .set("authorization", "Bearer wdl_world_read")
      .expect(200);

    expect(loaded.body.package).toMatchObject({
      format: "worlddock.world-package.v1",
      world: { name: "Scoped Export World" },
    });

    await request(app.getHttpServer())
      .post("/v1/worlds/import")
      .set("authorization", "Bearer wdl_world_read")
      .send({ package: loaded.body.package })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/export`)
      .set("authorization", "Bearer wdl_world_write")
      .expect(403);

    const imported = await request(app.getHttpServer())
      .post("/v1/worlds/import")
      .set("authorization", "Bearer wdl_world_write")
      .send({ package: loaded.body.package })
      .expect(201);

    expect(imported.body.world).toMatchObject({
      name: "Scoped Export World",
      visibility: "private",
    });
  });
});

async function createTestApp(
  authRepository: AuthRepository,
  worldRepository: WorldRepository,
  repositoryRepository: RepositoryRepository,
) {
  const moduleRef = await Test.createTestingModule({
    imports: [ExportsModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(WORLD_REPOSITORY)
    .useValue(worldRepository)
    .overrideProvider(REPOSITORY_REPOSITORY)
    .useValue(repositoryRepository)
    .overrideProvider(OUTBOX_REPOSITORY)
    .useValue(createInMemoryOutboxRepository())
    .overrideProvider(REPOSITORY_SEARCH_CLIENT)
    .useValue(createInMemorySearchClient())
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function addSession(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string, name: string) {
  repository.users.set(userId, { id: userId, email: `${userId}@example.com`, name, role: "user" });
  repository.sessions.set(token, { token, userId, expiresAt: new Date(Date.now() + 60_000) });
}

function addAccessToken(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string, name: string, scopes: string[]) {
  const now = new Date();
  repository.users.set(userId, { id: userId, email: `${userId}@example.com`, name, role: "user" });
  repository.accessTokens.set(`at_${token}`, {
    id: `at_${token}`,
    userId,
    name: token,
    tokenHash: hashToken(token),
    prefix: token.slice(0, 8),
    scopes,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: now,
  });
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
    async listAccessTokens() { return []; },
    async createAccessToken(input: StoredAccessToken) { accessTokens.set(input.id, input); return input; },
    async findAccessTokenByHash(tokenHash: string) {
      return [...accessTokens.values()].find((token) => token.tokenHash === tokenHash) ?? null;
    },
    async markAccessTokenUsed(id: string, usedAt: Date) {
      const token = accessTokens.get(id);
      if (token) token.lastUsedAt = usedAt;
    },
    async revokeAccessToken() { return null; },
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
      const world: WorldRecord = { id: `world_${worlds.size + 1}`, ownerId: input.ownerId, name: input.name, type: input.type, summary: input.summary, tags: input.tags, status: "draft", visibility: "private", mode: input.mode, maturity: input.maturity ?? 0, coverObjectId: null, createdAt: now, updatedAt: now, deletedAt: null };
      worlds.set(world.id, world);
      return world;
    },
    async listWorlds(ownerId) { return [...worlds.values()].filter((world) => world.ownerId === ownerId && !world.deletedAt); },
    async findWorldById(id) { const world = worlds.get(id); return world && !world.deletedAt ? world : null; },
    async updateWorld(id, input) { const world = worlds.get(id); if (!world || world.deletedAt) return null; const next = { ...world, ...input, updatedAt: new Date() }; worlds.set(id, next); return next; },
    async deleteWorld(id) { const world = worlds.get(id); if (!world || world.deletedAt) return null; const next = { ...world, status: "unpublished" as const, deletedAt: new Date(), updatedAt: new Date() }; worlds.set(id, next); return next; },
    async duplicateWorldAssets() { return; },
    async listArchiveEntries(worldId) { return [...archiveEntries.values()].filter((entry) => entry.worldId === worldId); },
    async createArchiveEntry(input) { const entry = { id: `archive_${archiveEntries.size + 1}`, ...input, relations: input.relations ?? [], createdAt: new Date(), updatedAt: new Date() }; archiveEntries.set(entry.id, entry); return entry; },
    async listStorySeeds(worldId) { return [...storySeeds.values()].filter((seed) => seed.worldId === worldId); },
    async createStorySeed(input) { const seed = { id: `seed_${storySeeds.size + 1}`, ...input, questions: input.questions ?? [], createdAt: new Date(), updatedAt: new Date() }; storySeeds.set(seed.id, seed); return seed; },
    async listConflicts(worldId) { return [...conflicts.values()].filter((conflict) => conflict.worldId === worldId); },
    async createConflict(input) { const conflict = { id: `conflict_${conflicts.size + 1}`, ...input, related: input.related ?? [], derivedSeeds: input.derivedSeeds ?? [], createdAt: new Date(), updatedAt: new Date() }; conflicts.set(conflict.id, conflict); return conflict; },
    async listAssetRelations() { return []; },
    async countAssets(worldId) { return { archive: [...archiveEntries.values()].filter((entry) => entry.worldId === worldId).length, seeds: [...storySeeds.values()].filter((seed) => seed.worldId === worldId).length, conflicts: [...conflicts.values()].filter((conflict) => conflict.worldId === worldId).length }; },
    async replaceWorldFromSnapshot() { return null; },
    async createAssetFromSnapshot() { return null; },
    async remapForkAssetReferences() { return; },
    async replaceForkAssetRelationsFromSnapshot() { return true; },
    async forkAssetRelationsMatchSnapshot() { return true; },
    async applyForkSnapshotChange(input) { return { status: "skipped", change: input.change, reason: "missing_source" }; },
  };
  return repository;
}

function createInMemoryRepositoryRepository() {
  const repositories = new Map<string, PublicRepositoryRecord>();
  const releases = new Map<string, ReleaseRecord>();
  const snapshots = new Map<string, ReleaseSnapshotRecord>();
  const forks: ForkRecord[] = [];
  const assetMaps = new Map<string, any>();
  const collections = new Map<string, any>();
  const repository: RepositoryRepository = {
    async findById(id) { return repositories.get(id) ?? null; },
    async findByWorldId(worldId) { return [...repositories.values()].find((item) => item.worldId === worldId) ?? null; },
    async createRepository(input) { const now = new Date(); const record = { id: `repo_${repositories.size + 1}`, moderationStatus: "visible" as const, moderationReason: null, moderatedAt: null, stars: 0, forks: 0, createdAt: now, updatedAt: now, ...input }; repositories.set(record.id, record); return record; },
    async updateRepository(id, input) { const record = repositories.get(id); if (!record) return null; const next = { ...record, ...input, updatedAt: new Date() }; repositories.set(id, next); return next; },
    async setModerationStatus(id, input) { const record = repositories.get(id); if (!record) return null; const next = { ...record, moderationStatus: input.status, moderationReason: input.reason ?? null, moderatedAt: input.moderatedAt, updatedAt: new Date() }; repositories.set(id, next); return next; },
    async listPublic() { return [...repositories.values()].filter((item) => item.moderationStatus !== "removed"); },
    async findPublicByOwnerSlug(ownerName, slug) { return [...repositories.values()].find((item) => item.ownerName === ownerName && item.slug === slug && item.moderationStatus !== "removed") ?? null; },
    async createRelease(input) { const release = { id: `rel_${releases.size + 1}`, createdAt: new Date(), status: input.status ?? "published", changes: input.changes ?? [], ...input }; releases.set(release.id, release); return release; },
    async findReleaseById(id) { return releases.get(id) ?? null; },
    async updateReleaseStatus(id, status) { const release = releases.get(id); if (!release) return null; const next = { ...release, status }; releases.set(id, next); return next; },
    async listReleases(repositoryId) { return [...releases.values()].filter((release) => release.repositoryId === repositoryId); },
    async createSnapshot(input) { const snapshot = { id: `snap_${snapshots.size + 1}`, createdAt: new Date(), ...input }; snapshots.set(snapshot.id, snapshot); return snapshot; },
    async findSnapshotByReleaseId(releaseId) { return [...snapshots.values()].find((snapshot) => snapshot.releaseId === releaseId) ?? null; },
    async starRepository(repositoryId) { return repositories.get(repositoryId) ?? null; },
    async unstarRepository(repositoryId) { return repositories.get(repositoryId) ?? null; },
    async createFork(input) { const fork = { id: `fork_${forks.length + 1}`, createdAt: new Date(), ...input }; forks.push(fork); return fork; },
    async findForkById(id) { return forks.find((fork) => fork.id === id) ?? null; },
    async updateForkSourceRelease(id, sourceReleaseId) { const fork = forks.find((item) => item.id === id); if (!fork) return null; fork.sourceReleaseId = sourceReleaseId; return fork; },
    async deleteFork(id) { const index = forks.findIndex((fork) => fork.id === id); if (index === -1) return null; const [fork] = forks.splice(index, 1); return fork; },
    async listForksForRepository(repositoryId) { return forks.filter((fork) => fork.repositoryId === repositoryId); },
    async createForkAssetMaps(input) { return Promise.all(input.map((map) => repository.upsertForkAssetMap(map))); },
    async listForkAssetMaps(forkId) { return [...assetMaps.values()].filter((map) => map.forkId === forkId); },
    async upsertForkAssetMap(input) { const now = new Date(); const key = `${input.forkId}:${input.upstreamAssetId}`; const next = { ...(assetMaps.get(key) ?? { id: `fork_asset_map_${assetMaps.size + 1}`, createdAt: now }), ...input, updatedAt: now }; assetMaps.set(key, next); return next; },
    async deleteForkAssetMap(forkId, upstreamAssetId) { const key = `${forkId}:${upstreamAssetId}`; const existing = assetMaps.get(key) ?? null; assetMaps.delete(key); return existing; },
    async saveToCollection(input) { const collection = { id: `collection_${collections.size + 1}`, createdAt: new Date(), name: input.name ?? "saved", ...input }; collections.set(collection.id, collection); return collection; },
    async removeFromCollection(input) { const collection = collections.get(input.collectionId); if (!collection) return null; collections.delete(collection.id); return collection; },
    async listCollectionsForUser(userId) { return [...collections.values()].filter((collection) => collection.userId === userId); },
  };
  return repository;
}

function createInMemoryOutboxRepository() {
  return {
    async createEvent() { throw new Error("Not implemented for export tests."); },
    async listPending() { return []; },
    async markProcessed() { return null; },
  } satisfies OutboxRepository;
}

function createInMemorySearchClient() {
  return { async search() { return []; } } satisfies RepositorySearchClient;
}
