import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { OUTBOX_REPOSITORY, type OutboxEventRecord, type OutboxRepository } from "../src/modules/outbox/outbox.repository";
import { ReleasesModule } from "../src/modules/releases/releases.module";
import { RepositoryModule } from "../src/modules/repositories/repository.module";
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

describe("release and fork sync endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("preflights and blocks publishing worlds without saved assets", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Empty World",
      type: "科幻",
      summary: "还没有保存资产。",
      tags: [],
      mode: "cloud",
    });
    app = await createTestApp(auth, worlds, repositories);

    const preview = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/releases/preview`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "准备发布", license: "free-fork-attribution" })
      .expect(201);

    expect(preview.body.preflight.ok).toBe(false);
    expect(preview.body.preflight.checks).toContainEqual(expect.objectContaining({ code: "assets", ok: false }));

    await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "准备发布", license: "free-fork-attribution" })
      .expect(400);
  });

  it("publishes release changes and rolls a release back", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Rollback World",
      type: "奇幻",
      summary: "需要回滚能力。",
      tags: ["rollback"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "第一条规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories);

    const publish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);

    expect(publish.body.release).toMatchObject({ status: "published", version: "v1.0.0" });
    expect(publish.body.release.changes).toContainEqual(expect.objectContaining({ kind: "added", title: "第一条规则" }));

    const rollback = await request(app.getHttpServer())
      .post(`/v1/releases/${publish.body.release.id}/rollback`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    expect(rollback.body.release.status).toBe("rolled_back");
  });

  it("previews, syncs, and detaches a fork from upstream releases", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Fork Sync World",
      type: "科幻",
      summary: "上游会更新。",
      tags: ["sync"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: source.id, title: "基础规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories);

    const firstPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);
    const fork = await request(app.getHttpServer())
      .post(`/v1/repositories/${firstPublish.body.repository.id}/fork`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    await worlds.createArchiveEntry({ worldId: source.id, title: "新增上游规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "补充发布", license: "free-fork-attribution" })
      .expect(201);

    const diff = await request(app.getHttpServer())
      .get(`/v1/forks/${fork.body.fork.id}/upstream-diff`)
      .set("authorization", "Bearer session_user_2")
      .expect(200);
    expect(diff.body.diff.hasUpstreamChanges).toBe(true);
    expect(diff.body.diff.changes).toContainEqual(expect.objectContaining({ kind: "added", title: "新增上游规则" }));

    const sync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);
    expect(sync.body.sync.applied).toContainEqual(expect.objectContaining({ title: "新增上游规则" }));
    expect(await worlds.listArchiveEntries(fork.body.world.id)).toHaveLength(2);

    const detach = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/detach`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);
    expect(detach.body.fork).toEqual({ forkId: fork.body.fork.id, detached: true });
    expect(await repositories.findForkById(fork.body.fork.id)).toBeNull();
  });
});

async function createTestApp(
  authRepository: AuthRepository,
  worldRepository: WorldRepository,
  repositoryRepository: RepositoryRepository,
  outboxRepository: OutboxRepository = createInMemoryOutboxRepository(),
  searchClient: RepositorySearchClient = createInMemorySearchClient(),
) {
  const moduleRef = await Test.createTestingModule({
    imports: [RepositoryModule, ReleasesModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(WORLD_REPOSITORY)
    .useValue(worldRepository)
    .overrideProvider(REPOSITORY_REPOSITORY)
    .useValue(repositoryRepository)
    .overrideProvider(OUTBOX_REPOSITORY)
    .useValue(outboxRepository)
    .overrideProvider(REPOSITORY_SEARCH_CLIENT)
    .useValue(searchClient)
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
        coverObjectId: null,
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

function createInMemoryRepositoryRepository() {
  const repositories = new Map<string, PublicRepositoryRecord>();
  const releases = new Map<string, ReleaseRecord>();
  const snapshots = new Map<string, ReleaseSnapshotRecord>();
  const forks: ForkRecord[] = [];
  const collections = new Map<string, any>();
  const repository: RepositoryRepository = {
    async findById(id) { return repositories.get(id) ?? null; },
    async findByWorldId(worldId) { return [...repositories.values()].find((item) => item.worldId === worldId) ?? null; },
    async createRepository(input) {
      const now = new Date();
      const record = { id: `repo_${repositories.size + 1}`, moderationStatus: "visible" as const, moderationReason: null, moderatedAt: null, stars: 0, forks: 0, createdAt: now, updatedAt: now, ...input };
      repositories.set(record.id, record);
      return record;
    },
    async updateRepository(id, input) { const record = repositories.get(id); if (!record) return null; const next = { ...record, ...input, updatedAt: new Date() }; repositories.set(id, next); return next; },
    async setModerationStatus(id, input) { const record = repositories.get(id); if (!record) return null; const next = { ...record, moderationStatus: input.status, moderationReason: input.reason ?? null, moderatedAt: input.moderatedAt, updatedAt: new Date() }; repositories.set(id, next); return next; },
    async listPublic() { return [...repositories.values()].filter((item) => item.moderationStatus !== "removed"); },
    async findPublicByOwnerSlug(ownerName, slug) { return [...repositories.values()].find((item) => item.ownerName === ownerName && item.slug === slug && item.moderationStatus !== "removed") ?? null; },
    async createRelease(input) {
      const release = { id: `rel_${releases.size + 1}`, createdAt: new Date(), status: input.status ?? "published", changes: input.changes ?? [], ...input };
      releases.set(release.id, release);
      return release;
    },
    async findReleaseById(id) { return releases.get(id) ?? null; },
    async updateReleaseStatus(id, status) { const release = releases.get(id); if (!release) return null; const next = { ...release, status }; releases.set(id, next); return next; },
    async listReleases(repositoryId) { return [...releases.values()].filter((release) => release.repositoryId === repositoryId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); },
    async createSnapshot(input) { const snapshot = { id: `snap_${snapshots.size + 1}`, createdAt: new Date(), ...input }; snapshots.set(snapshot.id, snapshot); return snapshot; },
    async findSnapshotByReleaseId(releaseId) { return [...snapshots.values()].find((snapshot) => snapshot.releaseId === releaseId) ?? null; },
    async starRepository(repositoryId) { return repositories.get(repositoryId) ?? null; },
    async unstarRepository(repositoryId) { return repositories.get(repositoryId) ?? null; },
    async createFork(input) {
      const fork = { id: `fork_${forks.length + 1}`, createdAt: new Date(), ...input };
      forks.push(fork);
      const repo = repositories.get(input.repositoryId);
      if (repo) repositories.set(repo.id, { ...repo, forks: repo.forks + 1, updatedAt: new Date() });
      return fork;
    },
    async findForkById(id) { return forks.find((fork) => fork.id === id) ?? null; },
    async updateForkSourceRelease(id, sourceReleaseId) { const fork = forks.find((item) => item.id === id); if (!fork) return null; fork.sourceReleaseId = sourceReleaseId; return fork; },
    async deleteFork(id) {
      const index = forks.findIndex((fork) => fork.id === id);
      if (index === -1) return null;
      const [fork] = forks.splice(index, 1);
      return fork;
    },
    async listForksForRepository(repositoryId) { return forks.filter((fork) => fork.repositoryId === repositoryId); },
    async saveToCollection(input) {
      const name = input.name ?? "saved";
      const existing = [...collections.values()].find((item) =>
        item.repositoryId === input.repositoryId && item.userId === input.userId && item.name === name);
      if (existing) return existing;
      const collection = { id: `collection_${collections.size + 1}`, createdAt: new Date(), name, ...input };
      collections.set(collection.id, collection);
      return collection;
    },
    async removeFromCollection(input) {
      const collection = collections.get(input.collectionId);
      if (!collection || collection.repositoryId !== input.repositoryId || collection.userId !== input.userId) return null;
      collections.delete(collection.id);
      return collection;
    },
    async listCollectionsForUser(userId) {
      return [...collections.values()].filter((collection) => collection.userId === userId);
    },
  };
  return repository;
}

function createInMemoryOutboxRepository() {
  const events: OutboxEventRecord[] = [];
  return {
    events,
    async createEvent(input: Omit<OutboxEventRecord, "id" | "createdAt" | "processedAt">) {
      const event = { id: `out_${events.length + 1}`, createdAt: new Date(), processedAt: null, ...input };
      events.push(event);
      return event;
    },
    async listPending() { return events.filter((event) => !event.processedAt); },
    async markProcessed(id: string, processedAt: Date) { const event = events.find((item) => item.id === id); if (!event) return null; event.processedAt = processedAt; return event; },
  } satisfies OutboxRepository & { events: typeof events };
}

function createInMemorySearchClient() {
  return {
    async search() {
      return [];
    },
  } satisfies RepositorySearchClient;
}
