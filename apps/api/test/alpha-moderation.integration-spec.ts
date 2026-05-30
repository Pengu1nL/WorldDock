import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { configureApiApp } from "../src/configure-api-app";
import { createMemoryRateLimitStore, decideRateLimit, subjectRateLimitKeys } from "../src/common/security";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { MODERATION_REPOSITORY, type ModerationActionRecord, type ModerationRepository, type ReportRecord } from "../src/modules/moderation/moderation.repository";
import { ModerationModule } from "../src/modules/moderation/moderation.module";
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

describe("alpha moderation", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("accepts repository and creator reports idempotently without admin HTTP routes", async () => {
    const auth = createInMemoryAuthRepository();
    const repositories = createInMemoryRepositoryRepository();
    const moderation = createInMemoryModerationRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const repository = await repositories.createRepository({
      worldId: null,
      ownerId: "creator_1",
      ownerName: "ren",
      slug: "memory-market",
      name: "Memory Market",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      license: "free-fork-attribution",
    });
    app = await createTestApp(auth, repositories, moderation);

    await request(app.getHttpServer())
      .post(`/v1/repositories/${repository.id}/reports`)
      .set("authorization", "Bearer session_user_1")
      .send({ reason: "other", detail: "短" })
      .expect(400);

    const report = await request(app.getHttpServer())
      .post(`/v1/repositories/${repository.id}/reports`)
      .set("authorization", "Bearer session_user_1")
      .send({ reason: "spam", detail: "这个仓库疑似垃圾内容。" })
      .expect(201);
    expect(report.body.report).toMatchObject({
      repositoryId: repository.id,
      targetType: "repository",
      targetId: repository.id,
      status: "open",
    });

    const duplicate = await request(app.getHttpServer())
      .post(`/v1/repositories/${repository.id}/reports`)
      .set("authorization", "Bearer session_user_1")
      .send({ reason: "abuse", detail: "同一天重复提交。" })
      .expect(201);
    expect(duplicate.body.report.id).toBe(report.body.report.id);

    const creatorReport = await request(app.getHttpServer())
      .post("/v1/community/creators/ren/reports")
      .set("authorization", "Bearer session_user_1")
      .send({ reason: "other", detail: "创作者主页资料需要人工复核。" })
      .expect(201);
    expect(creatorReport.body.report).toMatchObject({
      repositoryId: null,
      targetType: "creator",
      targetId: "ren",
    });

    const duplicateCreator = await request(app.getHttpServer())
      .post("/v1/community/creators/ren/reports")
      .set("authorization", "Bearer session_user_1")
      .send({ reason: "copyright", detail: "同一天重复举报创作者。" })
      .expect(201);
    expect(duplicateCreator.body.report.id).toBe(creatorReport.body.report.id);
    expect(moderation.reports).toHaveLength(2);

    await request(app.getHttpServer())
      .get("/v1/admin/reports")
      .set("authorization", "Bearer session_user_1")
      .expect(404);
    await request(app.getHttpServer())
      .post(`/v1/admin/reports/${report.body.report.id}/actions`)
      .set("authorization", "Bearer session_user_1")
      .send({ action: "remove", reason: "manual" })
      .expect(404);
  });

  it("uses shared rate-limit keys for IP, user, and access-token route families", async () => {
    const sharedStore = createMemoryRateLimitStore();
    const requestLike = { headers: {}, method: "POST", raw: { url: "/v1/repositories/repo_1/reports" } };
    const sessionSubject = { kind: "session" as const, user: { id: "user_1", email: "u@example.com", name: "u", role: "user" as const }, sessionToken: "session" };
    const tokenSubject = { kind: "access-token" as const, user: sessionSubject.user, accessTokenId: "token_1", scopes: ["world:write"] };

    expect(subjectRateLimitKeys(sessionSubject, requestLike)).toEqual(["user:user_1:route:reports"]);
    expect(subjectRateLimitKeys(tokenSubject, requestLike)).toEqual([
      "user:user_1:route:reports",
      "access-token:token_1:route:reports",
    ]);

    await expect(decideRateLimit(["ip:127.0.0.1:route:reports"], sharedStore, { max: 2, windowMs: 60_000, now: 1 })).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(decideRateLimit(["ip:127.0.0.1:route:reports"], sharedStore, { max: 2, windowMs: 60_000, now: 2 })).resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(decideRateLimit(["ip:127.0.0.1:route:reports"], sharedStore, { max: 2, windowMs: 60_000, now: 3 })).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });
});

async function createTestApp(
  authRepository: AuthRepository,
  repositoryRepository: RepositoryRepository,
  moderationRepository: ModerationRepository,
) {
  const moduleRef = await Test.createTestingModule({
    imports: [ModerationModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(REPOSITORY_REPOSITORY)
    .useValue(repositoryRepository)
    .overrideProvider(MODERATION_REPOSITORY)
    .useValue(moderationRepository)
    .overrideProvider(OUTBOX_REPOSITORY)
    .useValue(createInMemoryOutboxRepository())
    .overrideProvider(WORLD_REPOSITORY)
    .useValue(createInMemoryWorldRepository())
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
    async saveToCollection(input) { const name = input.name ?? "saved"; const collection = { id: `collection_${collections.size + 1}`, createdAt: new Date(), name, ...input }; collections.set(collection.id, collection); return collection; },
    async removeFromCollection(input) { const collection = collections.get(input.collectionId); if (!collection) return null; collections.delete(collection.id); return collection; },
    async listCollectionsForUser(userId) { return [...collections.values()].filter((collection) => collection.userId === userId); },
  };
  return repository;
}

function createInMemoryModerationRepository() {
  const reports: ReportRecord[] = [];
  const actions: ModerationActionRecord[] = [];
  return {
    reports,
    actions,
    async createReport(input: Omit<ReportRecord, "id" | "status" | "createdAt" | "updatedAt">) { const now = new Date(); const report = { id: `report_${reports.length + 1}`, status: "open" as const, createdAt: now, updatedAt: now, ...input }; reports.push(report); return report; },
    async findReportByReporterTargetOnDay(input: { reporterId: string; targetType: ReportRecord["targetType"]; targetId: string; dayStart: Date; dayEnd: Date }) { return reports.find((report) => report.reporterId === input.reporterId && report.targetType === input.targetType && report.targetId === input.targetId && report.createdAt >= input.dayStart && report.createdAt < input.dayEnd) ?? null; },
    async listReports(status?: ReportRecord["status"]) { return reports.filter((report) => !status || report.status === status); },
    async findReportById(id: string) { return reports.find((report) => report.id === id) ?? null; },
    async updateReportStatus(id: string, status: ReportRecord["status"]) { const report = reports.find((item) => item.id === id); if (!report) return null; report.status = status; report.updatedAt = new Date(); return report; },
    async countOpenReports(repositoryId: string) { return reports.filter((report) => report.repositoryId === repositoryId && report.status === "open").length; },
    async countOpenReportsForTarget(targetType: ReportRecord["targetType"], targetId: string) { return reports.filter((report) => report.targetType === targetType && report.targetId === targetId && report.status === "open").length; },
    async createAction(input: Omit<ModerationActionRecord, "id" | "createdAt">) { const action = { id: `action_${actions.length + 1}`, createdAt: new Date(), ...input }; actions.push(action); return action; },
  } satisfies ModerationRepository & { reports: typeof reports; actions: typeof actions };
}

function createInMemoryOutboxRepository() {
  const events: OutboxEventRecord[] = [];
  return {
    async createEvent(input: Omit<OutboxEventRecord, "id" | "createdAt" | "processedAt">) { const event = { id: `out_${events.length + 1}`, createdAt: new Date(), processedAt: null, ...input }; events.push(event); return event; },
    async listPending() { return events.filter((event) => !event.processedAt); },
    async markProcessed() { return null; },
  } satisfies OutboxRepository;
}

function createInMemoryWorldRepository() {
  return {
    async createWorld() { throw new Error("Not implemented for alpha moderation tests."); },
    async listWorlds() { return []; },
    async findWorldById() { return null; },
    async updateWorld() { return null; },
    async deleteWorld() { return null; },
    async duplicateWorldAssets() { return; },
    async listArchiveEntries() { return []; },
    async createArchiveEntry() { throw new Error("Not implemented for alpha moderation tests."); },
    async listStorySeeds() { return []; },
    async createStorySeed() { throw new Error("Not implemented for alpha moderation tests."); },
    async listConflicts() { return []; },
    async createConflict() { throw new Error("Not implemented for alpha moderation tests."); },
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

function createInMemorySearchClient() {
  return { async search() { return []; } } satisfies RepositorySearchClient;
}
