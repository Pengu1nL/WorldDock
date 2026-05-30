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

  it("returns explicit preflight failures for note, license, moderation, and entitlement", async () => {
    const previousPublishingEntitlement = process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED;
    process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED = "0";

    try {
      const auth = createInMemoryAuthRepository();
      const worlds = createInMemoryWorldRepository();
      const repositories = createInMemoryRepositoryRepository();
      addSession(auth, "session_user_1", "user_1", "ren");
      const world = await worlds.createWorld({
        ownerId: "user_1",
        name: "Preflight World",
        type: "科幻",
        summary: "这里包含 api key，会触发发布前审核预扫描。",
        tags: ["preflight"],
        mode: "cloud",
      });
      await worlds.createArchiveEntry({ worldId: world.id, title: "基础规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
      app = await createTestApp(auth, worlds, repositories);

      const preview = await request(app.getHttpServer())
        .post(`/v1/worlds/${world.id}/releases/preview`)
        .set("authorization", "Bearer session_user_1")
        .send({ releaseNote: "", license: "invalid-license" })
        .expect(201);

      expect(preview.body.preflight.ok).toBe(false);
      expect(preview.body.preflight.checks).toContainEqual(expect.objectContaining({ code: "assets", ok: true }));
      expect(preview.body.preflight.checks).toContainEqual(expect.objectContaining({ code: "license", ok: false }));
      expect(preview.body.preflight.checks).toContainEqual(expect.objectContaining({ code: "release_note", ok: false }));
      expect(preview.body.preflight.checks).toContainEqual(expect.objectContaining({ code: "moderation", ok: false }));
      expect(preview.body.preflight.checks).toContainEqual(expect.objectContaining({ code: "entitlement", ok: false }));
    } finally {
      if (previousPublishingEntitlement === undefined) {
        delete process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED;
      } else {
        process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED = previousPublishingEntitlement;
      }
    }
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

    await worlds.createArchiveEntry({ worldId: world.id, title: "第二条规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    const secondPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "第二次发布", license: "free-fork-attribution" })
      .expect(201);

    const rollback = await request(app.getHttpServer())
      .post(`/v1/releases/${secondPublish.body.release.id}/rollback`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);
    expect(rollback.body.release.status).toBe("rolled_back");
  });

  it("rolls back the latest release and restores the previous published snapshot", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Snapshot Rollback World",
      type: "奇幻",
      summary: "需要恢复发布快照。",
      tags: ["rollback"],
      mode: "cloud",
    });
    const oldRule = await worlds.createArchiveEntry({ worldId: world.id, title: "旧规则", category: "世界规则", summary: "旧摘要", body: "旧正文", relations: [] });
    const oldRelated = await worlds.createArchiveEntry({ worldId: world.id, title: "旧关系目标", category: "世界规则", summary: "旧摘要", body: "旧正文", relations: [] });
    await worlds.addAssetRelationForTest(world.id, oldRule.id, oldRelated.id);
    app = await createTestApp(auth, worlds, repositories);

    const firstPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);
    await expect(repositories.findSnapshotByReleaseId(firstPublish.body.release.id)).resolves.toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          assetRelations: [{ sourceAssetId: oldRule.id, targetAssetId: oldRelated.id }],
        }),
      }),
    );

    const newRule = await worlds.createArchiveEntry({ worldId: world.id, title: "新规则", category: "世界规则", summary: "新摘要", body: "新正文", relations: [] });
    await worlds.deleteAssetRelationForTest(world.id, oldRule.id, oldRelated.id);
    await worlds.addAssetRelationForTest(world.id, oldRelated.id, oldRule.id);
    await worlds.addAssetRelationForTest(world.id, oldRule.id, newRule.id);
    const secondPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "补充发布", license: "free-fork-attribution" })
      .expect(201);

    const rollback = await request(app.getHttpServer())
      .post(`/v1/releases/${secondPublish.body.release.id}/rollback`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);

    expect(rollback.body.release).toMatchObject({ id: secondPublish.body.release.id, status: "rolled_back" });
    expect(rollback.body.activeRelease).toMatchObject({ id: firstPublish.body.release.id, status: "published" });
    expect(await worlds.listArchiveEntries(world.id)).toEqual([
      expect.objectContaining({ title: "旧规则" }),
      expect.objectContaining({ title: "旧关系目标" }),
    ]);
    expect(await worlds.listAssetRelationsForTest(world.id)).toEqual([
      { sourceAssetId: oldRule.id, targetAssetId: oldRelated.id },
    ]);
  });

  it("restores the pre-rollback world and release status when rollback event writing fails", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    const outbox = createInMemoryOutboxRepository();
    const originalCreateEvent = outbox.createEvent.bind(outbox);
    outbox.createEvent = async (input) => {
      if (input.type === "repository.release_rolled_back") throw new Error("outbox unavailable");
      return originalCreateEvent(input);
    };
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Rollback Compensation World",
      type: "奇幻",
      summary: "回滚失败时需要恢复。",
      tags: ["rollback"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "旧规则", category: "世界规则", summary: "旧摘要", body: "旧正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories, outbox);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);
    await worlds.createArchiveEntry({ worldId: world.id, title: "新规则", category: "世界规则", summary: "新摘要", body: "新正文", relations: [] });
    const secondPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "补充发布", license: "free-fork-attribution" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/releases/${secondPublish.body.release.id}/rollback`)
      .set("authorization", "Bearer session_user_1")
      .expect(500);

    expect(await repositories.findReleaseById(secondPublish.body.release.id)).toMatchObject({ status: "published" });
    expect(await worlds.listArchiveEntries(world.id)).toEqual([
      expect.objectContaining({ title: "旧规则" }),
      expect.objectContaining({ title: "新规则" }),
    ]);
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

  it("remaps fork snapshot asset references to fork-local target asset ids", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Fork Reference World",
      type: "科幻",
      summary: "上游内部引用需要 remap。",
      tags: ["sync"],
      mode: "cloud",
    });
    const targetRule = await worlds.createArchiveEntry({ worldId: source.id, title: "被引用规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    const sourceSeed = await worlds.createStorySeed({ worldId: source.id, title: "被引用种子", hook: "钩子", trigger: null, conflict: "冲突", protagonists: null, questions: [] });
    const referencingRule = await worlds.createArchiveEntry({
      worldId: source.id,
      title: "引用规则",
      category: "世界规则",
      summary: "摘要",
      body: "正文",
      relations: [`archive:${targetRule.id}`, targetRule.id, "普通标签"],
    });
    await worlds.addAssetRelationForTest(source.id, referencingRule.id, targetRule.id);
    await worlds.createConflict({
      worldId: source.id,
      title: "引用冲突",
      summary: "摘要",
      body: "正文",
      related: [`archive:${targetRule.id}`, targetRule.id, "普通冲突标签"],
      derivedSeeds: [`seed:${sourceSeed.id}`, sourceSeed.id, "普通种子标签"],
    });
    app = await createTestApp(auth, worlds, repositories);

    const publish = await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "初始发布", license: "free-fork-attribution" })
      .expect(201);
    const fork = await request(app.getHttpServer())
      .post(`/v1/repositories/${publish.body.repository.id}/fork`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    const maps = await repositories.listForkAssetMaps(fork.body.fork.id);
    const targetRuleId = rawAssetId(requireForkMap(maps, `archive:${targetRule.id}`).targetAssetId);
    const referencingRuleId = rawAssetId(requireForkMap(maps, `archive:${referencingRule.id}`).targetAssetId);
    const targetSeedId = rawAssetId(requireForkMap(maps, `seed:${sourceSeed.id}`).targetAssetId);
    const forkEntries = await worlds.listArchiveEntries(fork.body.world.id);
    const forkConflicts = await worlds.listConflicts(fork.body.world.id);

    expect(forkEntries.find((entry) => entry.title === "引用规则")?.relations).toEqual([`archive:${targetRuleId}`, targetRule.id, "普通标签"]);
    expect(forkConflicts.find((conflict) => conflict.title === "引用冲突")?.related).toEqual([`archive:${targetRuleId}`, targetRule.id, "普通冲突标签"]);
    expect(forkConflicts.find((conflict) => conflict.title === "引用冲突")?.derivedSeeds).toEqual([`seed:${targetSeedId}`, sourceSeed.id, "普通种子标签"]);
    expect(await worlds.listAssetRelationsForTest(fork.body.world.id)).toEqual([
      { sourceAssetId: referencingRuleId, targetAssetId: targetRuleId },
    ]);
  });

  it("syncs upstream changed and removed assets when the fork did not modify them locally", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Changed Removed Sync World",
      type: "科幻",
      summary: "上游会修改和删除规则。",
      tags: ["sync"],
      mode: "cloud",
    });
    const relationTarget = await worlds.createArchiveEntry({ worldId: source.id, title: "被引用规则", category: "世界规则", summary: "v1", body: "v1", relations: [] });
    const changedEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "待修改规则", category: "世界规则", summary: "v1", body: "v1", relations: [`archive:${relationTarget.id}`, "普通标签"] });
    const removedEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "待删除规则", category: "世界规则", summary: "v1", body: "v1", relations: [] });
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

    await worlds.replaceArchiveEntryForTest(source.id, changedEntry.id, { summary: "v2", body: "v2", relations: [`archive:${relationTarget.id}`, "普通标签"] });
    await worlds.deleteArchiveEntryForTest(source.id, removedEntry.id);
    await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "同步修改和删除", license: "free-fork-attribution" })
      .expect(201);

    const forkEntriesBeforeSync = await worlds.listArchiveEntries(fork.body.world.id);
    expect(forkEntriesBeforeSync).toContainEqual(expect.objectContaining({ title: "被引用规则", summary: "v1" }));
    expect(forkEntriesBeforeSync).toContainEqual(expect.objectContaining({ title: "待修改规则", summary: "v1" }));
    expect(forkEntriesBeforeSync).toContainEqual(expect.objectContaining({ title: "待删除规则", summary: "v1" }));

    const sync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(sync.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "changed", title: "待修改规则" }));
    expect(sync.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "removed", title: "待删除规则" }));
    const forkEntriesAfterSync = await worlds.listArchiveEntries(fork.body.world.id);
    const targetRelationId = rawAssetId(requireForkMap(await repositories.listForkAssetMaps(fork.body.fork.id), `archive:${relationTarget.id}`).targetAssetId);
    expect(forkEntriesAfterSync).toEqual([
      expect.objectContaining({ title: "被引用规则" }),
      expect.objectContaining({ title: "待修改规则", summary: "v2", relations: [`archive:${targetRelationId}`, "普通标签"] }),
    ]);
    expect(forkEntriesAfterSync).not.toContainEqual(expect.objectContaining({ title: "待删除规则" }));
  });

  it("advances fork source release when upstream publishes a no-op asset diff", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "No Op Sync World",
      type: "科幻",
      summary: "上游只更新发布说明。",
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
    const secondPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "无资产变更发布", license: "free-fork-attribution" })
      .expect(201);

    const sync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(sync.body.sync).toMatchObject({
      hasUpstreamChanges: false,
      sourceReleaseId: secondPublish.body.release.id,
      upstreamReleaseId: secondPublish.body.release.id,
      applied: [],
      skipped: [],
    });
    expect(await repositories.findForkById(fork.body.fork.id)).toMatchObject({ sourceReleaseId: secondPublish.body.release.id });
  });

  it("previews and syncs relation-only upstream changes", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Relation Only Sync World",
      type: "科幻",
      summary: "上游只调整资产图关系。",
      tags: ["sync"],
      mode: "cloud",
    });
    const firstRule = await worlds.createArchiveEntry({ worldId: source.id, title: "第一规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    const secondRule = await worlds.createArchiveEntry({ worldId: source.id, title: "第二规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    await worlds.addAssetRelationForTest(source.id, firstRule.id, secondRule.id);
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
    const maps = await repositories.listForkAssetMaps(fork.body.fork.id);
    const firstTargetId = rawAssetId(requireForkMap(maps, `archive:${firstRule.id}`).targetAssetId);
    const secondTargetId = rawAssetId(requireForkMap(maps, `archive:${secondRule.id}`).targetAssetId);
    expect(await worlds.listAssetRelationsForTest(fork.body.world.id)).toEqual([
      { sourceAssetId: firstTargetId, targetAssetId: secondTargetId },
    ]);

    await worlds.deleteAssetRelationForTest(source.id, firstRule.id, secondRule.id);
    await worlds.addAssetRelationForTest(source.id, secondRule.id, firstRule.id);
    const secondPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "只调整关系", license: "free-fork-attribution" })
      .expect(201);

    const preview = await request(app.getHttpServer())
      .get(`/v1/forks/${fork.body.fork.id}/upstream-diff`)
      .set("authorization", "Bearer session_user_2")
      .expect(200);
    expect(preview.body.diff).toMatchObject({
      hasUpstreamChanges: true,
      sourceReleaseId: firstPublish.body.release.id,
      upstreamReleaseId: secondPublish.body.release.id,
    });
    expect(preview.body.diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "added" }),
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "removed" }),
    ]));

    const sync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(sync.body.sync).toMatchObject({
      sourceReleaseId: secondPublish.body.release.id,
      skipped: [],
    });
    expect(sync.body.sync.applied).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "added" }),
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "removed" }),
    ]));
    expect(await worlds.listAssetRelationsForTest(fork.body.world.id)).toEqual([
      { sourceAssetId: secondTargetId, targetAssetId: firstTargetId },
    ]);
    expect(await repositories.findForkById(fork.body.fork.id)).toMatchObject({ sourceReleaseId: secondPublish.body.release.id });

    await repositories.updateForkSourceRelease(fork.body.fork.id, firstPublish.body.release.id);
    const retry = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(retry.body.sync).toMatchObject({
      sourceReleaseId: secondPublish.body.release.id,
      skipped: [],
    });
    expect(retry.body.sync.applied).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "added" }),
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "removed" }),
    ]));
    expect(await worlds.listAssetRelationsForTest(fork.body.world.id)).toEqual([
      { sourceAssetId: secondTargetId, targetAssetId: firstTargetId },
    ]);
    expect(await repositories.findForkById(fork.body.fork.id)).toMatchObject({ sourceReleaseId: secondPublish.body.release.id });
  });

  it("skips relation-only sync when the fork changed relations locally", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Relation Local Conflict World",
      type: "科幻",
      summary: "fork 本地关系图变更不能被静默覆盖。",
      tags: ["sync"],
      mode: "cloud",
    });
    const firstRule = await worlds.createArchiveEntry({ worldId: source.id, title: "第一规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    const secondRule = await worlds.createArchiveEntry({ worldId: source.id, title: "第二规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    const thirdRule = await worlds.createArchiveEntry({ worldId: source.id, title: "第三规则", category: "世界规则", summary: "摘要", body: "正文", relations: [] });
    await worlds.addAssetRelationForTest(source.id, firstRule.id, secondRule.id);
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
    const maps = await repositories.listForkAssetMaps(fork.body.fork.id);
    const firstTargetId = rawAssetId(requireForkMap(maps, `archive:${firstRule.id}`).targetAssetId);
    const secondTargetId = rawAssetId(requireForkMap(maps, `archive:${secondRule.id}`).targetAssetId);
    const thirdTargetId = rawAssetId(requireForkMap(maps, `archive:${thirdRule.id}`).targetAssetId);
    await worlds.deleteAssetRelationForTest(fork.body.world.id, firstTargetId, secondTargetId);
    await worlds.addAssetRelationForTest(fork.body.world.id, thirdTargetId, firstTargetId);

    await worlds.deleteAssetRelationForTest(source.id, firstRule.id, secondRule.id);
    await worlds.addAssetRelationForTest(source.id, secondRule.id, thirdRule.id);
    const secondPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "上游只调整关系", license: "free-fork-attribution" })
      .expect(201);

    const sync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(sync.body.sync.sourceReleaseId).toBe(firstPublish.body.release.id);
    expect(sync.body.sync.upstreamReleaseId).toBe(secondPublish.body.release.id);
    expect(sync.body.sync.applied).toEqual([]);
    expect(sync.body.sync.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "added" }),
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "removed" }),
    ]));
    expect(await worlds.listAssetRelationsForTest(fork.body.world.id)).toEqual([
      { sourceAssetId: thirdTargetId, targetAssetId: firstTargetId },
    ]);
    expect(await repositories.findForkById(fork.body.fork.id)).toMatchObject({ sourceReleaseId: firstPublish.body.release.id });
  });

  it("does not duplicate already mapped added assets when retrying partial fork sync", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Partial Sync Retry World",
      type: "科幻",
      summary: "部分同步失败后需要幂等重试。",
      tags: ["sync"],
      mode: "cloud",
    });
    const changedEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "会冲突规则", category: "世界规则", summary: "v1", body: "v1", relations: [] });
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

    const changedTargetId = rawAssetId(requireForkMap(await repositories.listForkAssetMaps(fork.body.fork.id), `archive:${changedEntry.id}`).targetAssetId);
    await worlds.replaceArchiveEntryForTest(fork.body.world.id, changedTargetId, { summary: "fork local", body: "fork local" });
    await worlds.replaceArchiveEntryForTest(source.id, changedEntry.id, { summary: "v2", body: "v2" });
    const addedEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "新增但只应同步一次", category: "世界规则", summary: "v2", body: "v2", relations: [] });
    await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "新增和冲突", license: "free-fork-attribution" })
      .expect(201);

    const firstSync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(firstSync.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "added", title: "新增但只应同步一次" }));
    expect(firstSync.body.sync.skipped).toContainEqual(expect.objectContaining({ kind: "changed", title: "会冲突规则" }));
    const mapsAfterFirstSync = await repositories.listForkAssetMaps(fork.body.fork.id);
    const addedTargetAfterFirstSync = requireForkMap(mapsAfterFirstSync, `archive:${addedEntry.id}`).targetAssetId;
    expect((await worlds.listArchiveEntries(fork.body.world.id)).filter((entry) => entry.title === "新增但只应同步一次")).toHaveLength(1);

    const secondSync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(secondSync.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "added", title: "新增但只应同步一次" }));
    expect(secondSync.body.sync.skipped).toContainEqual(expect.objectContaining({ kind: "changed", title: "会冲突规则" }));
    const mapsAfterSecondSync = await repositories.listForkAssetMaps(fork.body.fork.id);
    expect(requireForkMap(mapsAfterSecondSync, `archive:${addedEntry.id}`).targetAssetId).toBe(addedTargetAfterFirstSync);
    expect((await worlds.listArchiveEntries(fork.body.world.id)).filter((entry) => entry.title === "新增但只应同步一次")).toHaveLength(1);
  });

  it("does not replace fork relations when the same sync has skipped asset changes", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Relation Skipped Sync World",
      type: "科幻",
      summary: "资产冲突时关系图不能提前替换。",
      tags: ["sync"],
      mode: "cloud",
    });
    const changedRule = await worlds.createArchiveEntry({ worldId: source.id, title: "会本地冲突", category: "世界规则", summary: "v1", body: "v1", relations: [] });
    const stableRule = await worlds.createArchiveEntry({ worldId: source.id, title: "稳定规则", category: "世界规则", summary: "v1", body: "v1", relations: [] });
    await worlds.addAssetRelationForTest(source.id, changedRule.id, stableRule.id);
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
    const maps = await repositories.listForkAssetMaps(fork.body.fork.id);
    const changedTargetId = rawAssetId(requireForkMap(maps, `archive:${changedRule.id}`).targetAssetId);
    const stableTargetId = rawAssetId(requireForkMap(maps, `archive:${stableRule.id}`).targetAssetId);
    await worlds.replaceArchiveEntryForTest(fork.body.world.id, changedTargetId, { summary: "fork local", body: "fork local" });

    await worlds.replaceArchiveEntryForTest(source.id, changedRule.id, { summary: "v2", body: "v2" });
    await worlds.deleteAssetRelationForTest(source.id, changedRule.id, stableRule.id);
    await worlds.addAssetRelationForTest(source.id, stableRule.id, changedRule.id);
    const secondPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "资产冲突和关系变化", license: "free-fork-attribution" })
      .expect(201);

    const sync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(sync.body.sync.sourceReleaseId).toBe(firstPublish.body.release.id);
    expect(sync.body.sync.upstreamReleaseId).toBe(secondPublish.body.release.id);
    expect(sync.body.sync.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "changed", title: "会本地冲突" }),
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "added" }),
      expect.objectContaining({ assetId: expect.stringMatching(/^relation:/), kind: "removed" }),
    ]));
    expect(await worlds.listAssetRelationsForTest(fork.body.world.id)).toEqual([
      { sourceAssetId: changedTargetId, targetAssetId: stableTargetId },
    ]);
    expect(await repositories.findForkById(fork.body.fork.id)).toMatchObject({ sourceReleaseId: firstPublish.body.release.id });
  });

  it("does not duplicate added assets when map upsert fails before retry", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Added Map Retry World",
      type: "科幻",
      summary: "map 写失败后不应重复复制。",
      tags: ["sync"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: source.id, title: "基础规则", category: "世界规则", summary: "v1", body: "v1", relations: [] });
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
    const addedEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "新增映射失败规则", category: "世界规则", summary: "v2", body: "v2", relations: [] });
    await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "新增发布", license: "free-fork-attribution" })
      .expect(201);

    repositories.failNextForkAssetMapUpsertForTest();
    await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(500);
    expect((await worlds.listArchiveEntries(fork.body.world.id)).filter((entry) => entry.title === "新增映射失败规则")).toHaveLength(1);

    const retry = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(retry.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "added", title: "新增映射失败规则" }));
    expect(requireForkMap(await repositories.listForkAssetMaps(fork.body.fork.id), `archive:${addedEntry.id}`)).toBeTruthy();
    expect((await worlds.listArchiveEntries(fork.body.world.id)).filter((entry) => entry.title === "新增映射失败规则")).toHaveLength(1);
  });

  it("keeps changed and removed fork sync retry idempotent after a partial skip", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Changed Removed Retry World",
      type: "科幻",
      summary: "changed/removed 成功后也要能重试。",
      tags: ["sync"],
      mode: "cloud",
    });
    const changedEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "会成功修改", category: "世界规则", summary: "v1", body: "v1", relations: [] });
    const removedEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "会成功删除", category: "世界规则", summary: "v1", body: "v1", relations: [] });
    const conflictEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "会本地冲突", category: "世界规则", summary: "v1", body: "v1", relations: [] });
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

    const initialMaps = await repositories.listForkAssetMaps(fork.body.fork.id);
    const conflictTargetId = rawAssetId(requireForkMap(initialMaps, `archive:${conflictEntry.id}`).targetAssetId);
    await worlds.replaceArchiveEntryForTest(fork.body.world.id, conflictTargetId, { summary: "fork local", body: "fork local" });
    await worlds.replaceArchiveEntryForTest(source.id, changedEntry.id, { summary: "v2", body: "v2" });
    await worlds.deleteArchiveEntryForTest(source.id, removedEntry.id);
    await worlds.replaceArchiveEntryForTest(source.id, conflictEntry.id, { summary: "v2", body: "v2" });
    await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "修改删除和冲突", license: "free-fork-attribution" })
      .expect(201);

    const firstSync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(firstSync.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "changed", title: "会成功修改" }));
    expect(firstSync.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "removed", title: "会成功删除" }));
    expect(firstSync.body.sync.skipped).toContainEqual(expect.objectContaining({ kind: "changed", title: "会本地冲突" }));
    const mapsAfterFirstSync = await repositories.listForkAssetMaps(fork.body.fork.id);
    const changedTargetId = rawAssetId(requireForkMap(mapsAfterFirstSync, `archive:${changedEntry.id}`).targetAssetId);
    const removedMapAfterFirstSync = requireForkMap(mapsAfterFirstSync, `archive:${removedEntry.id}`);
    expect(await worlds.listArchiveEntries(fork.body.world.id)).toContainEqual(expect.objectContaining({ id: changedTargetId, summary: "v2" }));
    expect(await worlds.listArchiveEntries(fork.body.world.id)).not.toContainEqual(expect.objectContaining({ title: "会成功删除" }));

    const secondSync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(secondSync.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "changed", title: "会成功修改" }));
    expect(secondSync.body.sync.applied).toContainEqual(expect.objectContaining({ kind: "removed", title: "会成功删除" }));
    expect(secondSync.body.sync.skipped).toContainEqual(expect.objectContaining({ kind: "changed", title: "会本地冲突" }));
    const mapsAfterSecondSync = await repositories.listForkAssetMaps(fork.body.fork.id);
    expect(requireForkMap(mapsAfterSecondSync, `archive:${changedEntry.id}`).targetAssetId).toBe(`archive:${changedTargetId}`);
    expect(requireForkMap(mapsAfterSecondSync, `archive:${removedEntry.id}`).targetAssetId).toBe(removedMapAfterFirstSync.targetAssetId);
    expect((await worlds.listArchiveEntries(fork.body.world.id)).filter((entry) => entry.title === "会成功修改")).toHaveLength(1);
    expect(await worlds.listArchiveEntries(fork.body.world.id)).not.toContainEqual(expect.objectContaining({ title: "会成功删除" }));
  });
});

async function createTestApp(
  authRepository: AuthRepository,
  worldRepository: WorldRepository,
  repositoryRepository: RepositoryRepository,
  outboxRepository: OutboxRepository = createInMemoryOutboxRepository(),
  searchClient: RepositorySearchClient = createInMemorySearchClient(),
) {
  repositoryRepository.rollbackReleaseWithSnapshot ??= async (input) => {
    await outboxRepository.createEvent(input.event);
    const restored = await worldRepository.replaceWorldFromSnapshot({
      worldId: input.worldId,
      snapshot: input.snapshot,
      status: "published",
      visibility: "public",
    });
    if (!restored) return null;
    return repositoryRepository.updateReleaseStatus(input.releaseId, "rolled_back");
  };
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

type TestWorldRepository = WorldRepository & {
  replaceArchiveEntryForTest(worldId: string, id: string, input: Partial<ArchiveEntryRecord>): Promise<ArchiveEntryRecord | null>;
  deleteArchiveEntryForTest(worldId: string, id: string): Promise<boolean>;
  addAssetRelationForTest(worldId: string, sourceAssetId: string, targetAssetId: string): Promise<void>;
  deleteAssetRelationForTest(worldId: string, sourceAssetId: string, targetAssetId: string): Promise<void>;
  listAssetRelationsForTest(worldId: string): Promise<Array<{ sourceAssetId: string; targetAssetId: string }>>;
};

function createInMemoryWorldRepository(): TestWorldRepository {
  const worlds = new Map<string, WorldRecord>();
  const archiveEntries = new Map<string, ArchiveEntryRecord>();
  const storySeeds = new Map<string, StorySeedRecord>();
  const conflicts = new Map<string, ConflictRecord>();
  const assetRelations = new Set<string>();
  const encodeAssetRelation = (worldId: string, sourceAssetId: string, targetAssetId: string) =>
    JSON.stringify([worldId, sourceAssetId, targetAssetId]);
  const decodeAssetRelation = (relation: string) => {
    const [worldId, sourceAssetId, targetAssetId] = JSON.parse(relation) as [string, string, string];
    return { worldId, sourceAssetId, targetAssetId };
  };
  const repository: TestWorldRepository = {
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
    async createArchiveEntry(input) {
      const requestedId = (input as Partial<ArchiveEntryRecord>).id;
      const entry = { ...input, id: requestedId ?? `archive_${archiveEntries.size + 1}`, relations: input.relations ?? [], position: input.position ?? 0, createdAt: new Date(), updatedAt: new Date() };
      archiveEntries.set(archiveEntryKey(entry.worldId, entry.id), entry);
      return entry;
    },
    async replaceArchiveEntryForTest(worldId: string, id: string, input: Partial<ArchiveEntryRecord>) {
      const entry = archiveEntries.get(archiveEntryKey(worldId, id));
      if (!entry) return null;
      const next = { ...entry, ...input, updatedAt: new Date() };
      archiveEntries.delete(archiveEntryKey(worldId, id));
      archiveEntries.set(archiveEntryKey(next.worldId, next.id), next);
      return next;
    },
    async deleteArchiveEntryForTest(worldId: string, id: string) {
      return archiveEntries.delete(archiveEntryKey(worldId, id));
    },
    async listStorySeeds(worldId) { return [...storySeeds.values()].filter((seed) => seed.worldId === worldId); },
    async createStorySeed(input) { const seed = { id: (input as Partial<StorySeedRecord>).id ?? `seed_${storySeeds.size + 1}`, ...input, questions: input.questions ?? [], position: input.position ?? 0, createdAt: new Date(), updatedAt: new Date() }; storySeeds.set(seed.id, seed); return seed; },
    async listConflicts(worldId) { return [...conflicts.values()].filter((conflict) => conflict.worldId === worldId); },
    async createConflict(input) { const conflict = { id: (input as Partial<ConflictRecord>).id ?? `conflict_${conflicts.size + 1}`, ...input, related: input.related ?? [], derivedSeeds: input.derivedSeeds ?? [], position: input.position ?? 0, createdAt: new Date(), updatedAt: new Date() }; conflicts.set(conflict.id, conflict); return conflict; },
    async listAssetRelations(worldId) {
      return [...assetRelations]
        .map(decodeAssetRelation)
        .filter((relation) => relation.worldId === worldId)
        .map(({ sourceAssetId, targetAssetId }) => ({ sourceAssetId, targetAssetId }));
    },
    async countAssets(worldId) {
      return {
        archive: [...archiveEntries.values()].filter((entry) => entry.worldId === worldId).length,
        seeds: [...storySeeds.values()].filter((seed) => seed.worldId === worldId).length,
        conflicts: [...conflicts.values()].filter((conflict) => conflict.worldId === worldId).length,
      };
    },
    async replaceWorldFromSnapshot(input) {
      const world = worlds.get(input.worldId);
      if (!world || world.deletedAt) return null;
      for (const [key, entry] of archiveEntries) if (entry.worldId === input.worldId) archiveEntries.delete(key);
      for (const [key, seed] of storySeeds) if (seed.worldId === input.worldId) storySeeds.delete(key);
      for (const [key, conflict] of conflicts) if (conflict.worldId === input.worldId) conflicts.delete(key);
      const nextWorld = {
        ...world,
        name: input.snapshot.world.name,
        type: input.snapshot.world.type,
        summary: input.snapshot.world.summary,
        tags: input.snapshot.world.tags,
        maturity: input.snapshot.world.maturity,
        status: input.status,
        visibility: input.visibility,
        updatedAt: new Date(),
      };
      worlds.set(input.worldId, nextWorld);
      for (const entry of input.snapshot.archiveEntries) {
        const created = { ...entry, worldId: input.worldId, relations: entry.relations ?? [], position: 0, createdAt: new Date(), updatedAt: new Date() };
        archiveEntries.set(archiveEntryKey(input.worldId, created.id), created);
      }
      for (const seed of input.snapshot.storySeeds) {
        const created = { ...seed, worldId: input.worldId, questions: seed.questions ?? [], position: 0, createdAt: new Date(), updatedAt: new Date() };
        storySeeds.set(created.id, created);
      }
      for (const conflict of input.snapshot.conflicts) {
        const created = { ...conflict, worldId: input.worldId, related: conflict.related ?? [], derivedSeeds: conflict.derivedSeeds ?? [], position: 0, createdAt: new Date(), updatedAt: new Date() };
        conflicts.set(created.id, created);
      }
      const snapshotAssetIds = new Set([
        ...input.snapshot.archiveEntries.map((entry) => entry.id),
        ...input.snapshot.storySeeds.map((seed) => seed.id),
        ...input.snapshot.conflicts.map((conflict) => conflict.id),
      ]);
      for (const relation of [...assetRelations]) {
        const { worldId } = decodeAssetRelation(relation);
        if (worldId === input.worldId) assetRelations.delete(relation);
      }
      for (const relation of input.snapshot.assetRelations) {
        if (snapshotAssetIds.has(relation.sourceAssetId) && snapshotAssetIds.has(relation.targetAssetId)) {
          assetRelations.add(encodeAssetRelation(input.worldId, relation.sourceAssetId, relation.targetAssetId));
        }
      }
      return nextWorld;
    },
    async createAssetFromSnapshot(input) {
      const asset = findSnapshotAssetForTest(input.snapshot, input.upstreamAssetId);
      if (!asset) return null;
      if (asset.kind === "archive") {
        if (input.targetAssetId) {
          const parsed = parseAssetIdForTest(input.targetAssetId);
          if (parsed?.kind === "archive" && archiveEntries.has(archiveEntryKey(input.worldId, parsed.id))) {
            return { upstreamAssetId: input.upstreamAssetId, targetAssetId: input.targetAssetId, kind: "archive" };
          }
        }
        const { id: _id, ...record } = asset.record;
        const parsed = input.targetAssetId ? parseAssetIdForTest(input.targetAssetId) : null;
        const created = await repository.createArchiveEntry({ ...record, id: parsed?.kind === "archive" ? parsed.id : undefined, worldId: input.worldId } as Parameters<WorldRepository["createArchiveEntry"]>[0]);
        return { upstreamAssetId: input.upstreamAssetId, targetAssetId: `archive:${created.id}`, kind: "archive" };
      }
      if (asset.kind === "seed") {
        if (input.targetAssetId) {
          const parsed = parseAssetIdForTest(input.targetAssetId);
          const existing = parsed?.kind === "seed" ? storySeeds.get(parsed.id) : null;
          if (existing?.worldId === input.worldId) {
            return { upstreamAssetId: input.upstreamAssetId, targetAssetId: input.targetAssetId, kind: "seed" };
          }
        }
        const { id: _id, ...record } = asset.record;
        const parsed = input.targetAssetId ? parseAssetIdForTest(input.targetAssetId) : null;
        const created = await repository.createStorySeed({ ...record, id: parsed?.kind === "seed" ? parsed.id : undefined, worldId: input.worldId } as Parameters<WorldRepository["createStorySeed"]>[0]);
        return { upstreamAssetId: input.upstreamAssetId, targetAssetId: `seed:${created.id}`, kind: "seed" };
      }
      if (input.targetAssetId) {
        const parsed = parseAssetIdForTest(input.targetAssetId);
        const existing = parsed?.kind === "conflict" ? conflicts.get(parsed.id) : null;
        if (existing?.worldId === input.worldId) {
          return { upstreamAssetId: input.upstreamAssetId, targetAssetId: input.targetAssetId, kind: "conflict" };
        }
      }
      const { id: _id, ...record } = asset.record;
      const parsed = input.targetAssetId ? parseAssetIdForTest(input.targetAssetId) : null;
      const created = await repository.createConflict({ ...record, id: parsed?.kind === "conflict" ? parsed.id : undefined, worldId: input.worldId } as Parameters<WorldRepository["createConflict"]>[0]);
      return { upstreamAssetId: input.upstreamAssetId, targetAssetId: `conflict:${created.id}`, kind: "conflict" };
    },
    async remapForkAssetReferences(input) {
      for (const [key, entry] of archiveEntries) {
        if (entry.worldId !== input.worldId) continue;
        archiveEntries.set(key, { ...entry, relations: remapKnownAssetRefsForTest(entry.relations ?? [], input.assetMaps), updatedAt: new Date() });
      }
      for (const [key, conflict] of conflicts) {
        if (conflict.worldId !== input.worldId) continue;
        conflicts.set(key, {
          ...conflict,
          related: remapKnownAssetRefsForTest(conflict.related ?? [], input.assetMaps),
          derivedSeeds: remapKnownAssetRefsForTest(conflict.derivedSeeds ?? [], input.assetMaps),
          updatedAt: new Date(),
        });
      }
    },
    async replaceForkAssetRelationsFromSnapshot(input) {
      const relations = remapSnapshotAssetRelationsForTest(input.snapshot, input.assetMaps);
      if (!relations) return false;
      for (const relation of [...assetRelations]) {
        const { worldId } = decodeAssetRelation(relation);
        if (worldId === input.worldId) assetRelations.delete(relation);
      }
      for (const relation of relations) {
        assetRelations.add(encodeAssetRelation(input.worldId, relation.sourceAssetId, relation.targetAssetId));
      }
      return true;
    },
    async forkAssetRelationsMatchSnapshot(input) {
      const expected = remapSnapshotAssetRelationsForTest(input.snapshot, input.assetMaps);
      if (!expected) return false;
      const current = await repository.listAssetRelations(input.worldId);
      return sameAssetRelationsForTest(current, expected);
    },
    async applyForkSnapshotChange(input) {
      const source = findSnapshotAssetForTest(input.sourceSnapshot, input.change.assetId);
      if (!source) return { status: "skipped", change: input.change, reason: "missing_source" };
      const upstream = input.change.kind === "changed" ? findSnapshotAssetForTest(input.upstreamSnapshot, input.change.assetId) : null;
      if (input.change.kind === "changed" && !upstream) return { status: "skipped", change: input.change, reason: "missing_upstream" };
      if (!input.targetAsset) return { status: "skipped", change: input.change, reason: "missing_source" };
      const target = findTargetAssetForTest(input.worldId, input.targetAsset.targetAssetId, archiveEntries, storySeeds, conflicts);
      const remappedSource = remapSnapshotAssetReferencesForTest(source, input.assetMaps ?? []);
      const remappedUpstream = upstream ? remapSnapshotAssetReferencesForTest(upstream, input.assetMaps ?? []) : null;
      if (!target) {
        return input.change.kind === "removed"
          ? { status: "applied", change: input.change }
          : { status: "skipped", change: input.change, reason: "local_conflict" };
      }
      if (target.kind !== source.kind) {
        return { status: "skipped", change: input.change, reason: "local_conflict" };
      }
      const parsed = parseAssetIdForTest(input.targetAsset.targetAssetId);
      if (!parsed) return { status: "skipped", change: input.change, reason: "missing_source" };
      if (input.change.kind === "changed" && remappedUpstream && stableAssetHashForTest(target.record) === stableAssetHashForTest(remappedUpstream.record)) {
        return { status: "applied", change: input.change };
      }
      if (stableAssetHashForTest(target.record) !== stableAssetHashForTest(remappedSource.record)) {
        return { status: "skipped", change: input.change, reason: "local_conflict" };
      }
      if (input.change.kind === "removed") {
        if (parsed.kind === "archive") archiveEntries.delete(archiveEntryKey(input.worldId, parsed.id));
        if (parsed.kind === "seed") storySeeds.delete(parsed.id);
        if (parsed.kind === "conflict") conflicts.delete(parsed.id);
        for (const relation of [...assetRelations]) {
          const { worldId, sourceAssetId, targetAssetId } = decodeAssetRelation(relation);
          if (worldId === input.worldId && (sourceAssetId === parsed.id || targetAssetId === parsed.id)) {
            assetRelations.delete(relation);
          }
        }
        return { status: "applied", change: input.change };
      }
      if (!upstream || upstream.kind !== parsed.kind) return { status: "skipped", change: input.change, reason: "missing_upstream" };
      const updateAsset = remapSnapshotAssetReferencesForTest(upstream, input.assetMaps ?? []);
      if (parsed.kind === "archive" && upstream.kind === "archive") {
        const current = archiveEntries.get(archiveEntryKey(input.worldId, parsed.id));
        if (current && updateAsset.kind === "archive") archiveEntries.set(archiveEntryKey(input.worldId, parsed.id), { ...current, ...updateAsset.record, id: parsed.id, worldId: input.worldId, updatedAt: new Date() });
      }
      if (parsed.kind === "seed" && upstream.kind === "seed") {
        const current = storySeeds.get(parsed.id);
        if (current && updateAsset.kind === "seed") storySeeds.set(parsed.id, { ...current, ...updateAsset.record, id: parsed.id, worldId: input.worldId, updatedAt: new Date() });
      }
      if (parsed.kind === "conflict" && upstream.kind === "conflict") {
        const current = conflicts.get(parsed.id);
        if (current && updateAsset.kind === "conflict") conflicts.set(parsed.id, { ...current, ...updateAsset.record, id: parsed.id, worldId: input.worldId, updatedAt: new Date() });
      }
      return { status: "applied", change: input.change };
    },
    async addAssetRelationForTest(worldId, sourceAssetId, targetAssetId) {
      assetRelations.add(encodeAssetRelation(worldId, sourceAssetId, targetAssetId));
    },
    async deleteAssetRelationForTest(worldId, sourceAssetId, targetAssetId) {
      assetRelations.delete(encodeAssetRelation(worldId, sourceAssetId, targetAssetId));
    },
    async listAssetRelationsForTest(worldId) {
      return [...assetRelations]
        .map(decodeAssetRelation)
        .filter((relation) => relation.worldId === worldId)
        .map(({ sourceAssetId, targetAssetId }) => ({ sourceAssetId, targetAssetId }));
    },
  };
  return repository;
}

function archiveEntryKey(worldId: string, id: string) {
  return `${worldId}:${id}`;
}

function parseAssetIdForTest(assetId: string) {
  const separator = assetId.indexOf(":");
  if (separator === -1) return null;
  const kind = assetId.slice(0, separator);
  const id = assetId.slice(separator + 1);
  if (!id || (kind !== "archive" && kind !== "seed" && kind !== "conflict")) return null;
  return { kind, id } as const;
}

function requireForkMap(maps: Awaited<ReturnType<RepositoryRepository["listForkAssetMaps"]>>, upstreamAssetId: string) {
  const map = maps.find((item) => item.upstreamAssetId === upstreamAssetId);
  if (!map) throw new Error(`Missing fork asset map for ${upstreamAssetId}`);
  return map;
}

function rawAssetId(assetId: string) {
  return parseAssetIdForTest(assetId)?.id ?? assetId;
}

function findSnapshotAssetForTest(snapshot: Parameters<WorldRepository["createAssetFromSnapshot"]>[0]["snapshot"], assetId: string) {
  const parsed = parseAssetIdForTest(assetId);
  if (!parsed) return null;
  if (parsed.kind === "archive") {
    const record = snapshot.archiveEntries.find((entry) => entry.id === parsed.id);
    return record ? { kind: "archive" as const, record: { ...record, worldId: "" } } : null;
  }
  if (parsed.kind === "seed") {
    const record = snapshot.storySeeds.find((seed) => seed.id === parsed.id);
    return record ? { kind: "seed" as const, record: { ...record, worldId: "" } } : null;
  }
  const record = snapshot.conflicts.find((conflict) => conflict.id === parsed.id);
  return record ? { kind: "conflict" as const, record: { ...record, worldId: "" } } : null;
}

function remapSnapshotAssetReferencesForTest(asset: NonNullable<ReturnType<typeof findSnapshotAssetForTest>>, assetMaps: Parameters<WorldRepository["remapForkAssetReferences"]>[0]["assetMaps"]) {
  if (asset.kind === "archive") {
    return { kind: "archive" as const, record: { ...asset.record, relations: remapKnownAssetRefsForTest(asset.record.relations ?? [], assetMaps) } };
  }
  if (asset.kind === "conflict") {
    return {
      kind: "conflict" as const,
      record: {
        ...asset.record,
        related: remapKnownAssetRefsForTest(asset.record.related ?? [], assetMaps),
        derivedSeeds: remapKnownAssetRefsForTest(asset.record.derivedSeeds ?? [], assetMaps),
      },
    };
  }
  return asset;
}

function remapKnownAssetRefsForTest(values: string[], assetMaps: Parameters<WorldRepository["remapForkAssetReferences"]>[0]["assetMaps"]) {
  const remap = new Map<string, string>();
  for (const assetMap of assetMaps) {
    remap.set(assetMap.upstreamAssetId, assetMap.targetAssetId);
  }
  return values.map((value) => remap.get(value) ?? value);
}

function remapSnapshotAssetRelationsForTest(
  snapshot: Parameters<WorldRepository["replaceForkAssetRelationsFromSnapshot"]>[0]["snapshot"],
  assetMaps: Parameters<WorldRepository["replaceForkAssetRelationsFromSnapshot"]>[0]["assetMaps"],
) {
  const rawIdMap = new Map<string, string>();
  for (const assetMap of assetMaps) {
    const upstream = parseAssetIdForTest(assetMap.upstreamAssetId);
    const target = parseAssetIdForTest(assetMap.targetAssetId);
    if (!upstream || !target) continue;
    rawIdMap.set(upstream.id, target.id);
  }

  const relations: Array<{ sourceAssetId: string; targetAssetId: string }> = [];
  for (const relation of snapshot.assetRelations) {
    const sourceAssetId = rawIdMap.get(relation.sourceAssetId);
    const targetAssetId = rawIdMap.get(relation.targetAssetId);
    if (!sourceAssetId || !targetAssetId) return null;
    relations.push({ sourceAssetId, targetAssetId });
  }
  return relations;
}

function sameAssetRelationsForTest(
  left: Array<{ sourceAssetId: string; targetAssetId: string }>,
  right: Array<{ sourceAssetId: string; targetAssetId: string }>,
) {
  if (left.length !== right.length) return false;
  const normalizedLeft = left.map(formatAssetRelationForTest).sort();
  const normalizedRight = right.map(formatAssetRelationForTest).sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function formatAssetRelationForTest(relation: { sourceAssetId: string; targetAssetId: string }) {
  return `${relation.sourceAssetId}\0${relation.targetAssetId}`;
}

function findTargetAssetForTest(
  worldId: string,
  assetId: string,
  archiveEntries: Map<string, ArchiveEntryRecord>,
  storySeeds: Map<string, StorySeedRecord>,
  conflicts: Map<string, ConflictRecord>,
) {
  const parsed = parseAssetIdForTest(assetId);
  if (!parsed) return null;
  if (parsed.kind === "archive") {
    const record = archiveEntries.get(archiveEntryKey(worldId, parsed.id));
    return record ? { kind: "archive" as const, record } : null;
  }
  if (parsed.kind === "seed") {
    const record = storySeeds.get(parsed.id);
    return record?.worldId === worldId ? { kind: "seed" as const, record } : null;
  }
  const record = conflicts.get(parsed.id);
  return record?.worldId === worldId ? { kind: "conflict" as const, record } : null;
}

function stableAssetHashForTest(value: unknown) {
  return JSON.stringify(stripVolatileAssetFieldsForTest(value));
}

function stripVolatileAssetFieldsForTest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatileAssetFieldsForTest);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["id", "worldId", "position", "createdAt", "updatedAt"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stripVolatileAssetFieldsForTest(nested)]),
  );
}

function createInMemoryRepositoryRepository() {
  const repositories = new Map<string, PublicRepositoryRecord>();
  const releases = new Map<string, ReleaseRecord>();
  const snapshots = new Map<string, ReleaseSnapshotRecord>();
  const forks: ForkRecord[] = [];
  const assetMaps = new Map<string, any>();
  let releaseSequence = 0;
  let failNextForkAssetMapUpsert = false;
  const collections = new Map<string, any>();
  const repository: RepositoryRepository & { failNextForkAssetMapUpsertForTest(): void } = {
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
      const sequence = releaseSequence++;
      const release = { id: `rel_${sequence + 1}`, createdAt: new Date(Date.now() + sequence), status: input.status ?? "published", changes: input.changes ?? [], ...input };
      releases.set(release.id, release);
      return release;
    },
    async findReleaseById(id) { return releases.get(id) ?? null; },
    async updateReleaseStatus(id, status) { const release = releases.get(id); if (!release) return null; const next = { ...release, status }; releases.set(id, next); return next; },
    async listReleases(repositoryId) {
      return [...releases.values()]
        .filter((release) => release.repositoryId === repositoryId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || Number(b.id.replace("rel_", "")) - Number(a.id.replace("rel_", "")));
    },
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
    async createForkAssetMaps(input) {
      return Promise.all(input.map((map) => repository.upsertForkAssetMap(map)));
    },
    async listForkAssetMaps(forkId) {
      return [...assetMaps.values()].filter((map) => map.forkId === forkId);
    },
    async upsertForkAssetMap(input) {
      if (failNextForkAssetMapUpsert) {
        failNextForkAssetMapUpsert = false;
        throw new Error("fork asset map upsert failed");
      }
      const key = `${input.forkId}:${input.upstreamAssetId}`;
      const existing = assetMaps.get(key);
      const now = new Date();
      const next = existing
        ? { ...existing, ...input, updatedAt: now }
        : { id: `fork_asset_map_${assetMaps.size + 1}`, createdAt: now, updatedAt: now, ...input };
      assetMaps.set(key, next);
      return next;
    },
    async deleteForkAssetMap(forkId, upstreamAssetId) {
      const key = `${forkId}:${upstreamAssetId}`;
      const existing = assetMaps.get(key) ?? null;
      assetMaps.delete(key);
      return existing;
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
    failNextForkAssetMapUpsertForTest() {
      failNextForkAssetMapUpsert = true;
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
