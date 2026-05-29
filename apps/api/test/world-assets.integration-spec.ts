import { type INestApplication } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { WorldAssetsService, type WorldAssetRecord } from "../src/modules/world-assets/world-assets.service";
import {
  WORLD_REPOSITORY,
  type ArchiveEntryRecord,
  type ConflictRecord,
  type StorySeedRecord,
  type WorldRecord,
  type WorldRepository,
} from "../src/modules/worlds/world.repository";

describe("world assets API", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates, searches, updates, reorders, relates, and deletes cloud assets", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const assets = createInMemoryWorldAssetsService();
    addSession(auth, "session_user_1", "user_1");
    app = await createTestApp(auth, worlds, assets);

    const createdWorld = await request(app.getHttpServer())
      .post("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .send({ name: "回忆所", type: "近未来", summary: "记忆可以被买卖。", tags: ["记忆"], mode: "cloud" })
      .expect(201);
    const worldId = createdWorld.body.world.id;

    const setting = await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/assets`)
      .set("authorization", "Bearer session_user_1")
      .send({
        kind: "setting",
        title: "《记忆交易法》",
        category: "世界规则",
        summary: "确立记忆资产交易制度。",
        body: "只有认证机构可以主持记忆交易。",
      })
      .expect(201);

    const seed = await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/assets`)
      .set("authorization", "Bearer session_user_1")
      .send({
        kind: "seed",
        title: "继承的童年",
        summary: "她继承了一段陌生童年。",
        payload: { conflict: "人格权与继承权冲突。", questions: ["记忆能被继承吗？"] },
      })
      .expect(201);

    const search = await request(app.getHttpServer())
      .get(`/v1/worlds/${worldId}/assets?kind=setting&q=交易法`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(search.body.assets).toHaveLength(1);
    expect(search.body.assets[0]).toMatchObject({ id: setting.body.asset.id, kind: "setting" });

    const updated = await request(app.getHttpServer())
      .patch(`/v1/worlds/${worldId}/assets/${setting.body.asset.id}`)
      .set("authorization", "Bearer session_user_1")
      .send({ summary: "更新后的制度摘要。", position: 2 })
      .expect(200);
    expect(updated.body.asset).toMatchObject({ summary: "更新后的制度摘要。", position: 2 });

    await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/assets/reorder`)
      .set("authorization", "Bearer session_user_1")
      .send({ assetIds: [seed.body.asset.id, setting.body.asset.id] })
      .expect(200);

    const related = await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/assets/${setting.body.asset.id}/relations`)
      .set("authorization", "Bearer session_user_1")
      .send({ targetAssetId: seed.body.asset.id })
      .expect(201);
    expect(related.body.relation).toMatchObject({
      sourceAssetId: setting.body.asset.id,
      targetAssetId: seed.body.asset.id,
    });

    const listWithRelation = await request(app.getHttpServer())
      .get(`/v1/worlds/${worldId}/assets?kind=setting`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(listWithRelation.body.assets[0].payload.relations ?? []).toEqual([]);
    expect(listWithRelation.body.assets[0].payload.relationLabels).toEqual(["继承的童年"]);
    expect(listWithRelation.body.assets[0].payload.relationTargets).toEqual([
      { targetAssetId: seed.body.asset.id, label: "继承的童年" },
    ]);

    const detailWithRelation = await request(app.getHttpServer())
      .get(`/v1/worlds/${worldId}/assets/${setting.body.asset.id}`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(detailWithRelation.body.asset.payload.relationLabels).toEqual(["继承的童年"]);

    await request(app.getHttpServer())
      .patch(`/v1/worlds/${worldId}/assets/${setting.body.asset.id}`)
      .set("authorization", "Bearer session_user_1")
      .send({
        summary: "再次编辑后不应把关系表标签写回旧字段。",
        payload: detailWithRelation.body.asset.payload,
      })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/v1/worlds/${worldId}/assets/${setting.body.asset.id}/relations/${seed.body.asset.id}`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    const listWithoutRelation = await request(app.getHttpServer())
      .get(`/v1/worlds/${worldId}/assets?kind=setting`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(listWithoutRelation.body.assets[0].payload.relations ?? []).toEqual([]);
    expect(listWithoutRelation.body.assets[0].payload.relationLabels ?? []).toEqual([]);

    await request(app.getHttpServer())
      .delete(`/v1/worlds/${worldId}/assets/${setting.body.asset.id}`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/v1/worlds/${worldId}/assets`)
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(list.body.assets.map((asset: WorldAssetRecord) => asset.id)).toEqual([seed.body.asset.id]);
  });

  it("rejects cross-user access to world assets", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const assets = createInMemoryWorldAssetsService();
    addSession(auth, "session_user_1", "user_1");
    addSession(auth, "session_user_2", "user_2");
    app = await createTestApp(auth, worlds, assets);

    const createdWorld = await request(app.getHttpServer())
      .post("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .send({ name: "回忆所", type: "近未来", summary: "记忆可以被买卖。", tags: ["记忆"], mode: "cloud" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/worlds/${createdWorld.body.world.id}/assets`)
      .set("authorization", "Bearer session_user_2")
      .expect(403);
  });

  it("returns 404 when a relation target asset is missing", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const assets = createInMemoryWorldAssetsService();
    addSession(auth, "session_user_1", "user_1");
    app = await createTestApp(auth, worlds, assets);

    const createdWorld = await request(app.getHttpServer())
      .post("/v1/worlds")
      .set("authorization", "Bearer session_user_1")
      .send({ name: "回忆所", type: "近未来", summary: "记忆可以被买卖。", tags: ["记忆"], mode: "cloud" })
      .expect(201);

    const setting = await request(app.getHttpServer())
      .post(`/v1/worlds/${createdWorld.body.world.id}/assets`)
      .set("authorization", "Bearer session_user_1")
      .send({
        kind: "setting",
        title: "《记忆交易法》",
        category: "世界规则",
        summary: "确立记忆资产交易制度。",
        body: "只有认证机构可以主持记忆交易。",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${createdWorld.body.world.id}/assets/${setting.body.asset.id}/relations`)
      .set("authorization", "Bearer session_user_1")
      .send({ targetAssetId: "missing_asset" })
      .expect(404);
  });
});

async function createTestApp(
  authRepository: AuthRepository,
  worldRepository: WorldRepository,
  worldAssetsService: ReturnType<typeof createInMemoryWorldAssetsService>,
) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(WORLD_REPOSITORY)
    .useValue(worldRepository)
    .overrideProvider(WorldAssetsService)
    .useValue(worldAssetsService)
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
    async duplicateWorldAssets() {
      return;
    },
    async listArchiveEntries() { return []; },
    async createArchiveEntry(input) {
      return { id: "archive_unused", ...input, createdAt: new Date(), updatedAt: new Date() } satisfies ArchiveEntryRecord;
    },
    async listStorySeeds() { return []; },
    async createStorySeed(input) {
      return { id: "seed_unused", ...input, createdAt: new Date(), updatedAt: new Date() } satisfies StorySeedRecord;
    },
    async listConflicts() { return []; },
    async createConflict(input) {
      return { id: "conflict_unused", ...input, createdAt: new Date(), updatedAt: new Date() } satisfies ConflictRecord;
    },
    async countAssets() { return { archive: 0, seeds: 0, conflicts: 0 }; },
  };

  return repository;
}

function createInMemoryWorldAssetsService() {
  const assets = new Map<string, WorldAssetRecord>();
  const relations = new Set<string>();

  const hydrateRelations = (asset: WorldAssetRecord) => {
    const labels = [...relations]
      .map((relationKey) => relationKey.split(":"))
      .filter(([worldId, sourceAssetId]) => worldId === asset.worldId && sourceAssetId === asset.id)
      .map(([, , targetAssetId]) => ({
        targetAssetId,
        label: assets.get(targetAssetId)?.title ?? targetAssetId,
      }))
      .filter(Boolean);
    if (labels.length === 0) return asset;

    return {
      ...asset,
      payload: {
        ...asset.payload,
        relationLabels: labels.map((item) => item.label),
        relationTargets: labels,
      },
    };
  };

  return {
    async listAssets(worldId: string, query: { kind?: string; q?: string }) {
      const filtered = [...assets.values()]
        .filter((asset) => asset.worldId === worldId)
        .filter((asset) => !query.kind || asset.kind === query.kind)
        .filter((asset) => !query.q || asset.title.includes(query.q) || asset.summary.includes(query.q))
        .sort((a, b) => a.position - b.position);
      return { assets: filtered.map(hydrateRelations), nextCursor: null };
    },
    async createAsset(worldId: string, input: Partial<WorldAssetRecord> & { kind: WorldAssetRecord["kind"]; title: string; summary: string }) {
      const now = new Date().toISOString();
      const asset: WorldAssetRecord = {
        id: `${input.kind}_${assets.size + 1}`,
        worldId,
        kind: input.kind,
        title: input.title,
        category: input.category,
        summary: input.summary,
        body: input.body,
        payload: input.payload ?? {},
        position: input.position ?? assets.size,
        createdAt: now,
        updatedAt: now,
      };
      assets.set(asset.id, asset);
      return asset;
    },
    async getAsset(worldId: string, assetId: string) {
      const asset = assets.get(assetId);
      return asset?.worldId === worldId ? hydrateRelations(asset) : null;
    },
    async updateAsset(worldId: string, assetId: string, input: Partial<WorldAssetRecord>) {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      const next = {
        ...asset,
        ...input,
        payload: sanitizeStoredPayload(input.payload ?? asset.payload),
        updatedAt: new Date().toISOString(),
      };
      assets.set(assetId, next);
      return next;
    },
    async deleteAsset(worldId: string, assetId: string) {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      assets.delete(assetId);
      for (const relationKey of [...relations]) {
        const [relationWorldId, sourceAssetId, targetAssetId] = relationKey.split(":");
        if (relationWorldId === worldId && (sourceAssetId === assetId || targetAssetId === assetId)) {
          relations.delete(relationKey);
        }
      }
      return asset;
    },
    async reorderAssets(worldId: string, assetIds: string[]) {
      assetIds.forEach((assetId, position) => {
        const asset = assets.get(assetId);
        if (asset?.worldId === worldId) assets.set(assetId, { ...asset, position, updatedAt: new Date().toISOString() });
      });
      return this.listAssets(worldId, {});
    },
    async addRelation(worldId: string, sourceAssetId: string, targetAssetId: string) {
      const source = assets.get(sourceAssetId);
      const target = assets.get(targetAssetId);
      if (source?.worldId !== worldId || target?.worldId !== worldId) return null;
      relations.add(`${worldId}:${sourceAssetId}:${targetAssetId}`);
      return { worldId, sourceAssetId, targetAssetId, createdAt: new Date().toISOString() };
    },
    async deleteRelation(worldId: string, sourceAssetId: string, targetAssetId: string) {
      relations.delete(`${worldId}:${sourceAssetId}:${targetAssetId}`);
      const source = assets.get(sourceAssetId);
      const target = assets.get(targetAssetId);
      if (source?.worldId === worldId && target?.worldId === worldId) {
        assets.set(sourceAssetId, removeStoredRelationLabel(source, target.title));
      }
      return { worldId, sourceAssetId, targetAssetId };
    },
  };
}

function sanitizeStoredPayload(payload: Record<string, unknown> | undefined) {
  if (!payload) return {};
  const { relationLabels: _relationLabels, relationTargets: _relationTargets, ...storedPayload } = payload;
  return storedPayload;
}

function removeStoredRelationLabel(asset: WorldAssetRecord, label: string) {
  const payload = { ...(asset.payload ?? {}) };
  if (Array.isArray(payload.relations)) payload.relations = payload.relations.filter((item) => item !== label);
  if (Array.isArray(payload.related)) payload.related = payload.related.filter((item) => item !== label);
  return { ...asset, payload };
}
