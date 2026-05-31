import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { ReleaseSnapshot } from "@worlddock/domain";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { CommunityModule } from "../src/modules/community/community.module";
import { OUTBOX_REPOSITORY, type OutboxEventRecord, type OutboxRepository } from "../src/modules/outbox/outbox.repository";
import {
  REPOSITORY_REPOSITORY,
  type ForkRecord,
  type PublicRepositoryRecord,
  type ReleaseRecord,
  type ReleaseSnapshotRecord,
  type RepositoryRepository,
} from "../src/modules/repositories/repository.repository";
import { REPOSITORY_SEARCH_CLIENT, type RepositorySearchClient } from "../src/modules/repositories/repository-search.client";
import { WORLD_REPOSITORY, type WorldRepository } from "../src/modules/worlds/world.repository";

describe("community endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("lists, filters, and renders public repository detail from release snapshots", async () => {
    const auth = createInMemoryAuthRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_2", "user_2", "lin");
    const visible = await seedRepository(repositories, {
      ownerId: "user_1",
      ownerName: "ren",
      name: "Memory Market",
      slug: "memory-market",
      tags: ["记忆", "交易"],
    });
    const removed = await seedRepository(repositories, {
      ownerId: "user_3",
      ownerName: "kai",
      name: "Removed World",
      slug: "removed-world",
      tags: ["记忆"],
    });
    await repositories.setModerationStatus(removed.id, { status: "removed", reason: "manual", moderatedAt: new Date() });
    await repositories.createFork({
      repositoryId: visible.id,
      sourceReleaseId: "rel_1",
      targetWorldId: "world_fork",
      userId: "user_2",
      licenseSnapshot: "free-fork-attribution",
    });
    app = await createTestApp(auth, repositories);

    const list = await request(app.getHttpServer())
      .get("/v1/community/repositories")
      .query({ q: "memory", tag: "记忆", sort: "updated" })
      .expect(200);
    expect(list.body.repositories.map((repository: any) => repository.slug)).toEqual(["memory-market"]);
    expect(list.body.nextCursor).toBeNull();
    expect(JSON.stringify(list.body)).not.toContain("removed-world");

    const detail = await request(app.getHttpServer())
      .get("/v1/community/repositories/ren/memory-market")
      .expect(200);
    expect(detail.body.repository).toMatchObject({
      owner: "ren",
      slug: "memory-market",
      latestRelease: { version: "v1.0.0" },
      assetCounts: { archive: 1, seeds: 1, conflicts: 1 },
    });
    expect(detail.body.repository.releaseHistory[0]).toMatchObject({ id: "rel_1", version: "v1.0.0" });
    expect(detail.body.repository.forkGraph.forks).toHaveLength(1);
    expect(detail.body.repository.forkGraph.forks[0].ownedByCurrentUser).not.toBe(true);

    const ownerDetail = await request(app.getHttpServer())
      .get("/v1/community/repositories/ren/memory-market")
      .set("authorization", "Bearer session_user_2")
      .expect(200);
    expect(ownerDetail.body.repository.forkGraph.forks[0]).toMatchObject({
      id: "fork_1",
      userId: "user_2",
      ownedByCurrentUser: true,
    });

    const invalidBearerDetail = await request(app.getHttpServer())
      .get("/v1/community/repositories/ren/memory-market")
      .set("authorization", "Bearer invalid-session")
      .expect(200);
    expect(invalidBearerDetail.body.repository.forkGraph.forks[0].ownedByCurrentUser).not.toBe(true);

    const assets = await request(app.getHttpServer())
      .get(`/v1/community/repositories/${visible.id}/assets`)
      .query({ kind: "archive" })
      .expect(200);
    expect(assets.body).toMatchObject({ repositoryId: visible.id, releaseId: "rel_1", nextCursor: null });
    expect(assets.body.assets).toEqual([
      expect.objectContaining({ assetId: "archive:archive_1", kind: "archive", title: "交易法" }),
    ]);

    const creator = await request(app.getHttpServer())
      .get("/v1/community/creators/ren")
      .expect(200);
    expect(creator.body.creator).toMatchObject({
      handle: "ren",
      displayName: "ren",
      stats: { repositories: 1, forks: 1 },
    });

    const creatorRepositories = await request(app.getHttpServer())
      .get("/v1/community/creators/ren/repositories")
      .expect(200);
    expect(creatorRepositories.body.repositories[0].slug).toBe("memory-market");

    const collection = await request(app.getHttpServer())
      .post(`/v1/community/repositories/${visible.id}/collections`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post(`/v1/community/repositories/${visible.id}/collections`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);
    expect(duplicate.body.collection.id).toBe(collection.body.collection.id);

    await request(app.getHttpServer())
      .delete(`/v1/community/repositories/${visible.id}/collections/${collection.body.collection.id}`)
      .set("authorization", "Bearer session_user_2")
      .expect(200);
  });

  it("does not expose assets from unpublished release snapshots", async () => {
    const auth = createInMemoryAuthRepository();
    const repositories = createInMemoryRepositoryRepository();
    const visible = await repositories.createRepository({
      worldId: null,
      ownerId: "user_1",
      ownerName: "ren",
      slug: "draft-market",
      name: "Draft Market",
      summary: "草稿资产不应公开。",
      tags: ["草稿"],
      license: "free-fork-attribution",
    });
    const draft = await repositories.createRelease({
      repositoryId: visible.id,
      version: "v1.0.0",
      status: "draft",
      note: "草稿",
      license: "free-fork-attribution",
      diff: { addedSettings: 1, changedSettings: 0, removedSettings: 0, addedSeeds: 1 },
      changes: [],
      source: "cloud-publish",
    });
    await repositories.createSnapshot({
      repositoryId: visible.id,
      releaseId: draft.id,
      snapshot: createSnapshotPayload(visible, draft.id),
    });
    const rolledBack = await repositories.createRelease({
      repositoryId: visible.id,
      version: "v1.0.1",
      status: "rolled_back",
      note: "回滚",
      license: "free-fork-attribution",
      diff: { addedSettings: 1, changedSettings: 0, removedSettings: 0, addedSeeds: 1 },
      changes: [],
      source: "cloud-publish",
    });
    await repositories.createSnapshot({
      repositoryId: visible.id,
      releaseId: rolledBack.id,
      snapshot: createSnapshotPayload(visible, rolledBack.id),
    });
    app = await createTestApp(auth, repositories);

    const detail = await request(app.getHttpServer())
      .get("/v1/community/repositories/ren/draft-market")
      .expect(200);
    expect(detail.body.repository).toMatchObject({
      assetCounts: { archive: 0, seeds: 0, conflicts: 0 },
    });
    expect(detail.body.repository.latestRelease).toBeNull();
    expect(detail.body.repository.releaseHistory).toEqual([]);
    expect(detail.body.repository.releases).toEqual([]);
    expect(JSON.stringify({
      latestRelease: detail.body.repository.latestRelease,
      releaseHistory: detail.body.repository.releaseHistory,
      releases: detail.body.repository.releases,
    })).not.toContain("draft");
    expect(JSON.stringify({
      latestRelease: detail.body.repository.latestRelease,
      releaseHistory: detail.body.repository.releaseHistory,
      releases: detail.body.repository.releases,
    })).not.toContain("rolled_back");

    const assets = await request(app.getHttpServer())
      .get(`/v1/community/repositories/${visible.id}/assets`)
      .expect(200);
    expect(assets.body).toEqual({
      repositoryId: visible.id,
      releaseId: null,
      assets: [],
      nextCursor: null,
    });
  });

  it("does not hide optional auth infrastructure failures as anonymous community detail", async () => {
    const auth = createInMemoryAuthRepository();
    const repositories = createInMemoryRepositoryRepository();
    await seedRepository(repositories, {
      ownerId: "user_1",
      ownerName: "ren",
      name: "Memory Market",
      slug: "memory-market",
      tags: ["记忆"],
    });
    auth.findSessionByToken = async () => {
      throw new Error("auth store unavailable");
    };
    app = await createTestApp(auth, repositories);

    const response = await request(app.getHttpServer())
      .get("/v1/community/repositories/ren/memory-market")
      .set("authorization", "Bearer session_user_2")
      .expect(500);
    expect(response.body).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

async function createTestApp(authRepository: AuthRepository, repositoryRepository: RepositoryRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [CommunityModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(REPOSITORY_REPOSITORY)
    .useValue(repositoryRepository)
    .overrideProvider(OUTBOX_REPOSITORY)
    .useValue(createInMemoryOutboxRepository())
    .overrideProvider(WORLD_REPOSITORY)
    .useValue(createInMemoryWorldRepository())
    .overrideProvider(REPOSITORY_SEARCH_CLIENT)
    .useValue(createFallbackSearchClient())
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
    async findUserById(id: string) { return users.get(id) ?? null; },
    async findSessionByToken(token: string) { return sessions.get(token) ?? null; },
    async deleteSession(token: string) { sessions.delete(token); },
    async listAccessTokens() { return []; },
    async createAccessToken(input: StoredAccessToken) { accessTokens.set(input.id, input); return input; },
    async findAccessTokenByHash() { return null; },
    async markAccessTokenUsed() {},
    async revokeAccessToken() { return null; },
  } satisfies AuthRepository & { users: typeof users; sessions: typeof sessions };
}

async function seedRepository(
  repositories: RepositoryRepository,
  input: { ownerId: string; ownerName: string; name: string; slug: string; tags: string[] },
) {
  const repository = await repositories.createRepository({
    worldId: null,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    slug: input.slug,
    name: input.name,
    summary: "记忆可以被买卖。",
    tags: input.tags,
    license: "free-fork-attribution",
  });
  const release = await repositories.createRelease({
    repositoryId: repository.id,
    version: "v1.0.0",
    note: "初始发布",
    license: "free-fork-attribution",
    diff: { addedSettings: 1, changedSettings: 0, removedSettings: 0, addedSeeds: 1 },
    changes: [
      { assetId: "archive:archive_1", kind: "added", title: "交易法", afterHash: "a" },
      { assetId: "seed:seed_1", kind: "added", title: "继承的童年", afterHash: "b" },
    ],
    source: "cloud-publish",
  });
  await repositories.createSnapshot({
    repositoryId: repository.id,
    releaseId: release.id,
    snapshot: createSnapshotPayload(repository, release.id),
  });
  return repository;
}

function createSnapshotPayload(repository: PublicRepositoryRecord, releaseId: string): ReleaseSnapshot {
  return {
    repositoryId: repository.id,
    releaseId,
    world: { name: repository.name, type: "近未来", summary: repository.summary, tags: repository.tags, maturity: 64 },
    archiveEntries: [{ id: "archive_1", title: "交易法", category: "世界规则", summary: "摘要", body: "正文", relations: [] }],
    storySeeds: [{ id: "seed_1", title: "继承的童年", hook: "钩子", trigger: "触发", conflict: "冲突", protagonists: "主角", questions: ["问题"] }],
    conflicts: [{ id: "conflict_1", title: "人格权冲突", summary: "摘要", body: "正文", related: [], derivedSeeds: [] }],
    assetRelations: [],
    createdAt: new Date().toISOString(),
  };
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
    async createRepository(input) {
      const now = new Date();
      const record = { id: `repo_${repositories.size + 1}`, moderationStatus: "visible" as const, moderationReason: null, moderatedAt: null, stars: 0, forks: 0, createdAt: now, updatedAt: now, ...input };
      repositories.set(record.id, record);
      return record;
    },
    async updateRepository(id, input) { const record = repositories.get(id); if (!record) return null; const next = { ...record, ...input, updatedAt: new Date() }; repositories.set(id, next); return next; },
    async setModerationStatus(id, input) { const record = repositories.get(id); if (!record) return null; const next = { ...record, moderationStatus: input.status, moderationReason: input.reason ?? null, moderatedAt: input.moderatedAt, updatedAt: new Date() }; repositories.set(id, next); return next; },
    async listPublic() { return [...repositories.values()].filter((item) => item.moderationStatus !== "removed").sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()); },
    async findPublicByOwnerSlug(ownerName, slug) { return [...repositories.values()].find((item) => item.ownerName === ownerName && item.slug === slug && item.moderationStatus !== "removed") ?? null; },
    async createRelease(input) { const release = { id: `rel_${releases.size + 1}`, createdAt: new Date(), status: input.status ?? "published", changes: input.changes ?? [], ...input }; releases.set(release.id, release); return release; },
    async findReleaseById(id) { return releases.get(id) ?? null; },
    async updateReleaseStatus(id, status) { const release = releases.get(id); if (!release) return null; const next = { ...release, status }; releases.set(id, next); return next; },
    async listReleases(repositoryId) { return [...releases.values()].filter((release) => release.repositoryId === repositoryId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); },
    async createSnapshot(input) { const snapshot = { id: `snap_${snapshots.size + 1}`, createdAt: new Date(), ...input }; snapshots.set(snapshot.id, snapshot); return snapshot; },
    async findSnapshotByReleaseId(releaseId) { return [...snapshots.values()].find((snapshot) => snapshot.releaseId === releaseId) ?? null; },
    async starRepository(repositoryId) { return repositories.get(repositoryId) ?? null; },
    async unstarRepository(repositoryId) { return repositories.get(repositoryId) ?? null; },
    async createFork(input) { const fork = { id: `fork_${forks.length + 1}`, createdAt: new Date(), ...input }; forks.push(fork); const repo = repositories.get(input.repositoryId); if (repo) repositories.set(repo.id, { ...repo, forks: repo.forks + 1, updatedAt: new Date() }); return fork; },
    async findForkById(id) { return forks.find((fork) => fork.id === id) ?? null; },
    async updateForkSourceRelease(id, sourceReleaseId) { const fork = forks.find((item) => item.id === id); if (!fork) return null; fork.sourceReleaseId = sourceReleaseId; return fork; },
    async deleteFork(id) { const index = forks.findIndex((fork) => fork.id === id); if (index === -1) return null; const [fork] = forks.splice(index, 1); return fork; },
    async listForksForRepository(repositoryId) { return forks.filter((fork) => fork.repositoryId === repositoryId); },
    async createForkAssetMaps(input) { return Promise.all(input.map((map) => repository.upsertForkAssetMap(map))); },
    async listForkAssetMaps(forkId) { return [...assetMaps.values()].filter((map) => map.forkId === forkId); },
    async upsertForkAssetMap(input) { const now = new Date(); const key = `${input.forkId}:${input.upstreamAssetId}`; const next = { ...(assetMaps.get(key) ?? { id: `fork_asset_map_${assetMaps.size + 1}`, createdAt: now }), ...input, updatedAt: now }; assetMaps.set(key, next); return next; },
    async deleteForkAssetMap(forkId, upstreamAssetId) { const key = `${forkId}:${upstreamAssetId}`; const existing = assetMaps.get(key) ?? null; assetMaps.delete(key); return existing; },
    async saveToCollection(input) {
      const name = input.name ?? "saved";
      const existing = [...collections.values()].find((item) => item.repositoryId === input.repositoryId && item.userId === input.userId && item.name === name);
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
    async createEvent(input: Omit<OutboxEventRecord, "id" | "createdAt" | "processedAt">) {
      const event = { id: `out_${events.length + 1}`, createdAt: new Date(), processedAt: null, ...input };
      events.push(event);
      return event;
    },
    async listPending() { return events.filter((event) => !event.processedAt); },
    async markProcessed() { return null; },
  } satisfies OutboxRepository;
}

function createInMemoryWorldRepository() {
  return {
    async createWorld() { throw new Error("Not implemented for community tests."); },
    async listWorlds() { return []; },
    async findWorldById() { return null; },
    async updateWorld() { return null; },
    async deleteWorld() { return null; },
    async duplicateWorldAssets() { return; },
    async listArchiveEntries() { return []; },
    async createArchiveEntry() { throw new Error("Not implemented for community tests."); },
    async listStorySeeds() { return []; },
    async createStorySeed() { throw new Error("Not implemented for community tests."); },
    async listConflicts() { return []; },
    async createConflict() { throw new Error("Not implemented for community tests."); },
    async listAssetRelations() { return []; },
    async countAssets() { return { archive: 0, seeds: 0, conflicts: 0 }; },
    async replaceWorldFromSnapshot() { return null; },
    async createAssetFromSnapshot() { return null; },
    async remapForkAssetReferences() { return; },
    async replaceForkAssetRelationsFromSnapshot() { return true; },
    async forkAssetRelationsMatchSnapshot() { return true; },
    async applyForkSnapshotChange(input) { return { status: "skipped" as const, change: input.change, reason: "missing_source" as const }; },
  } satisfies WorldRepository;
}

function createFallbackSearchClient() {
  return {
    async search() {
      throw new Error("Search index unavailable in community tests.");
    },
  } satisfies RepositorySearchClient;
}
