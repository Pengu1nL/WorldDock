import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { releaseSnapshotSchema, type ReleaseDiff, type ReleaseSnapshot } from "@worlddock/domain";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, hashToken, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { OUTBOX_REPOSITORY, type OutboxRepository } from "../src/modules/outbox/outbox.repository";
import {
  REPOSITORY_REPOSITORY,
  type ForkRecord,
  type PublicRepositoryRecord,
  type ReleaseRecord,
  type ReleaseSnapshotRecord,
  type RepositoryCollectionRecord,
  type RepositoryRepository,
} from "../src/modules/repositories/repository.repository";
import { REPOSITORY_SEARCH_CLIENT, type RepositorySearchClient } from "../src/modules/repositories/repository-search.client";
import { WORLD_REPOSITORY, type ArchiveEntryRecord, type ConflictRecord, type StorySeedRecord, type WorldRecord, type WorldRepository } from "../src/modules/worlds/world.repository";

describe("public developer API", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("lists Alpha personal access token scopes", async () => {
    app = await createTestApp(createInMemoryAuthRepository(), createInMemoryRepositoryRepository());

    const response = await request(app.getHttpServer())
      .get("/v1/developer-access/scopes")
      .expect(200);

    expect(response.body.scopes.map((scope: { value: string }) => scope.value)).toEqual([
      "world:read",
      "world:write",
      "repository:read",
      "billing:read",
    ]);
  });

  it("issues scoped tokens and requires repository:read for repository pull", async () => {
    const auth = createInMemoryAuthRepository();
    auth.users.set("user_1", { id: "user_1", email: "writer@example.com", name: "Writer", role: "user" });
    auth.sessions.set("session_valid", { token: "session_valid", userId: "user_1", expiresAt: new Date(Date.now() + 60_000) });
    addAccessToken(auth, "wdl_world_read", "user_1", ["world:read"]);
    app = await createTestApp(auth, createInMemoryRepositoryRepository());

    const created = await request(app.getHttpServer())
      .post("/v1/developer-access/access-tokens")
      .set("authorization", "Bearer session_valid")
      .send({ name: "Repository Pull", scopes: ["repository:read", "billing:read"] })
      .expect(201);

    expect(created.body.token).toMatch(/^wdl_[a-z0-9]+_[a-z0-9]+$/);
    expect(created.body.accessToken.scopes).toEqual(["repository:read", "billing:read"]);

    await request(app.getHttpServer())
      .get("/v1/developer-access/repositories/ren/memory-market/pull")
      .set("authorization", "Bearer wdl_world_read")
      .expect(403);

    const pulled = await request(app.getHttpServer())
      .get("/v1/developer-access/repositories/ren/memory-market/pull")
      .set("authorization", `Bearer ${created.body.token}`)
      .expect(200);

    expect(pulled.body.repository).toMatchObject({ owner: "ren", slug: "memory-market" });
    expect(pulled.body.release).toMatchObject({ version: "v1.0.0" });
    expect(pulled.body.package).toMatchObject({
      format: "worlddock.world-package.v1",
      world: { name: "Memory Market" },
      assets: [{ kind: "setting", title: "记忆交易法" }],
    });
  });

  it("requires a user session to issue developer access tokens", async () => {
    const auth = createInMemoryAuthRepository();
    auth.users.set("user_1", { id: "user_1", email: "writer@example.com", name: "Writer", role: "user" });
    addAccessToken(auth, "wdl_repo_read", "user_1", ["repository:read"]);
    app = await createTestApp(auth, createInMemoryRepositoryRepository());

    await request(app.getHttpServer())
      .post("/v1/developer-access/access-tokens")
      .set("authorization", "Bearer wdl_repo_read")
      .send({ name: "Nested Token", scopes: ["repository:read"] })
      .expect(403);
  });
});

async function createTestApp(authRepository: ReturnType<typeof createInMemoryAuthRepository>, repositoryRepository: RepositoryRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(REPOSITORY_REPOSITORY)
    .useValue(repositoryRepository)
    .overrideProvider(WORLD_REPOSITORY)
    .useValue(createInMemoryWorldRepository())
    .overrideProvider(OUTBOX_REPOSITORY)
    .useValue(createInMemoryOutboxRepository())
    .overrideProvider(REPOSITORY_SEARCH_CLIENT)
    .useValue({ search: async () => [] } satisfies RepositorySearchClient)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function addAccessToken(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string, scopes: string[]) {
  const now = new Date();
  repository.accessTokens.set(token, {
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
    async listAccessTokens(userId: string) { return [...accessTokens.values()].filter((token) => token.userId === userId); },
    async createAccessToken(input: StoredAccessToken) { accessTokens.set(input.id, input); return input; },
    async findAccessTokenByHash(tokenHash: string) { return [...accessTokens.values()].find((token) => token.tokenHash === tokenHash) ?? null; },
    async markAccessTokenUsed(id: string, usedAt: Date) { const token = accessTokens.get(id); if (token) token.lastUsedAt = usedAt; },
    async revokeAccessToken(userId: string, tokenId: string, revokedAt: Date) {
      const token = accessTokens.get(tokenId);
      if (!token || token.userId !== userId) return null;
      token.revokedAt = revokedAt;
      return token;
    },
  } satisfies AuthRepository & { users: typeof users; sessions: typeof sessions; accessTokens: typeof accessTokens };
}

function createInMemoryRepositoryRepository() {
  const now = new Date("2026-05-27T12:00:00.000Z");
  const repository: PublicRepositoryRecord = {
    id: "repo_1",
    worldId: "world_1",
    ownerId: "user_1",
    ownerName: "ren",
    slug: "memory-market",
    name: "Memory Market",
    summary: "记忆可以被买卖。",
    tags: ["记忆"],
    license: "free-fork-attribution",
    moderationStatus: "visible",
    moderationReason: null,
    moderatedAt: null,
    stars: 4,
    forks: 2,
    createdAt: now,
    updatedAt: now,
  };
  const release: ReleaseRecord = {
    id: "release_1",
    repositoryId: repository.id,
    version: "v1.0.0",
    status: "published",
    note: "初始发布",
    license: "free-fork-attribution",
    diff: { addedSettings: 1, changedSettings: 0, removedSettings: 0, addedSeeds: 0 } satisfies ReleaseDiff,
    changes: [],
    source: "cloud-publish",
    createdAt: now,
  };
  const snapshot: ReleaseSnapshot = releaseSnapshotSchema.parse({
    repositoryId: repository.id,
    releaseId: release.id,
    world: {
      name: "Memory Market",
      type: "近未来",
      summary: "记忆交易市场。",
      tags: ["记忆"],
      maturity: 42,
    },
    archiveEntries: [
      { id: "archive_1", title: "记忆交易法", category: "世界规则", summary: "记忆资产交易制度。", body: "只有认证机构可以主持交易。", relations: [] },
    ],
    storySeeds: [],
    conflicts: [],
    createdAt: now.toISOString(),
  });
  const releaseSnapshot: ReleaseSnapshotRecord = {
    id: "snapshot_1",
    repositoryId: repository.id,
    releaseId: release.id,
    snapshot,
    createdAt: now,
  };

  return {
    async findById(id: string) { return id === repository.id ? repository : null; },
    async findByWorldId(worldId: string) { return worldId === repository.worldId ? repository : null; },
    async createRepository() { return repository; },
    async updateRepository() { return repository; },
    async setModerationStatus() { return repository; },
    async listPublic() { return [repository]; },
    async findPublicByOwnerSlug(ownerName: string, slug: string) {
      return ownerName === repository.ownerName && slug === repository.slug ? repository : null;
    },
    async createRelease() { return release; },
    async findReleaseById(id: string) { return id === release.id ? release : null; },
    async updateReleaseStatus() { return release; },
    async listReleases(repositoryId: string) { return repositoryId === repository.id ? [release] : []; },
    async createSnapshot() { return releaseSnapshot; },
    async findSnapshotByReleaseId(releaseId: string) { return releaseId === release.id ? releaseSnapshot : null; },
    async starRepository() { return repository; },
    async unstarRepository() { return repository; },
    async createFork() { return { id: "fork_1", repositoryId: repository.id, sourceReleaseId: release.id, targetWorldId: "world_fork", userId: "user_2", licenseSnapshot: repository.license, createdAt: now }; },
    async findForkById(): Promise<ForkRecord | null> { return null; },
    async updateForkSourceRelease(): Promise<ForkRecord | null> { return null; },
    async deleteFork(): Promise<ForkRecord | null> { return null; },
    async listForksForRepository() { return []; },
    async createForkAssetMaps() { return []; },
    async listForkAssetMaps() { return []; },
    async upsertForkAssetMap(input) { return { id: "fork_asset_map_1", createdAt: now, updatedAt: now, ...input }; },
    async deleteForkAssetMap() { return null; },
    async saveToCollection(): Promise<RepositoryCollectionRecord> { return { id: "collection_1", repositoryId: repository.id, userId: "user_1", name: "saved", createdAt: now }; },
    async removeFromCollection(): Promise<RepositoryCollectionRecord | null> { return null; },
    async listCollectionsForUser() { return []; },
  } satisfies RepositoryRepository;
}

function createInMemoryWorldRepository() {
  return {
    async createWorld(): Promise<WorldRecord> { throw new Error("Not used."); },
    async listWorlds() { return []; },
    async findWorldById(): Promise<WorldRecord | null> { return null; },
    async updateWorld(): Promise<WorldRecord | null> { return null; },
    async deleteWorld(): Promise<WorldRecord | null> { return null; },
    async duplicateWorldAssets() { return; },
    async listArchiveEntries(): Promise<ArchiveEntryRecord[]> { return []; },
    async createArchiveEntry(): Promise<ArchiveEntryRecord> { throw new Error("Not used."); },
    async listStorySeeds(): Promise<StorySeedRecord[]> { return []; },
    async createStorySeed(): Promise<StorySeedRecord> { throw new Error("Not used."); },
    async listConflicts(): Promise<ConflictRecord[]> { return []; },
    async createConflict(): Promise<ConflictRecord> { throw new Error("Not used."); },
    async listAssetRelations() { return []; },
    async countAssets() { return { archive: 0, seeds: 0, conflicts: 0 }; },
    async replaceWorldFromSnapshot(): Promise<WorldRecord | null> { return null; },
    async createAssetFromSnapshot() { return null; },
    async remapForkAssetReferences() { return; },
    async replaceForkAssetRelationsFromSnapshot() { return true; },
    async forkAssetRelationsMatchSnapshot() { return true; },
    async applyForkSnapshotChange(input) { return { status: "skipped" as const, change: input.change, reason: "missing_source" as const }; },
  } satisfies WorldRepository;
}

function createInMemoryOutboxRepository() {
  return {
    async createEvent() { return { id: "outbox_1", type: "unused", aggregateId: "unused", payload: {}, status: "pending", createdAt: new Date(), processedAt: null }; },
    async listPending() { return []; },
    async markProcessed() { return null; },
  } satisfies OutboxRepository;
}
