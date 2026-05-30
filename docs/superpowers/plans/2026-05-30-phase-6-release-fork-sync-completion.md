# Phase 6 Release, Rollback, and Fork Sync Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 Phase 6 从“后端和前端雏形已存在”收口为可验收的发布预检、版本差异、回滚恢复、Fork 上游对比、非冲突同步和 detach 产品闭环。

**Architecture:** 继续沿用 Nest API + Prisma repository + Next Web 的现有边界。发布和 Fork 的权威状态由 API 管理，前端只展示服务端 preflight、release diff 和 fork sync 结果；世界快照恢复和 Fork 同步都复用 release snapshot，不引入新的本地同步协议。

**Tech Stack:** TypeScript、NestJS、Prisma、Zod、Vitest、Playwright、Next.js、React、`@worlddock/domain`。

---

## Current Baseline

当前文件树已经包含 Phase 6 的一部分实现：

- 已存在：`packages/domain/src/releases/index.ts`
- 已存在：`apps/api/src/modules/releases/releases.controller.ts`
- 已存在：`apps/api/src/modules/releases/releases.service.ts`
- 已存在：`apps/api/src/modules/releases/releases.module.ts`
- 已存在：`apps/api/src/modules/repositories/repository.service.ts` 中的 `previewWorldRelease()`、`publishWorld()`、`rollbackRelease()`、`getForkUpstreamDiff()`、`syncFork()`、`detachFork()`
- 已存在：`apps/web/src/features/releases/release-wizard.tsx`
- 已存在：`apps/web/src/features/releases/diff-view.tsx`
- 已存在：`apps/web/src/features/worlddock/api.ts` 中的 release / fork API client
- 已存在：`apps/api/test/releases.integration-spec.ts`
- 已存在：`apps/web/tests/e2e/release-flow.spec.ts`

本计划开始前的基线命令：

```bash
pnpm --filter @worlddock/api test:integration -- releases.integration-spec.ts
```

当前结果：通过；Vitest 实际执行了 API integration 配置下的 18 个文件，54 个测试通过，1 个 skipped。

关键剩余缺口：

- `rollbackRelease()` 目前只把 release 标记为 `rolled_back`，没有把 Cloud 世界恢复到上一个 published snapshot。
- `buildForkSyncPreview()` 使用 `listReleases()[0]`，可能把最新的 `rolled_back` release 当作上游版本。
- `syncFork()` 只应用 `added` 变更，`changed` / `removed` 没有做“源快照未被 fork 本地修改时自动同步，否则跳过”的非冲突合并。
- 当前 Fork 复制 snapshot asset 时沿用上游 asset id；这在内存测试里可行，但真实 Prisma 表里同一资产表的 `id` 全局唯一，Fork 世界必须创建新 asset id，并保存 upstream asset id 到 fork-local asset id 的映射。
- `ReleaseWizard` 用本地资产计数和关键词模拟 preflight，未调用 `POST /v1/worlds/:worldId/releases/preview`。
- 前端没有可操作的 Fork upstream diff / sync / detach UI；API client 已有函数但没有产品入口和 E2E 覆盖。
- `apps/web/src/features/worlddock/api.test.ts` 没覆盖 `previewWorldRelease()`、`rollbackRelease()`、`getForkUpstreamDiff()`、`syncFork()`、`detachFork()`。
- Phase 6 完成后需要更新 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 6 状态和验收证据。

## Commit Identity Guard

如果执行本计划时需要提交，每次提交前先执行：

```bash
git config user.name
git config user.email
```

当输出包含真实姓名或个人邮箱时，先在当前仓库设置匿名提交身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

提交后立即核验：

```bash
git log -1 --format=fuller
```

Author 和 Committer 都不得包含真实姓名或个人邮箱。

## File Map

- Modify: `packages/domain/src/releases/index.ts`
  补齐前端和 API 共用的 release preflight、fork sync result、rollback response schema / type。

- Modify: `packages/domain/src/repository/index.ts`
  让 `releaseDetailSchema` 和 repository release summary 复用 Phase 6 的 status / changes 类型。

- Modify: `apps/api/src/modules/billing/billing.module.ts`
  导出 `EntitlementsService`，让 release preflight 使用账单权益服务而不是直接读环境变量 helper。

- Modify: `packages/db/prisma/schema.prisma`
  增加 `RepositoryForkAssetMap`，保存每个 fork 的 upstream asset id 到 target world asset id 映射。

- Create: `packages/db/prisma/migrations/20260530190000_phase6_fork_asset_maps/migration.sql`
  为 fork asset map 创建表、唯一约束和索引。

- Modify: `apps/api/src/modules/repositories/repository.module.ts`
  导入 `BillingModule`，供 `RepositoryService` 注入 `EntitlementsService`。

- Modify: `apps/api/src/modules/worlds/world.repository.ts`
  增加 snapshot restore / fork sync 所需的 world asset replacement 方法。

- Modify: `apps/api/src/modules/worlds/prisma-world.repository.ts`
  在事务里恢复世界 metadata 和三类资产；支持按 snapshot asset id 创建、更新、删除。

- Modify: `apps/api/src/modules/repositories/repository.repository.ts`
  增加 fork asset map 持久化方法；增加 latest published release 查询或在 service 里明确过滤 `rolled_back` release。

- Modify: `apps/api/src/modules/repositories/prisma-repository.repository.ts`
  实现 fork asset map 方法；如采用 repository 方法方案，增加 `findLatestPublishedRelease()`；否则保持 list 后过滤。

- Modify: `apps/api/src/modules/repositories/repository.service.ts`
  收敛发布 preflight、latest published release、rollback snapshot restore、fork changed/removed non-conflict sync。

- Modify: `apps/api/src/modules/releases/releases.controller.ts`
  保持 endpoint 不变；如果 rollback response 改为 `{ release, activeRelease }`，同步 controller 返回结构。

- Modify: `apps/api/test/releases.integration-spec.ts`
  增加发布前检查、回滚恢复、latest published 过滤、fork changed/removed sync 测试。

- Modify: `apps/web/src/features/worlddock/api.ts`
  增加精确类型并覆盖 release / fork API client 测试。

- Modify: `apps/web/src/features/worlddock/api.test.ts`
  验证 Phase 6 API client 的 URL、method、body、authorization header。

- Modify: `apps/web/src/features/releases/release-wizard.tsx`
  改为调用服务端 preflight；使用服务端 changes 渲染 `DiffView`；发布按钮只在服务端 checks 全部通过后可用。

- Modify: `apps/web/src/features/worlddock/view-publish.tsx`
  透传 `sessionToken` 和 preflight / publish dependencies。

- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`
  把当前 session token 传给发布视图；发布成功后记录 release 版本并刷新世界列表。

- Create: `apps/web/src/features/releases/fork-sync-panel.tsx`
  展示 upstream diff、sync applied/skipped、detach 操作和错误态。

- Modify: `apps/web/src/features/community/repository-detail-page.tsx`
  在 Forks tab 中接入 `ForkSyncPanel`，允许用户对可访问的 fork 执行 compare/sync/detach；403 显示“仅 Fork 创建者可同步”。

- Modify: `apps/web/tests/e2e/release-flow.spec.ts`
  覆盖服务端 preflight、publish、rollback 状态展示、fork upstream diff/sync/detach 流程。

- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  Phase 6 完成后更新为已完成并贴验收命令。

---

### Task 1: Lock Backend Release Contracts With Failing Tests

**Files:**
- Modify: `apps/api/test/releases.integration-spec.ts`

- [x] **Step 1: Add preflight coverage for every blocking check**

Add this test case inside `describe("release and fork sync endpoints", () => { ... })`:

```ts
  it("returns explicit preflight failures for note, license, moderation, and entitlement", async () => {
    const previousEntitlement = process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED;
    process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED = "0";
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Credential Leak World",
      type: "科幻",
      summary: "api key 会出现在危险设定里。",
      tags: ["security"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({
      worldId: world.id,
      title: "安全规则",
      category: "世界规则",
      summary: "摘要",
      body: "正文",
      relations: [],
    });
    app = await createTestApp(auth, worlds, repositories);

    try {
      const preview = await request(app.getHttpServer())
        .post(`/v1/worlds/${world.id}/releases/preview`)
        .set("authorization", "Bearer session_user_1")
        .send({ releaseNote: "", license: "invalid-license" })
        .expect(201);

      expect(preview.body.preflight.ok).toBe(false);
      expect(preview.body.preflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "assets", ok: true }),
        expect.objectContaining({ code: "license", ok: false }),
        expect.objectContaining({ code: "release_note", ok: false }),
        expect.objectContaining({ code: "moderation", ok: false }),
        expect.objectContaining({ code: "entitlement", ok: false }),
      ]));
    } finally {
      if (previousEntitlement === undefined) {
        delete process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED;
      } else {
        process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED = previousEntitlement;
      }
    }
  });
```

- [x] **Step 2: Add rollback restore coverage**

Add this test case in the same describe block:

```ts
  it("rolls back the latest release and restores the previous published snapshot", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Rollback Restore World",
      type: "奇幻",
      summary: "需要恢复到旧快照。",
      tags: ["rollback"],
      mode: "cloud",
    });
    await worlds.createArchiveEntry({ worldId: world.id, title: "旧规则", category: "世界规则", summary: "旧摘要", body: "旧正文", relations: [] });
    app = await createTestApp(auth, worlds, repositories);

    const firstPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "v1", license: "free-fork-attribution" })
      .expect(201);

    await worlds.createArchiveEntry({ worldId: world.id, title: "新规则", category: "世界规则", summary: "新摘要", body: "新正文", relations: [] });
    const secondPublish = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "v2", license: "free-fork-attribution" })
      .expect(201);

    const rollback = await request(app.getHttpServer())
      .post(`/v1/releases/${secondPublish.body.release.id}/rollback`)
      .set("authorization", "Bearer session_user_1")
      .expect(201);

    expect(rollback.body.release).toMatchObject({ id: secondPublish.body.release.id, status: "rolled_back" });
    expect(rollback.body.activeRelease).toMatchObject({ id: firstPublish.body.release.id, status: "published" });
    expect((await worlds.listArchiveEntries(world.id)).map((entry) => entry.title)).toEqual(["旧规则"]);
  });
```

- [x] **Step 3: Add fork changed / removed non-conflict sync coverage**

Add this test case in the same describe block:

```ts
  it("syncs upstream changed and removed assets when the fork did not modify them locally", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addSession(auth, "session_user_1", "user_1", "ren");
    addSession(auth, "session_user_2", "user_2", "lin");
    const source = await worlds.createWorld({
      ownerId: "user_1",
      name: "Fork Merge World",
      type: "科幻",
      summary: "上游会修改和删除。",
      tags: ["sync"],
      mode: "cloud",
    });
    const stableEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "待修改规则", category: "世界规则", summary: "v1", body: "v1", relations: [] });
    const removedEntry = await worlds.createArchiveEntry({ worldId: source.id, title: "待删除规则", category: "世界规则", summary: "remove", body: "remove", relations: [] });
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

    await worlds.replaceArchiveEntryForTest?.(stableEntry.id, { summary: "v2", body: "v2" });
    await worlds.deleteArchiveEntryForTest?.(removedEntry.id);
    await request(app.getHttpServer())
      .post(`/v1/worlds/${source.id}/publish`)
      .set("authorization", "Bearer session_user_1")
      .send({ releaseNote: "修改并删除", license: "free-fork-attribution" })
      .expect(201);

    const sync = await request(app.getHttpServer())
      .post(`/v1/forks/${fork.body.fork.id}/sync`)
      .set("authorization", "Bearer session_user_2")
      .expect(201);

    expect(sync.body.sync.applied).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "changed", title: "待修改规则" }),
      expect.objectContaining({ kind: "removed", title: "待删除规则" }),
    ]));
    expect((await worlds.listArchiveEntries(fork.body.world.id)).map((entry) => entry.title)).toEqual(["待修改规则"]);
    expect((await worlds.listArchiveEntries(fork.body.world.id))[0]?.summary).toBe("v2");
  });
```

Before `createInMemoryWorldRepository()`, add a test-only type:

```ts
type TestWorldRepository = WorldRepository & {
  replaceArchiveEntryForTest(id: string, input: Partial<ArchiveEntryRecord>): Promise<ArchiveEntryRecord | null>;
  deleteArchiveEntryForTest(id: string): Promise<boolean>;
};
```

Change the function signature:

```ts
function createInMemoryWorldRepository(): TestWorldRepository {
```

Add these helper-only methods to the object returned by `createInMemoryWorldRepository()` so the new test can mutate source assets:

```ts
    async replaceArchiveEntryForTest(id: string, input: Partial<ArchiveEntryRecord>) {
      const entry = archiveEntries.get(id);
      if (!entry) return null;
      const next = { ...entry, ...input, updatedAt: new Date() };
      archiveEntries.set(id, next);
      return next;
    },
    async deleteArchiveEntryForTest(id: string) {
      return archiveEntries.delete(id);
    },
```

- [x] **Step 4: Run tests and confirm the new coverage exposes gaps**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- releases.integration-spec.ts
```

Expected: FAIL before implementation. The rollback test should fail because the world still contains the v2 asset; the changed / removed fork sync test should fail because current sync skips non-`added` changes.

---

### Task 2: Complete Backend Release State Machine and Snapshot Operations

**Files:**
- Modify: `apps/api/src/modules/billing/billing.module.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260530190000_phase6_fork_asset_maps/migration.sql`
- Modify: `apps/api/src/modules/repositories/repository.module.ts`
- Modify: `apps/api/src/modules/repositories/repository.repository.ts`
- Modify: `apps/api/src/modules/repositories/prisma-repository.repository.ts`
- Modify: `apps/api/src/modules/worlds/world.repository.ts`
- Modify: `apps/api/src/modules/worlds/prisma-world.repository.ts`
- Modify: `apps/api/src/modules/repositories/repository.service.ts`
- Modify: `apps/api/src/modules/releases/releases.controller.ts`
- Modify: `apps/api/test/releases.integration-spec.ts`

- [x] **Step 1: Export and inject billing entitlements**

Modify `apps/api/src/modules/billing/billing.module.ts`:

```ts
  exports: [BillingService, EntitlementsService, BILLING_REPOSITORY],
```

Modify `apps/api/src/modules/repositories/repository.module.ts`:

```ts
import { BillingModule } from "../billing/billing.module";

@Module({
  imports: [AuthModule, BillingModule, OutboxModule, WorldsModule],
```

Modify `RepositoryService` constructor:

```ts
import { EntitlementsService } from "../billing/entitlements.service";

  constructor(
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(REPOSITORY_SEARCH_CLIENT) private readonly searchClient: RepositorySearchClient,
    private readonly entitlements: EntitlementsService,
  ) {}
```

Change the entitlement check in `previewWorldRelease()`:

```ts
      {
        code: "entitlement" as const,
        ok: this.entitlements.getAlphaEntitlements().publicPublishing,
        message: "当前账户不包含公开发布权益。",
      },
```

- [x] **Step 2: Add fork asset maps for real database sync**

Modify `packages/db/prisma/schema.prisma` so `RepositoryFork` owns asset maps:

```prisma
model RepositoryFork {
  id                 String           @id @default(cuid())
  repositoryId       String
  sourceReleaseId    String
  targetWorldId      String
  userId             String
  licenseSnapshot    String
  createdAt          DateTime         @default(now())
  repository         PublicRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  sourceRelease      RepositoryRelease @relation(fields: [sourceReleaseId], references: [id], onDelete: Cascade)
  targetWorld        World            @relation(fields: [targetWorldId], references: [id], onDelete: Cascade)
  user               User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  assetMaps          RepositoryForkAssetMap[]

  @@index([repositoryId])
  @@index([userId])
  @@index([targetWorldId])
  @@map("forks")
}

model RepositoryForkAssetMap {
  id              String         @id @default(cuid())
  forkId          String
  upstreamAssetId String
  targetAssetId   String
  kind            String
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  fork            RepositoryFork @relation(fields: [forkId], references: [id], onDelete: Cascade)

  @@unique([forkId, upstreamAssetId])
  @@index([targetAssetId])
  @@map("fork_asset_maps")
}
```

Create `packages/db/prisma/migrations/20260530190000_phase6_fork_asset_maps/migration.sql`:

```sql
CREATE TABLE "fork_asset_maps" (
  "id" TEXT NOT NULL,
  "forkId" TEXT NOT NULL,
  "upstreamAssetId" TEXT NOT NULL,
  "targetAssetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fork_asset_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fork_asset_maps_forkId_upstreamAssetId_key" ON "fork_asset_maps"("forkId", "upstreamAssetId");
CREATE INDEX "fork_asset_maps_targetAssetId_idx" ON "fork_asset_maps"("targetAssetId");

ALTER TABLE "fork_asset_maps"
  ADD CONSTRAINT "fork_asset_maps_forkId_fkey"
  FOREIGN KEY ("forkId") REFERENCES "forks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Modify `apps/api/src/modules/repositories/repository.repository.ts`:

```ts
export type ForkAssetMapRecord = {
  id: string;
  forkId: string;
  upstreamAssetId: string;
  targetAssetId: string;
  kind: "archive" | "seed" | "conflict";
  createdAt: Date;
  updatedAt: Date;
};

export type RepositoryRepository = {
  // existing methods...
  createForkAssetMaps(input: Array<Omit<ForkAssetMapRecord, "id" | "createdAt" | "updatedAt">>): Promise<ForkAssetMapRecord[]>;
  listForkAssetMaps(forkId: string): Promise<ForkAssetMapRecord[]>;
  upsertForkAssetMap(input: Omit<ForkAssetMapRecord, "id" | "createdAt" | "updatedAt">): Promise<ForkAssetMapRecord>;
  deleteForkAssetMap(forkId: string, upstreamAssetId: string): Promise<void>;
};
```

Modify `apps/api/src/modules/repositories/prisma-repository.repository.ts`:

```ts
  async createForkAssetMaps(input: Parameters<RepositoryRepository["createForkAssetMaps"]>[0]) {
    if (input.length === 0) return [];
    await this.prisma.repositoryForkAssetMap.createMany({ data: input });
    return this.listForkAssetMaps(input[0]!.forkId);
  }

  async listForkAssetMaps(forkId: string) {
    const records = await this.prisma.repositoryForkAssetMap.findMany({ where: { forkId } });
    return records.map(mapForkAssetMap);
  }

  async upsertForkAssetMap(input: Parameters<RepositoryRepository["upsertForkAssetMap"]>[0]) {
    const record = await this.prisma.repositoryForkAssetMap.upsert({
      where: { forkId_upstreamAssetId: { forkId: input.forkId, upstreamAssetId: input.upstreamAssetId } },
      create: input,
      update: { targetAssetId: input.targetAssetId, kind: input.kind },
    });
    return mapForkAssetMap(record);
  }

  async deleteForkAssetMap(forkId: string, upstreamAssetId: string) {
    await this.prisma.repositoryForkAssetMap.deleteMany({ where: { forkId, upstreamAssetId } });
  }
```

Add mapper:

```ts
function mapForkAssetMap(record: {
  id: string;
  forkId: string;
  upstreamAssetId: string;
  targetAssetId: string;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
}): ForkAssetMapRecord {
  if (record.kind !== "archive" && record.kind !== "seed" && record.kind !== "conflict") {
    throw new Error(`Unknown fork asset kind: ${record.kind}`);
  }
  return { ...record, kind: record.kind };
}
```

- [x] **Step 3: Add world snapshot replacement methods**

Modify `apps/api/src/modules/worlds/world.repository.ts`:

```ts
import type { ReleaseChange, ReleaseSnapshot } from "@worlddock/domain";

export type ForkSyncApplyResult =
  | { status: "applied"; change: ReleaseChange }
  | { status: "skipped"; reason: "local_conflict" | "missing_upstream" | "missing_source"; change: ReleaseChange };

export type WorldRepository = {
  // existing methods...
  replaceWorldFromSnapshot(input: {
    worldId: string;
    snapshot: ReleaseSnapshot;
    status: WorldRecord["status"];
    visibility: WorldRecord["visibility"];
  }): Promise<WorldRecord | null>;
  createAssetFromSnapshot(input: {
    worldId: string;
    upstreamAssetId: string;
    snapshot: ReleaseSnapshot;
  }): Promise<{ upstreamAssetId: string; targetAssetId: string; kind: "archive" | "seed" | "conflict" } | null>;
  applyForkSnapshotChange(input: {
    worldId: string;
    targetAsset?: { id: string; kind: "archive" | "seed" | "conflict" };
    sourceSnapshot: ReleaseSnapshot;
    upstreamSnapshot: ReleaseSnapshot;
    change: ReleaseChange;
  }): Promise<ForkSyncApplyResult>;
};
```

- [x] **Step 4: Implement Prisma snapshot restore transaction**

Modify `apps/api/src/modules/worlds/prisma-world.repository.ts` with this method:

```ts
  async replaceWorldFromSnapshot(input: Parameters<WorldRepository["replaceWorldFromSnapshot"]>[0]) {
    const { worldId, snapshot, status, visibility } = input;
    return this.prisma.$transaction(async (tx) => {
      await tx.worldAssetRelation.deleteMany({ where: { worldId } });
      await tx.archiveEntry.deleteMany({ where: { worldId } });
      await tx.storySeed.deleteMany({ where: { worldId } });
      await tx.conflict.deleteMany({ where: { worldId } });

      const world = await tx.world.update({
        where: { id: worldId },
        data: {
          name: snapshot.world.name,
          type: snapshot.world.type,
          summary: snapshot.world.summary,
          tags: snapshot.world.tags,
          maturity: snapshot.world.maturity,
          status,
          visibility,
        },
      });

      for (const entry of snapshot.archiveEntries) {
        await tx.archiveEntry.create({ data: { ...entry, worldId } });
      }
      for (const seed of snapshot.storySeeds) {
        await tx.storySeed.create({ data: { ...seed, worldId } });
      }
      for (const conflict of snapshot.conflicts) {
        await tx.conflict.create({ data: { ...conflict, worldId } });
      }

      return world;
    }) as ReturnType<WorldRepository["replaceWorldFromSnapshot"]>;
  }
```

- [x] **Step 5: Implement snapshot asset creation and non-conflicting fork asset changes**

Add snapshot asset creation with generated target ids in `apps/api/src/modules/worlds/prisma-world.repository.ts`:

```ts
  async createAssetFromSnapshot(input: Parameters<WorldRepository["createAssetFromSnapshot"]>[0]) {
    const asset = findSnapshotAsset(input.snapshot, input.upstreamAssetId);
    if (!asset) return null;
    if (asset.kind === "archive") {
      const created = await this.prisma.archiveEntry.create({
        data: { ...asset.record, id: undefined, worldId: input.worldId },
      });
      return { upstreamAssetId: input.upstreamAssetId, targetAssetId: created.id, kind: "archive" as const };
    }
    if (asset.kind === "seed") {
      const created = await this.prisma.storySeed.create({
        data: { ...asset.record, id: undefined, worldId: input.worldId },
      });
      return { upstreamAssetId: input.upstreamAssetId, targetAssetId: created.id, kind: "seed" as const };
    }
    const created = await this.prisma.conflict.create({
      data: { ...asset.record, id: undefined, worldId: input.worldId },
    });
    return { upstreamAssetId: input.upstreamAssetId, targetAssetId: created.id, kind: "conflict" as const };
  }
```

Add helpers in `apps/api/src/modules/worlds/prisma-world.repository.ts`:

```ts
  async applyForkSnapshotChange(input: Parameters<WorldRepository["applyForkSnapshotChange"]>[0]) {
    const { worldId, targetAsset, sourceSnapshot, upstreamSnapshot, change } = input;
    const sourceAsset = findSnapshotAsset(sourceSnapshot, change.assetId);
    const upstreamAsset = findSnapshotAsset(upstreamSnapshot, change.assetId);
    const currentAsset = targetAsset ? await this.findSnapshotAssetInWorld(worldId, targetAsset) : null;

    if (change.kind !== "added" && !sourceAsset) return { status: "skipped", reason: "missing_source", change };
    if (change.kind !== "removed" && !upstreamAsset) return { status: "skipped", reason: "missing_upstream", change };
    if (change.kind !== "added" && currentAsset?.hash !== sourceAsset?.hash) {
      return { status: "skipped", reason: "local_conflict", change };
    }

    if (change.kind === "removed") {
      if (targetAsset) await this.deleteSnapshotAssetFromWorld(worldId, targetAsset);
      return { status: "applied", change };
    }

    if (!targetAsset) return { status: "skipped", reason: "missing_source", change };
    await this.updateSnapshotAssetInWorld(worldId, targetAsset, upstreamAsset!.record);
    return { status: "applied", change };
  }
```

Add the private helpers used above in the same class:

```ts
  private async findSnapshotAssetInWorld(worldId: string, targetAsset: { id: string; kind: "archive" | "seed" | "conflict" }) {
    const record = targetAsset.kind === "archive"
      ? await this.prisma.archiveEntry.findFirst({ where: { id: targetAsset.id, worldId } })
      : targetAsset.kind === "seed"
        ? await this.prisma.storySeed.findFirst({ where: { id: targetAsset.id, worldId } })
        : await this.prisma.conflict.findFirst({ where: { id: targetAsset.id, worldId } });
    return record ? { record, hash: stableSnapshotHash(record) } : null;
  }

  private async deleteSnapshotAssetFromWorld(worldId: string, targetAsset: { id: string; kind: "archive" | "seed" | "conflict" }) {
    await this.prisma.worldAssetRelation.deleteMany({
      where: { worldId, OR: [{ sourceAssetId: targetAsset.id }, { targetAssetId: targetAsset.id }] },
    });
    if (targetAsset.kind === "archive") await this.prisma.archiveEntry.deleteMany({ where: { id: targetAsset.id, worldId } });
    if (targetAsset.kind === "seed") await this.prisma.storySeed.deleteMany({ where: { id: targetAsset.id, worldId } });
    if (targetAsset.kind === "conflict") await this.prisma.conflict.deleteMany({ where: { id: targetAsset.id, worldId } });
  }

  private async updateSnapshotAssetInWorld(worldId: string, targetAsset: { id: string; kind: "archive" | "seed" | "conflict" }, record: any) {
    if (targetAsset.kind === "archive") await this.prisma.archiveEntry.update({ where: { id: targetAsset.id }, data: { ...record, id: undefined, worldId } });
    if (targetAsset.kind === "seed") await this.prisma.storySeed.update({ where: { id: targetAsset.id }, data: { ...record, id: undefined, worldId } });
    if (targetAsset.kind === "conflict") await this.prisma.conflict.update({ where: { id: targetAsset.id }, data: { ...record, id: undefined, worldId } });
  }
```

Add file-level helper functions:

```ts
import { createHash } from "node:crypto";
import type { ReleaseSnapshot } from "@worlddock/domain";

function findSnapshotAsset(snapshot: ReleaseSnapshot, assetId: string) {
  const [kind, id] = assetId.split(":");
  const record = kind === "archive"
    ? snapshot.archiveEntries.find((entry) => entry.id === id)
    : kind === "seed"
      ? snapshot.storySeeds.find((seed) => seed.id === id)
      : snapshot.conflicts.find((conflict) => conflict.id === id);
  if (!record) return null;
  if (kind !== "archive" && kind !== "seed" && kind !== "conflict") return null;
  return { kind, record, hash: stableSnapshotHash(record) };
}

function stableSnapshotHash(value: unknown) {
  const clean = { ...(value as Record<string, unknown>) };
  delete clean.createdAt;
  delete clean.updatedAt;
  return createHash("sha256").update(JSON.stringify(clean)).digest("hex").slice(0, 16);
}
```

- [x] **Step 6: Use service-level latest published release helper**

Add in `apps/api/src/modules/repositories/repository.service.ts`:

```ts
  private latestPublishedRelease(releases: ReleaseRecord[]) {
    return releases.find((release) => release.status === "published") ?? null;
  }
```

Change `buildForkSyncPreview()`:

```ts
    const upstreamRelease = this.latestPublishedRelease(releases);
    if (!upstreamRelease) throw this.notFound("Release not found.");
```

Change `toRepositoryDetail()`:

```ts
    const latest = this.latestPublishedRelease(releases);
```

- [x] **Step 7: Replace rollback status-only behavior**

Replace `rollbackRelease()` in `RepositoryService`:

```ts
  async rollbackRelease(subject: AuthSubject, releaseId: string) {
    const release = await this.repositories.findReleaseById(releaseId);
    if (!release) throw this.notFound("Release not found.");
    if (release.status !== "published") {
      throw new BadRequestException({ code: "ROLLBACK_BLOCKED", message: "Only published releases can be rolled back." });
    }
    const repository = await this.repositories.findById(release.repositoryId);
    if (!repository) throw this.notFound("Repository not found.");
    this.requireRepositoryOwner(subject, repository);

    const releases = await this.repositories.listReleases(repository.id);
    const latestPublished = this.latestPublishedRelease(releases);
    if (latestPublished?.id !== release.id) {
      throw new BadRequestException({ code: "ROLLBACK_BLOCKED", message: "Only the latest published release can be rolled back." });
    }

    const previousPublished = releases.find((item) => item.status === "published" && item.id !== release.id);
    if (!previousPublished) {
      throw new BadRequestException({ code: "ROLLBACK_BLOCKED", message: "Rollback requires a previous published release." });
    }
    const previousSnapshot = await this.requireSnapshot(previousPublished.id);
    if (repository.worldId) {
      await this.worlds.replaceWorldFromSnapshot({
        worldId: repository.worldId,
        snapshot: previousSnapshot.snapshot,
        status: "published",
        visibility: "public",
      });
    }

    const rolledBack = await this.repositories.updateReleaseStatus(release.id, "rolled_back");
    if (!rolledBack) throw this.notFound("Release not found.");
    await this.emitRepositoryEvent("repository.release_rolled_back", repository.id, {
      repositoryId: repository.id,
      releaseId: release.id,
      activeReleaseId: previousPublished.id,
    });
    return { release: toReleaseDetail(rolledBack), activeRelease: toReleaseDetail(previousPublished) };
  }
```

Update `apps/api/src/modules/releases/releases.controller.ts`:

```ts
    return await this.releases.rollbackRelease(subject, releaseId);
```

- [x] **Step 8: Create fork assets with generated ids and save maps**

In `forkRepository()`, replace the direct snapshot asset copy block with explicit mapped creation:

```ts
    const fork = await this.repositories.createFork({
      repositoryId: repository.id,
      sourceReleaseId: latestRelease.id,
      targetWorldId: world.id,
      userId: subject.user.id,
      licenseSnapshot: repository.license,
    });

    const createdMaps = [];
    for (const upstreamAssetId of snapshotAssetIds(snapshot.snapshot)) {
      const created = await this.worlds.createAssetFromSnapshot({
        worldId: world.id,
        upstreamAssetId,
        snapshot: snapshot.snapshot,
      });
      if (created) createdMaps.push({ forkId: fork.id, ...created });
    }
    await this.repositories.createForkAssetMaps(createdMaps);
```

Add helper near `snapshotAssetMap()`:

```ts
function snapshotAssetIds(snapshot: ReleaseSnapshot) {
  return [
    ...snapshot.archiveEntries.map((entry) => `archive:${entry.id}`),
    ...snapshot.storySeeds.map((seed) => `seed:${seed.id}`),
    ...snapshot.conflicts.map((conflict) => `conflict:${conflict.id}`),
  ];
}
```

- [x] **Step 9: Replace fork sync added-only behavior**

Replace the loop in `syncFork()`:

```ts
    const sourceSnapshot = await this.requireSnapshot(fork.sourceReleaseId);
    const upstreamSnapshot = await this.requireSnapshot(preview.upstreamReleaseId);
    const assetMaps = new Map((await this.repositories.listForkAssetMaps(fork.id)).map((map) => [map.upstreamAssetId, map]));
    const applied: ReleaseChange[] = [];
    const skipped: Array<ReleaseChange & { reason: string }> = [];

    for (const change of preview.changes) {
      if (change.kind === "added") {
        const created = await this.worlds.createAssetFromSnapshot({
          worldId: fork.targetWorldId,
          upstreamAssetId: change.assetId,
          snapshot: upstreamSnapshot.snapshot,
        });
        if (created) {
          await this.repositories.upsertForkAssetMap({ forkId: fork.id, ...created });
          applied.push(change);
        } else {
          skipped.push({ ...change, reason: "missing_upstream" });
        }
        continue;
      }
      const map = assetMaps.get(change.assetId);
      const result = await this.worlds.applyForkSnapshotChange({
        worldId: fork.targetWorldId,
        targetAsset: map ? { id: map.targetAssetId, kind: map.kind } : undefined,
        sourceSnapshot: sourceSnapshot.snapshot,
        upstreamSnapshot: upstreamSnapshot.snapshot,
        change,
      });
      if (result.status === "applied") {
        applied.push(result.change);
        if (change.kind === "removed") await this.repositories.deleteForkAssetMap(fork.id, change.assetId);
      } else {
        skipped.push({ ...result.change, reason: result.reason });
      }
    }

    if (skipped.length === 0) {
      await this.repositories.updateForkSourceRelease(fork.id, preview.upstreamReleaseId);
    }
```

Return the new shape:

```ts
    return {
      ...preview,
      sourceReleaseId: skipped.length === 0 ? preview.upstreamReleaseId : preview.sourceReleaseId,
      applied,
      skipped,
    };
```

- [x] **Step 10: Run backend verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- releases.integration-spec.ts
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test -- releases
```

Expected: all targeted API release tests pass; Prisma schema validates.

---

### Task 3: Type and Test the Web Release/Fork API Client

**Files:**
- Modify: `packages/domain/src/releases/index.ts`
- Modify: `apps/web/src/features/worlddock/api.ts`
- Modify: `apps/web/src/features/worlddock/api.test.ts`

- [x] **Step 1: Export shared response types**

Modify `packages/domain/src/releases/index.ts`:

```ts
export const rollbackReleaseResponseSchema = z.object({
  release: worldReleaseSchema.omit({ worldId: true }).passthrough(),
  activeRelease: worldReleaseSchema.omit({ worldId: true }).passthrough(),
});

export const forkSyncResultSchema = forkSyncPreviewSchema.extend({
  applied: z.array(releaseChangeSchema),
  skipped: z.array(releaseChangeSchema.extend({
    reason: z.enum(["local_conflict", "missing_upstream", "missing_source"]).optional(),
  })),
});

export type RollbackReleaseResponse = z.infer<typeof rollbackReleaseResponseSchema>;
export type ForkSyncResult = z.infer<typeof forkSyncResultSchema>;
```

- [x] **Step 2: Import and use typed API client responses**

Modify the import at the top of `apps/web/src/features/worlddock/api.ts`:

```ts
import type { ForkSyncPreview, ForkSyncResult, Notification, PublicRepository, ReleasePreflight, WorldAsset, WorldAssetKind, WorldPackage } from "@worlddock/domain";
```

Use precise return types:

```ts
export async function getForkUpstreamDiff(forkId: string, options: ApiClientOptions): Promise<{ diff: ForkSyncPreview }> {
  return requestJson(`/v1/forks/${forkId}/upstream-diff`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function syncFork(forkId: string, options: ApiClientOptions): Promise<{ sync: ForkSyncResult }> {
  return requestJson(`/v1/forks/${forkId}/sync`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function detachFork(forkId: string, options: ApiClientOptions): Promise<{ fork: { forkId: string; detached: true } }> {
  return requestJson(`/v1/forks/${forkId}/detach`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}
```

- [x] **Step 3: Add API client tests**

Modify imports in `apps/web/src/features/worlddock/api.test.ts`:

```ts
  detachFork,
  getForkUpstreamDiff,
  previewWorldRelease,
  rollbackRelease,
  syncFork,
```

Add this test:

```ts
  it("previews releases, rolls back releases, and manages fork upstream sync", async () => {
    const fetcher = vi
      .fn(async () => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ preflight: { ok: true, checks: [], changes: [] } }))
      .mockResolvedValueOnce(jsonResponse({ release: { id: "rel_2" }, activeRelease: { id: "rel_1" } }))
      .mockResolvedValueOnce(jsonResponse({ diff: { forkId: "fork_1", repositoryId: "repo_1", sourceReleaseId: "rel_1", upstreamReleaseId: "rel_2", hasUpstreamChanges: true, changes: [] } }))
      .mockResolvedValueOnce(jsonResponse({ sync: { forkId: "fork_1", repositoryId: "repo_1", sourceReleaseId: "rel_2", upstreamReleaseId: "rel_2", hasUpstreamChanges: false, changes: [], applied: [], skipped: [] } }))
      .mockResolvedValueOnce(jsonResponse({ fork: { forkId: "fork_1", detached: true } }));

    await previewWorldRelease("world_1", { releaseNote: "v2", license: "free-fork-attribution" }, { sessionToken: "session_valid", fetcher });
    await rollbackRelease("rel_2", { sessionToken: "session_valid", fetcher });
    await getForkUpstreamDiff("fork_1", { sessionToken: "session_valid", fetcher });
    await syncFork("fork_1", { sessionToken: "session_valid", fetcher });
    await detachFork("fork_1", { sessionToken: "session_valid", fetcher });

    expect(fetcher).toHaveBeenNthCalledWith(1, "http://localhost:4000/v1/worlds/world_1/releases/preview", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://localhost:4000/v1/releases/rel_2/rollback", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "http://localhost:4000/v1/forks/fork_1/upstream-diff", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "http://localhost:4000/v1/forks/fork_1/sync", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(5, "http://localhost:4000/v1/forks/fork_1/detach", expect.objectContaining({ method: "POST" }));
  });
```

- [x] **Step 4: Run web unit tests**

Run:

```bash
pnpm --filter @worlddock/web test -- api.test.ts
```

Expected: PASS.

---

### Task 4: Make Release Wizard Use Server Preflight

**Files:**
- Modify: `apps/web/src/features/releases/release-wizard.tsx`
- Modify: `apps/web/src/features/worlddock/view-publish.tsx`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`
- Modify: `apps/web/tests/e2e/release-flow.spec.ts`

- [x] **Step 1: Update `ReleaseWizardProps`**

Modify `apps/web/src/features/releases/release-wizard.tsx`:

```ts
import { useEffect, useMemo, useState } from "react";
import type { ReleasePreflight, World, WorldMode } from "@worlddock/domain";
import { previewWorldRelease } from "../worlddock/api";
```

Change props:

```ts
type ReleaseWizardProps = {
  mode: WorldMode;
  world: World;
  sessionToken: string;
  communityConnected?: boolean;
  onBack: () => void;
  onConfirm: (payload: { releaseNote: string; license: string }) => Promise<void> | void;
};
```

- [x] **Step 2: Fetch server preflight when release inputs change**

Add state and effect inside `ReleaseWizard`:

```ts
  const [preflight, setPreflight] = useState<ReleasePreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState("");

  useEffect(() => {
    if (isLocal || !sessionToken || !world.id) return;
    const controller = new AbortController();
    setPreflightLoading(true);
    setPreflightError("");
    const timeout = window.setTimeout(() => {
      void previewWorldRelease(world.id, { releaseNote, license }, { sessionToken, signal: controller.signal })
        .then((result) => setPreflight(result.preflight))
        .catch(() => setPreflightError("发布前检查暂不可用"))
        .finally(() => setPreflightLoading(false));
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isLocal, license, releaseNote, sessionToken, world.id]);
```

Replace local `checks` with server-aware checks:

```ts
  const checks = useMemo(() => {
    if (!isLocal && preflight) {
      return preflight.checks.map((check) => ({ id: check.code, ok: check.ok, label: check.message }));
    }
    return [
      { id: "assets", ok: assetCount > 0, label: "至少保存一个世界资产" },
      { id: "license", ok: Boolean(license), label: "已选择授权方式" },
      { id: "release_note", ok: Boolean(releaseNote.trim()), label: "已填写发布说明" },
      { id: "moderation", ok: moderationOk, label: "发布前预扫描通过" },
      { id: "entitlement", ok: true, label: "账户包含公开发布权益" },
    ];
  }, [assetCount, isLocal, license, moderationOk, preflight, releaseNote]);
```

Replace `canSubmit`:

```ts
  const canSubmit = !blocked && !preflightLoading && !preflightError && checks.every((check) => check.ok);
```

Map server changes into `DiffView`:

```ts
  const diff: ReleaseDiffItem[] = preflight?.changes.length
    ? [
        { label: "新增资产", value: preflight.changes.filter((change) => change.kind === "added").length, tone: "sage" },
        { label: "修改资产", value: preflight.changes.filter((change) => change.kind === "changed").length },
        { label: "删除资产", value: preflight.changes.filter((change) => change.kind === "removed").length, tone: "amber" },
      ]
    : [
        { label: "新增设定", value: world.archive ?? 0, tone: "sage" },
        { label: "修改设定", value: world.status === "published" ? Math.max(0, world.archive ?? 0) : 0 },
        { label: "删除设定", value: 0 },
        { label: "新增故事种子", value: world.seeds ?? 0, tone: "sage" },
      ];
```

Add status text near the checks:

```tsx
            {preflightLoading && <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>发布前检查中</div>}
            {preflightError && <div className="badge amber" style={{ justifyContent: "flex-start", minHeight: 24 }}>{preflightError}</div>}
```

- [x] **Step 3: Pass session token through publish view**

Modify `apps/web/src/features/worlddock/view-publish.tsx`:

```ts
type PublishViewProps = {
  mode: WorldMode;
  world: World;
  sessionToken: string;
  communityConnected?: boolean;
  onBack: () => void;
  onConfirm: (payload: { releaseNote: string; license: string }) => Promise<void> | void;
};
```

Modify `apps/web/src/features/worlddock/world-dock-app.tsx` where `<PublishView />` is rendered:

```tsx
              sessionToken={sessionToken}
```

- [x] **Step 4: Update release E2E mocks**

Modify `apps/web/tests/e2e/release-flow.spec.ts` setup to mock preview:

```ts
  await page.route("**/v1/worlds/world_release/releases/preview", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        preflight: {
          ok: input.archive + input.seeds + input.conflicts > 0,
          checks: [
            { code: "assets", ok: input.archive + input.seeds + input.conflicts > 0, message: "至少保存一个世界资产" },
            { code: "license", ok: true, message: "已选择授权方式" },
            { code: "release_note", ok: true, message: "已填写发布说明" },
            { code: "moderation", ok: true, message: "发布前预扫描通过" },
            { code: "entitlement", ok: true, message: "账户包含公开发布权益" },
          ],
          changes: [
            { assetId: "archive:archive_1", kind: "added", title: "发布规则", afterHash: "hash_1" },
          ].slice(0, input.archive),
        },
      }),
    });
  });
```

- [x] **Step 5: Run release wizard E2E**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- release-flow.spec.ts
```

Expected: PASS; release wizard shows server preflight text and blocks submit when the mocked `assets` check fails.

---

### Task 5: Add Fork Upstream Diff, Sync, and Detach UI

**Files:**
- Create: `apps/web/src/features/releases/fork-sync-panel.tsx`
- Modify: `apps/web/src/features/community/repository-detail-page.tsx`
- Modify: `apps/web/tests/e2e/release-flow.spec.ts`

- [x] **Step 1: Create `ForkSyncPanel`**

Create `apps/web/src/features/releases/fork-sync-panel.tsx`:

```tsx
import { useState } from "react";
import type { ForkSyncPreview, ForkSyncResult } from "@worlddock/domain";
import { detachFork, getForkUpstreamDiff, syncFork } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type ForkSyncPanelProps = {
  forkId: string;
  sessionToken: string;
  onDetached: (forkId: string) => void;
};

export function ForkSyncPanel({ forkId, sessionToken, onDetached }: ForkSyncPanelProps) {
  const [preview, setPreview] = useState<ForkSyncPreview | null>(null);
  const [syncResult, setSyncResult] = useState<ForkSyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compare() {
    setBusy(true);
    setError("");
    try {
      const result = await getForkUpstreamDiff(forkId, { sessionToken });
      setPreview(result.diff);
      setSyncResult(null);
    } catch {
      setError("仅 Fork 创建者可同步，或当前 API 暂不可用。");
    } finally {
      setBusy(false);
    }
  }

  async function applySync() {
    setBusy(true);
    setError("");
    try {
      const result = await syncFork(forkId, { sessionToken });
      setSyncResult(result.sync);
      setPreview(result.sync);
    } catch {
      setError("同步失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function detach() {
    setBusy(true);
    setError("");
    try {
      await detachFork(forkId, { sessionToken });
      onDetached(forkId);
    } catch {
      setError("Detach 失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const changes = syncResult?.changes ?? preview?.changes ?? [];

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        <button className="btn" disabled={busy} onClick={compare}><Icon name="search" size={12} /><span>比较上游</span></button>
        <button className="btn primary" disabled={busy || !preview?.hasUpstreamChanges} onClick={applySync}><Icon name="download" size={12} /><span>同步非冲突变更</span></button>
        <button className="btn ghost" disabled={busy} onClick={detach}><Icon name="unlink" size={12} /><span>Detach</span></button>
      </div>
      {error ? <div className="badge amber" style={{ justifyContent: "flex-start", minHeight: 24 }}>{error}</div> : null}
      {preview && !preview.hasUpstreamChanges ? <p className="prose">当前 Fork 已经跟上游发布版本一致。</p> : null}
      {changes.length > 0 ? (
        <div className="col" style={{ gap: 8 }}>
          {changes.map((change) => (
            <div key={`${change.kind}:${change.assetId}`} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span>{change.title}</span>
              <span className={`badge ${change.kind === "removed" ? "amber" : "slate"}`}>{change.kind}</span>
            </div>
          ))}
        </div>
      ) : null}
      {syncResult ? (
        <p className="prose" style={{ marginBottom: 0 }}>
          已应用 {syncResult.applied.length} 项，跳过 {syncResult.skipped.length} 项。
        </p>
      ) : null}
    </div>
  );
}
```

- [x] **Step 2: Wire ForkSyncPanel into repository detail**

Modify imports in `apps/web/src/features/community/repository-detail-page.tsx`:

```ts
import { ForkSyncPanel } from "../releases/fork-sync-panel";
```

Add state:

```ts
  const [detachedForkIds, setDetachedForkIds] = useState<string[]>([]);
```

Pass `sessionToken` to `ForkGraph`:

```tsx
          {tab === "forks" ? (
            <ForkGraph
              repository={repository}
              sessionToken={sessionToken}
              detachedForkIds={detachedForkIds}
              onDetached={(forkId) => setDetachedForkIds((prev) => [...prev, forkId])}
            />
          ) : null}
```

Replace `ForkGraph` signature and body:

```tsx
function ForkGraph({
  repository,
  sessionToken,
  detachedForkIds,
  onDetached,
}: {
  repository: CommunityRepository;
  sessionToken: string;
  detachedForkIds: string[];
  onDetached: (forkId: string) => void;
}) {
  const forks = (repository.forkGraph?.forks ?? []).filter((fork) => !detachedForkIds.includes(fork.id));
  return (
    <section className="col" style={{ gap: 10 }}>
      <h2 className="title-font" style={{ margin: 0, fontSize: "var(--t-18)" }}>Forks</h2>
      {forks.map((fork) => (
        <article key={fork.id} className="card" style={{ padding: 14 }}>
          <div className="row gap-2">
            <Icon name="fork" size={13} />
            <span className="mono" style={{ fontSize: 12 }}>{fork.id}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{fork.createdAt}</span>
          </div>
          <p className="prose">源版本 {fork.sourceReleaseId} · 私有世界 {fork.targetWorldId}</p>
          <ForkSyncPanel forkId={fork.id} sessionToken={sessionToken} onDetached={onDetached} />
        </article>
      ))}
      {forks.length === 0 ? <p className="prose">还没有公开 fork 记录。</p> : null}
    </section>
  );
}
```

- [x] **Step 3: Extend E2E release flow for fork management**

Add a new test to `apps/web/tests/e2e/release-flow.spec.ts`:

```ts
test("repository detail can compare, sync, and detach a fork", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_release_flow");
  });
  await page.route("**/v1/community/repositories?sort=updated", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        repositories: [{
          id: "repo_release",
          owner: "ren",
          slug: "release-ready",
          name: "Release Ready",
          summary: "一个准备同步的世界。",
          tags: ["release"],
          stars: 1,
          forks: 1,
          updated: new Date().toISOString(),
          version: "v2.0.0",
          visibility: "public",
          license: "free-fork-attribution",
          releases: [],
        }],
        nextCursor: null,
      }),
    });
  });
  await page.route("**/v1/community/repositories/ren/release-ready", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        repository: {
          id: "repo_release",
          owner: "ren",
          slug: "release-ready",
          name: "Release Ready",
          summary: "一个准备同步的世界。",
          tags: ["release"],
          stars: 1,
          forks: 1,
          updated: new Date().toISOString(),
          version: "v2.0.0",
          visibility: "public",
          license: "free-fork-attribution",
          releases: [],
          releaseHistory: [],
          forkGraph: {
            repositoryId: "repo_release",
            forks: [{ id: "fork_1", sourceReleaseId: "rel_1", targetWorldId: "world_fork", userId: "user_2", createdAt: new Date().toISOString() }],
          },
          assetCounts: { archive: 1, seeds: 0, conflicts: 0 },
        },
      }),
    });
  });
  await page.route("**/v1/forks/fork_1/upstream-diff", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        diff: {
          forkId: "fork_1",
          repositoryId: "repo_release",
          sourceReleaseId: "rel_1",
          upstreamReleaseId: "rel_2",
          hasUpstreamChanges: true,
          changes: [{ assetId: "archive:archive_2", kind: "added", title: "新增上游规则", afterHash: "hash_2" }],
        },
      }),
    });
  });
  await page.route("**/v1/forks/fork_1/sync", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        sync: {
          forkId: "fork_1",
          repositoryId: "repo_release",
          sourceReleaseId: "rel_2",
          upstreamReleaseId: "rel_2",
          hasUpstreamChanges: true,
          changes: [{ assetId: "archive:archive_2", kind: "added", title: "新增上游规则", afterHash: "hash_2" }],
          applied: [{ assetId: "archive:archive_2", kind: "added", title: "新增上游规则", afterHash: "hash_2" }],
          skipped: [],
        },
      }),
    });
  });
  await page.route("**/v1/forks/fork_1/detach", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ fork: { forkId: "fork_1", detached: true } }) });
  });

  await gotoApp(page, { installMocks: false });
  await page.getByText("Explore").click();
  await page.getByText("Release Ready").click();
  await page.getByRole("button", { name: "Forks" }).click();
  await page.getByRole("button", { name: "比较上游" }).click();
  await expect(page.getByText("新增上游规则")).toBeVisible();
  await page.getByRole("button", { name: "同步非冲突变更" }).click();
  await expect(page.getByText("已应用 1 项，跳过 0 项")).toBeVisible();
  await page.getByRole("button", { name: "Detach" }).click();
  await expect(page.getByText("还没有公开 fork 记录。")).toBeVisible();
});
```

- [x] **Step 4: Run E2E**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- release-flow.spec.ts
```

Expected: PASS.

---

### Task 6: Update Phase 6 Completion Evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [x] **Step 1: Run final verification**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- releases.integration-spec.ts
pnpm --filter @worlddock/web test -- api.test.ts
pnpm --filter @worlddock/web test:e2e -- release-flow.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: every command exits 0.

- [x] **Step 2: Replace Phase 6 incomplete section**

In `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`, replace the Phase 6 section with:

```md
## Phase 6: 版本、发布、回滚和 Fork 同步

完成状态：已完成。

完成依据：

- `packages/domain/src/releases/index.ts` 已定义 release 状态、diff change、preflight、rollback 和 fork sync contract。
- `apps/api/src/modules/releases/*` 已提供 release preview、rollback、fork upstream diff、sync 和 detach endpoint，并复用认证 scope。
- `apps/api/src/modules/repositories/repository.service.ts` 已在发布前检查零资产、授权、发布说明、moderation pre-scan 和公开发布 entitlement。
- 发布会生成 repository release、release snapshot、实体级 changes 和版本号；repository detail 使用最新 published release，跳过 rolled_back release。
- rollback 只允许仓库 owner 回滚最新 published release，并会把 Cloud 世界恢复到上一个 published snapshot。
- Fork sync 会基于 fork source snapshot 与 upstream snapshot 计算差异，自动应用非冲突 added/changed/removed 变更，冲突项进入 skipped，detach 会解除 fork 记录。
- `apps/web/src/features/releases/release-wizard.tsx` 和 `diff-view.tsx` 已使用服务端 preflight 和 changes 渲染发布检查与差异预览。
- `apps/web/src/features/releases/fork-sync-panel.tsx` 与 repository detail Forks tab 已提供 upstream diff、sync 和 detach 操作入口。
- `apps/api/test/releases.integration-spec.ts` 和 `apps/web/tests/e2e/release-flow.spec.ts` 覆盖发布预检、发布、回滚、Fork 对比、同步和 detach。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test:integration -- releases.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- release-flow.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 6 不实现多人协同分支、复杂三路冲突编辑器、release draft 草稿编辑页或真实审核后台；这些进入后续版本。
- 当前 sync 策略只自动应用 fork 本地未修改的 upstream changes；发生 local conflict 时保留 fork 本地内容并在 skipped 中返回原因。
```

- [x] **Step 3: Run placeholder scan on this plan and the updated status doc**

Run:

```bash
rg -n "[T]BD|TO[D]O|implement[ ]later|fill[ ]in[ ]details|Similar[ ]to[ ]Task|适[当]|相[应]" docs/superpowers/plans/2026-05-30-phase-6-release-fork-sync-completion.md docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected: no output.

---

## Self-Review

Spec coverage:

- Release status / diff schema: covered by Task 3 and existing `packages/domain/src/releases/index.ts`.
- Publish preflight: covered by Task 1 and Task 4.
- Published release snapshots: covered by Task 2 and existing publish path.
- Rollback: covered by Task 1 and Task 2, including actual world snapshot restore.
- Fork upstream diff / sync / detach API: covered by Task 1 and Task 2.
- Fork sync product entry: covered by Task 5.
- API integration and Playwright acceptance: covered by Task 1, Task 4, Task 5, Task 6.
- Completion status update: covered by Task 6.

Placeholder scan:

- 本计划不使用占位短语作为执行内容；Task 6 的扫描命令使用字符组避免命令行自匹配。

Type consistency:

- `ReleasePreflight`、`ForkSyncPreview`、`ForkSyncResult`、`ReleaseChange` 在 domain、API client 和 UI 中使用同一组字段。
- Rollback endpoint 从 `{ release }` 升级为 `{ release, activeRelease }`，Task 2 和 Task 3 同步修改 controller 与 web client。
- Fork sync endpoint 从 `{ applied: ReleaseChange[], skipped: ReleaseChange[] }` 扩展为 skipped 可携带 `reason`，Task 2、Task 3、Task 5 保持一致。
