import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, hashToken, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { ModerationService } from "../src/modules/moderation/moderation.service";
import { MODERATION_REPOSITORY, type ModerationActionRecord, type ModerationRepository, type ReportRecord } from "../src/modules/moderation/moderation.repository";
import { OUTBOX_REPOSITORY, type OutboxEventRecord, type OutboxRepository } from "../src/modules/outbox/outbox.repository";
import {
  REPOSITORY_REPOSITORY,
  type PublicRepositoryRecord,
  type ReleaseRecord,
  type ReleaseSnapshotRecord,
  type RepositoryRepository,
} from "../src/modules/repositories/repository.repository";
import {
  REPOSITORY_SEARCH_CLIENT,
  type RepositorySearchOptions,
  type RepositorySearchClient,
} from "../src/modules/repositories/repository-search.client";
import { STORAGE_REPOSITORY, type StorageObjectRecord, type StorageRepository } from "../src/modules/storage/storage.repository";
import { STORAGE_SIGNER, type StorageSigner } from "../src/modules/storage/storage.signer";
import {
  WORLD_REPOSITORY,
  type ArchiveEntryRecord,
  type ConflictRecord,
  type StorySeedRecord,
  type WorldRecord,
  type WorldRepository,
} from "../src/modules/worlds/world.repository";

describe("repository publish endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("publishes an owned world as a public repository with release snapshot", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Memory Market",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "cloud",
      maturity: 64,
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "交易法", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    await worlds.createStorySeed({ worldId: world.id, title: "继承的童年", hook: "钩子", trigger: "触发", conflict: "冲突", protagonists: "主角", questions: ["问题"] });
    await worlds.createConflict({ worldId: world.id, title: "人格权冲突", summary: "摘要", body: "正文", related: [], derivedSeeds: [] });
    app = await createTestApp(auth, worlds, repositories);

    const publish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);

    expect(publish.body.repository).toMatchObject({
      owner: "ren",
      slug: "memory-market",
      visibility: "public",
      version: "v1.0.0",
    });
    expect(publish.body.release).toMatchObject({
      version: "v1.0.0",
      diff: { addedSettings: 1, changedSettings: 0, removedSettings: 0, addedSeeds: 1 },
    });

    const snapshot = await repositories.findSnapshotByReleaseId(publish.body.release.id);
    expect(snapshot?.snapshot.archiveEntries).toHaveLength(1);
    expect(JSON.stringify(snapshot?.snapshot)).not.toContain("token");

    const list = await request(app.getHttpServer())
      .get("/v1/repositories")
      .expect(200);
    expect(list.body.repositories[0].slug).toBe("memory-market");

    const detail = await request(app.getHttpServer())
      .get("/v1/repositories/ren/memory-market")
      .expect(200);
    expect(detail.body.repository.releases).toHaveLength(1);
  });

  it("creates a new release version on subsequent publishes", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Ledger World",
      type: "蒸汽朋克",
      summary: "承诺必须入账。",
      tags: ["账本"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "账本誓约", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "non-commercial-attribution" })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "补充设定", license: "non-commercial-attribution" })
      .expect(201);

    expect(second.body.release.version).toBe("v1.1.0");
  });

  it("rejects publishing a world owned by another user", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_2", "user_2", "lin");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Private World",
      type: "科幻",
      summary: "不是你的世界。",
      tags: [],
      mode: "cloud",
    });
    app = await createTestApp(auth, worlds, repositories);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_2")
      .send({ releaseNote: "越权发布", license: "free-fork-attribution" })
      .expect(403);
  });

  it("stars and unstars repositories idempotently", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Star World",
      type: "奇幻",
      summary: "可被收藏。",
      tags: [],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "收藏规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories);
    const publish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/star`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    const secondStar = await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/star`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    expect(secondStar.body.repository.stars).toBe(1);

    await request(app.getHttpServer())
      .delete(`/v1/repositories/${publish.body.repository.id}/star`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    const secondUnstar = await request(app.getHttpServer())
      .delete(`/v1/repositories/${publish.body.repository.id}/star`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(secondUnstar.body.repository.stars).toBe(0);
  });

  it("forks a public repository into a private draft world", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Forkable World",
      type: "奇幻",
      summary: "允许 fork。",
      tags: ["可分叉"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories);
    const publish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);

    const fork = await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/fork`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(fork.body.world).toMatchObject({ ownerId: "user_2", status: "draft", visibility: "private" });
    expect(await repositories.listForksForRepository(publish.body.repository.id)).toHaveLength(1);
  });

  it("accepts Local Push only from access tokens with repository:push scope", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addAccessToken(auth, "wdl_push_secret", "user_1", "ren", ["repository:push"]);
    addAccessToken(auth, "wdl_read_secret", "user_2", "lin", ["world:read"]);
    app = await createTestApp(auth, worlds, repositories);

    const pushed = await request(app.getHttpServer())
      .post("/v1/repositories/local-push")
      .set("authorization", "Bearer wdl_push_secret")
      .send({
        name: "Local World",
        summary: "来自本地公开快照。",
        tags: ["local"],
        releaseNote: "Local Push",
        license: "free-fork-attribution",
        snapshot: {
          world: { name: "Local World", type: "本地", summary: "来自本地公开快照。", tags: ["local"], maturity: 12 },
          archiveEntries: [],
          storySeeds: [],
          conflicts: [],
        },
      })
      .expect(201);

    expect(pushed.body.repository.slug).toBe("local-world");

    await request(app.getHttpServer())
      .post("/v1/repositories/local-push")
      .set("authorization", "Bearer wdl_read_secret")
      .send({
        name: "Denied",
        summary: "scope 不足。",
        tags: [],
        releaseNote: "Denied",
        license: "free-fork-attribution",
        snapshot: { world: { name: "Denied", type: "本地", summary: "scope 不足。", tags: [], maturity: 1 }, archiveEntries: [], storySeeds: [], conflicts: [] },
      })
      .expect(403);
  });

  it("writes outbox events for repository changes and searches public repositories", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    const outbox = createInMemoryOutboxRepository();
    let indexedRepositoryId = "";
    let searchedQuery = "";
    let searchedOptions: RepositorySearchOptions | undefined;
    const searchClient = {
      async search(query: string, options?: RepositorySearchOptions) {
        searchedQuery = query;
        searchedOptions = options;
        return indexedRepositoryId ? [{ id: indexedRepositoryId }] : [];
      },
    } satisfies RepositorySearchClient;
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Searchable Archive",
      type: "奇幻",
      summary: "一个可以被搜索到的公开世界。",
      tags: ["搜索"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "可搜索设定", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories, outbox, searchClient);
    const publish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);
    indexedRepositoryId = publish.body.repository.id;

    await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/star`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/fork`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);

    expect(outbox.events.map((event) => event.type)).toEqual([
      "repository.published",
      "repository.moderation_scan_requested",
      "repository.starred",
      "repository.forked",
    ]);

    const search = await request(app.getHttpServer())
      .get("/v1/repositories/search")
      .query({ q: "Searchable", tag: "搜索", sort: "stars" })
      .expect(200);
    expect(searchedQuery).toBe("searchable");
    expect(searchedOptions).toEqual({ tags: ["搜索"], sort: "stars" });
    expect(search.body.repositories[0].slug).toBe("searchable-archive");
  });

  it("lets users report repositories and keeps manual moderation off admin HTTP routes", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    const outbox = createInMemoryOutboxRepository();
    const moderation = createInMemoryModerationRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    addSession(auth, "session_user_3", "user_3", "kai");
    addSession(auth, "session_admin", "admin_1", "admin", "admin");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Reported World",
      type: "奇幻",
      summary: "需要复核的公开世界。",
      tags: ["审核"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "待审核设定", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories, outbox, createInMemorySearchClient(), moderation);
    const publish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);

    expect(outbox.events.map((event) => event.type)).toContain("repository.moderation_scan_requested");

    const report = await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/reports`)
      .set("authorization", "Bearer session_user_1")
      .send({ reason: "other", detail: "请管理员复核。" })
      .expect(201);
    expect(report.body.report).toMatchObject({ repositoryId: publish.body.repository.id, targetType: "repository", status: "open" });
    const duplicate = await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/reports`)
      .set("authorization", "Bearer session_user_1")
      .send({ reason: "spam", detail: "同一天重复举报测试。" })
      .expect(201);
    expect(duplicate.body.report.id).toBe(report.body.report.id);
    await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/reports`)
      .set("authorization", "Bearer session_user_2")
      .send({ reason: "spam", detail: "重复举报阈值测试 1。" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/reports`)
      .set("authorization", "Bearer session_user_3")
      .send({ reason: "abuse", detail: "重复举报阈值测试 2。" })
      .expect(201);
    expect(outbox.events.filter((event) => event.type === "repository.moderation_scan_requested")).toHaveLength(2);

    await request(app.getHttpServer())
      .get("/v1/admin/reports")
      .set("authorization", "Bearer session_admin")
      .expect(404);

    await request(app.getHttpServer())
      .post(`/v1/admin/reports/${report.body.report.id}/actions`)
      .set("authorization", "Bearer session_admin")
      .send({ action: "remove", reason: "违反社区规范。" })
      .expect(404);

    const action = await app.get(ModerationService).moderateReport({
      kind: "session",
      user: { id: "admin_1", email: "admin_1@example.com", name: "admin", role: "admin" },
      sessionToken: "operator",
    }, report.body.report.id, { action: "remove", reason: "违反社区规范。" });
    expect(action.action).toMatchObject({
      moderatorId: "admin_1",
      previousStatus: "visible",
      nextStatus: "removed",
    });

    await request(app.getHttpServer())
      .get("/v1/repositories/ren/reported-world")
      .expect(404);

    const search = await request(app.getHttpServer())
      .get("/v1/repositories/search")
      .query({ q: "Reported" })
      .expect(200);
    expect(search.body.repositories).toHaveLength(0);
    expect(outbox.events.map((event) => event.type)).toContain("repository.moderation_removed");
    expect(moderation.actions[0]).toMatchObject({ repositoryId: publish.body.repository.id, reason: "违反社区规范。" });
  });

  it("creates signed storage URLs and attaches covers and release attachments", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    const storage = createInMemoryStorageRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Storage World",
      type: "科幻",
      summary: "有封面和附件。",
      tags: ["storage"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "附件设定", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    app = await createTestApp(
      auth,
      worlds,
      repositories,
      createInMemoryOutboxRepository(),
      createInMemorySearchClient(),
      createInMemoryModerationRepository(),
      storage,
      createFakeStorageSigner(),
    );
    const publish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);

    const coverUpload = await request(app.getHttpServer())
      .post("/v1/storage/upload-url")
      .set("authorization", "Bearer session_user_1")
      .send({
        purpose: "world_cover",
        filename: "cover.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        visibility: "private",
        worldId: world.id,
      })
      .expect(201);
    expect(coverUpload.body.upload).toMatchObject({ method: "PUT" });

    await request(app.getHttpServer())
      .get(`/v1/storage/objects/${coverUpload.body.object.id}/download-url`)
      .set("authorization", "Bearer session_user_2")
      .expect(403);

    const ownerDownload = await request(app.getHttpServer())
      .get(`/v1/storage/objects/${coverUpload.body.object.id}/download-url`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(ownerDownload.body.download.url).toContain("signed-get");

    await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/cover`)
      .set("authorization", "Bearer session_user_1")
      .send({ objectId: coverUpload.body.object.id })
      .expect(201);
    expect((await worlds.findWorldById(world.id))?.coverObjectId).toBe(coverUpload.body.object.id);
    expect(storage.objects.find((object) => object.id === coverUpload.body.object.id)?.status).toBe("attached");

    const attachmentUpload = await request(app.getHttpServer())
      .post("/v1/storage/upload-url")
      .set("authorization", "Bearer session_user_1")
      .send({
        purpose: "release_attachment",
        filename: "snapshot.zip",
        mimeType: "application/zip",
        sizeBytes: 4096,
        visibility: "private",
        repositoryId: publish.body.repository.id,
        releaseId: publish.body.release.id,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/releases/${publish.body.release.id}/attachments`)
      .set("authorization", "Bearer session_user_1")
      .send({ objectId: attachmentUpload.body.object.id })
      .expect(201);
    expect(storage.objects.find((object) => object.id === attachmentUpload.body.object.id)).toMatchObject({
      status: "attached",
      releaseId: publish.body.release.id,
    });

    const publicObject = await request(app.getHttpServer())
      .post("/v1/storage/upload-url")
      .set("authorization", "Bearer session_user_1")
      .send({
        purpose: "import_export",
        filename: "export.json",
        mimeType: "application/json",
        sizeBytes: 128,
        visibility: "public",
      })
      .expect(201);
    const publicDownload = await request(app.getHttpServer())
      .get(`/v1/storage/objects/${publicObject.body.object.id}/download-url`)
      .set("authorization", "Bearer session_user_2")
      .expect(200);
    expect(publicDownload.body.download.url).toContain("public");

    await request(app.getHttpServer())
      .post("/v1/storage/upload-url")
      .set("authorization", "Bearer session_user_1")
      .send({
        purpose: "avatar",
        filename: "avatar.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 10,
        visibility: "private",
      })
      .expect(400);
  });
});

async function createTestApp(
  authRepository: AuthRepository,
  worldRepository: WorldRepository,
  repositoryRepository: RepositoryRepository,
  outboxRepository: OutboxRepository = createInMemoryOutboxRepository(),
  searchClient: RepositorySearchClient = createInMemorySearchClient(),
  moderationRepository: ModerationRepository = createInMemoryModerationRepository(),
  storageRepository: StorageRepository = createInMemoryStorageRepository(),
  storageSigner: StorageSigner = createFakeStorageSigner(),
) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
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
    .overrideProvider(MODERATION_REPOSITORY)
    .useValue(moderationRepository)
    .overrideProvider(STORAGE_REPOSITORY)
    .useValue(storageRepository)
    .overrideProvider(STORAGE_SIGNER)
    .useValue(storageSigner)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function createInMemorySearchClient() {
  return {
    async search() {
      throw new Error("Search index unavailable in tests.");
    },
  } satisfies RepositorySearchClient;
}

function createInMemoryOutboxRepository() {
  const events: OutboxEventRecord[] = [];
  const repository = {
    events,
    async createEvent(input: Omit<OutboxEventRecord, "id" | "createdAt" | "processedAt">) {
      const event = { id: `out_${events.length + 1}`, createdAt: new Date(), processedAt: null, ...input };
      events.push(event);
      return event;
    },
    async listPending() {
      return events.filter((event) => !event.processedAt);
    },
    async markProcessed(id: string, processedAt: Date) {
      const event = events.find((item) => item.id === id);
      if (!event) return null;
      event.processedAt = processedAt;
      return event;
    },
  } satisfies OutboxRepository & { events: typeof events };
  return repository;
}

function addSession(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string, name: string, role: "user" | "admin" = "user") {
  repository.users.set(userId, { id: userId, email: `${userId}@example.com`, name, role });
  repository.sessions.set(token, { token, userId, expiresAt: new Date(Date.now() + 60_000) });
}

function addAccessToken(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string, name: string, scopes: string[]) {
  repository.users.set(userId, { id: userId, email: `${userId}@example.com`, name, role: "user" });
  repository.accessTokens.set(`at_${userId}`, {
    id: `at_${userId}`,
    userId,
    name: "Local Push",
    tokenHash: hashToken(token),
    prefix: "push",
    scopes,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
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
        deletedAt: null,
      };
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

function createInMemoryStorageRepository() {
  const objects: StorageObjectRecord[] = [];
  const repository = {
    objects,
    async createObject(input: Omit<StorageObjectRecord, "id" | "status" | "createdAt" | "updatedAt" | "deletedAt">) {
      const now = new Date();
      const object = { id: `object_${objects.length + 1}`, status: "pending" as const, createdAt: now, updatedAt: now, deletedAt: null, ...input };
      objects.push(object);
      return object;
    },
    async findObjectById(id: string) {
      return objects.find((object) => object.id === id) ?? null;
    },
    async attachObject(id: string, input: Partial<Pick<StorageObjectRecord, "worldId" | "repositoryId" | "releaseId">>) {
      const object = objects.find((item) => item.id === id);
      if (!object || object.deletedAt) return null;
      Object.assign(object, input, { status: "attached" as const, updatedAt: new Date() });
      return object;
    },
    async markDeleted(id: string, deletedAt: Date) {
      const object = objects.find((item) => item.id === id);
      if (!object) return null;
      object.status = "deleted";
      object.deletedAt = deletedAt;
      object.updatedAt = deletedAt;
      return object;
    },
    async listCleanupCandidates(before: Date, limit = 100) {
      return objects
        .filter((object) => !object.deletedAt && ["pending", "orphaned"].includes(object.status) && object.createdAt < before)
        .slice(0, limit);
    },
  } satisfies StorageRepository & { objects: typeof objects };
  return repository;
}

function createFakeStorageSigner() {
  return {
    async createUploadUrl(object: StorageObjectRecord) {
      return { url: `https://signed-put.example/${object.key}`, method: "PUT" as const, headers: { "content-type": object.mimeType }, expiresAt: new Date(Date.now() + 60_000) };
    },
    async createDownloadUrl(object: StorageObjectRecord) {
      return { url: `https://signed-get.example/${object.key}`, method: "GET" as const, expiresAt: new Date(Date.now() + 60_000) };
    },
    publicUrl(object: StorageObjectRecord) {
      return `https://public.example/${object.key}`;
    },
  } satisfies StorageSigner;
}

function createInMemoryRepositoryRepository() {
  const repositories = new Map<string, PublicRepositoryRecord>();
  const releases = new Map<string, ReleaseRecord>();
  const snapshots = new Map<string, ReleaseSnapshotRecord>();
  const stars = new Set<string>();
  const forks: any[] = [];
  const collections = new Map<string, any>();

  const repository: RepositoryRepository = {
    async findById(id) { return repositories.get(id) ?? null; },
    async findByWorldId(worldId) { return [...repositories.values()].find((item) => item.worldId === worldId) ?? null; },
    async createRepository(input) {
      const now = new Date();
      const record = {
        id: `repo_${repositories.size + 1}`,
        moderationStatus: "visible" as const,
        moderationReason: null,
        moderatedAt: null,
        stars: 0,
        forks: 0,
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      repositories.set(record.id, record);
      return record;
    },
    async updateRepository(id, input) {
      const record = repositories.get(id);
      if (!record) return null;
      const next = { ...record, ...input, updatedAt: new Date() };
      repositories.set(id, next);
      return next;
    },
    async setModerationStatus(id, input) {
      const record = repositories.get(id);
      if (!record) return null;
      const next = { ...record, moderationStatus: input.status, moderationReason: input.reason ?? null, moderatedAt: input.moderatedAt, updatedAt: new Date() };
      repositories.set(id, next);
      return next;
    },
    async listPublic() { return [...repositories.values()].filter((item) => item.moderationStatus !== "removed").sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()); },
    async findPublicByOwnerSlug(ownerName, slug) {
      return [...repositories.values()].find((item) => item.ownerName === ownerName && item.slug === slug && item.moderationStatus !== "removed") ?? null;
    },
    async createRelease(input) {
      const release = {
        id: `rel_${releases.size + 1}`,
        createdAt: new Date(),
        status: input.status ?? "published",
        changes: input.changes ?? [],
        ...input,
      };
      releases.set(release.id, release);
      return release;
    },
    async findReleaseById(id) {
      return releases.get(id) ?? null;
    },
    async updateReleaseStatus(id, status) {
      const release = releases.get(id);
      if (!release) return null;
      const next = { ...release, status };
      releases.set(id, next);
      return next;
    },
    async listReleases(repositoryId) {
      return [...releases.values()].filter((release) => release.repositoryId === repositoryId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async createSnapshot(input) {
      const snapshot = { id: `snap_${snapshots.size + 1}`, createdAt: new Date(), ...input };
      snapshots.set(snapshot.id, snapshot);
      return snapshot;
    },
    async findSnapshotByReleaseId(releaseId) {
      return [...snapshots.values()].find((snapshot) => snapshot.releaseId === releaseId) ?? null;
    },
    async starRepository(repositoryId, userId) {
      const key = `${repositoryId}:${userId}`;
      if (!stars.has(key)) {
        stars.add(key);
        const repository = repositories.get(repositoryId);
        if (repository) repositories.set(repositoryId, { ...repository, stars: repository.stars + 1, updatedAt: new Date() });
      }
      return repositories.get(repositoryId) ?? null;
    },
    async unstarRepository(repositoryId, userId) {
      const key = `${repositoryId}:${userId}`;
      if (stars.delete(key)) {
        const repository = repositories.get(repositoryId);
        if (repository) repositories.set(repositoryId, { ...repository, stars: Math.max(0, repository.stars - 1), updatedAt: new Date() });
      }
      return repositories.get(repositoryId) ?? null;
    },
    async createFork(input) {
      const fork = { id: `fork_${forks.length + 1}`, createdAt: new Date(), ...input };
      forks.push(fork);
      const repository = repositories.get(input.repositoryId);
      if (repository) repositories.set(input.repositoryId, { ...repository, forks: repository.forks + 1, updatedAt: new Date() });
      return fork;
    },
    async findForkById(id) {
      return forks.find((fork) => fork.id === id) ?? null;
    },
    async updateForkSourceRelease(id, sourceReleaseId) {
      const fork = forks.find((item) => item.id === id);
      if (!fork) return null;
      fork.sourceReleaseId = sourceReleaseId;
      return fork;
    },
    async deleteFork(id) {
      const index = forks.findIndex((fork) => fork.id === id);
      if (index === -1) return null;
      const [fork] = forks.splice(index, 1);
      const repository = repositories.get(fork.repositoryId);
      if (repository) repositories.set(fork.repositoryId, { ...repository, forks: Math.max(0, repository.forks - 1), updatedAt: new Date() });
      return fork;
    },
    async listForksForRepository(repositoryId) {
      return forks.filter((fork) => fork.repositoryId === repositoryId);
    },
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

function createInMemoryModerationRepository() {
  const reports: ReportRecord[] = [];
  const actions: ModerationActionRecord[] = [];
  const repository = {
    reports,
    actions,
    async createReport(input: Omit<ReportRecord, "id" | "status" | "createdAt" | "updatedAt">) {
      const now = new Date();
      const report = { id: `report_${reports.length + 1}`, status: "open" as const, createdAt: now, updatedAt: now, ...input };
      reports.push(report);
      return report;
    },
    async findReportByReporterTargetOnDay(input: { reporterId: string; targetType: ReportRecord["targetType"]; targetId: string; dayStart: Date; dayEnd: Date }) {
      return reports.find((report) =>
        report.reporterId === input.reporterId &&
        report.targetType === input.targetType &&
        report.targetId === input.targetId &&
        report.createdAt >= input.dayStart &&
        report.createdAt < input.dayEnd) ?? null;
    },
    async listReports(status?: ReportRecord["status"]) {
      return reports.filter((report) => !status || report.status === status);
    },
    async findReportById(id: string) {
      return reports.find((report) => report.id === id) ?? null;
    },
    async updateReportStatus(id: string, status: ReportRecord["status"]) {
      const report = reports.find((item) => item.id === id);
      if (!report) return null;
      report.status = status;
      report.updatedAt = new Date();
      return report;
    },
    async countOpenReports(repositoryId: string) {
      return reports.filter((report) => report.repositoryId === repositoryId && report.status === "open").length;
    },
    async countOpenReportsForTarget(targetType: ReportRecord["targetType"], targetId: string) {
      return reports.filter((report) => report.targetType === targetType && report.targetId === targetId && report.status === "open").length;
    },
    async createAction(input: Omit<ModerationActionRecord, "id" | "createdAt">) {
      const action = { id: `mod_${actions.length + 1}`, createdAt: new Date(), ...input };
      actions.push(action);
      return action;
    },
  } satisfies ModerationRepository & { reports: typeof reports; actions: typeof actions };
  return repository;
}
