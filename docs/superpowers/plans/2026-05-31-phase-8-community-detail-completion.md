# Phase 8 社区发现与 Repository Detail 完整闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Cloud Alpha 的社区发现、创作者主页、收藏夹和完整 Repository Detail，使公开仓库可搜索、可分页、可查看真实发布快照资产、可进入创作者主页并完成 Star/Fork/收藏主路径。

**Architecture:** Phase 8 在现有 `repositories`、`releases`、`worlds` 和 `moderation` 模块之上增加只读优先的 `community` 聚合层。后端通过 `RepositoryService` 与 `RepositoryRepository` 复用公开仓库、release snapshot、fork graph 和 collection 持久化；前端通过 `view-community.tsx` 作为状态编排层，独立 `features/community/*` 页面只负责渲染与交互。当前仓库已经存在一版 Phase8 代码，执行时以测试驱动方式验证、补齐和收口，不重建已满足要求的模块。

**Tech Stack:** NestJS、Prisma/PostgreSQL、Zod、Next.js App Router、React、TypeScript、Radix Dialog、Vitest、Supertest、Playwright、pnpm workspace。

---

## Source

- 总计划：`docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- 未完成调查：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

## Scope

- 增加或补齐 `/v1/community/*` API。
- Explore 使用 community API 的分页、搜索、标签、排序结果，不读取 fixture。
- Repository Detail 展示 Overview、Archive、Seeds、Conflicts、Releases、Forks 六个真实标签页。
- Creator Profile 展示创作者公开仓库、统计和标签，并能回到仓库详情。
- Collections 支持保存和移除公开仓库，重复保存幂等。
- Removed repository 不出现在 Explore、creator profile 和 detail 结果中。
- 补齐 `community.integration-spec.ts` 与 `community-product-flow.spec.ts` 验收证据。
- Phase 完成后更新 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase8 状态。

## Non-Goals

- 不实现真实管理后台、管理员审核工作台或邮件通知。
- 不实现真实支付、订阅、Stripe checkout 或发票。
- 不实现模板库、多人协作分支、复杂三路冲突编辑器。
- 不把 creator profile report 作为 Phase8 阻塞项；创作者举报归 Phase9 反滥用闭环。
- 不修改 Fork sync 的核心算法；Phase8 只在公开详情页展示 fork graph，并复用 Phase6 的 owned fork 操作入口。

## Current Baseline

- 已存在 `apps/api/src/modules/community/community.controller.ts`、`community.service.ts`、`community.module.ts`。
- 已存在 `apps/web/src/features/community/explore-page.tsx`、`repository-detail-page.tsx`、`creator-profile-page.tsx`、`collections-page.tsx`。
- 已存在 `apps/api/test/community.integration-spec.ts` 与 `apps/web/tests/e2e/community-product-flow.spec.ts`。
- 已存在 `RepositoryCollection`、`RepositoryFork`、`ReleaseSnapshot` 等 Prisma 模型。
- 本计划仍按完整 Phase8 验收标准拆解任务；执行者必须通过测试确认现有实现满足要求，发现差距时在对应任务内补齐。

## File Map

### API

- Modify: `apps/api/src/app.module.ts`，确保 `CommunityModule` 已接入根模块。
- Modify: `apps/api/src/modules/community/community.module.ts`，组合 `AuthModule` 与 `RepositoryModule`。
- Modify: `apps/api/src/modules/community/community.controller.ts`，暴露 community repositories、assets、creators、collections API。
- Modify: `apps/api/src/modules/community/community.service.ts`，实现分页、搜索、creator 聚合、快照资产映射、collection 幂等。
- Modify: `apps/api/src/modules/repositories/repository.repository.ts`，确保 repository storage contract 覆盖 collections、fork graph、snapshots。
- Modify: `apps/api/src/modules/repositories/prisma-repository.repository.ts`，确保持久化实现与 contract 一致。
- Modify: `apps/api/src/modules/repositories/repository.service.ts`，复用 search、detail、release、fork、moderation 可见性规则。
- Test: `apps/api/test/community.integration-spec.ts`。

### Web

- Modify: `apps/web/src/features/worlddock/api.ts`，增加 community client 类型与请求函数。
- Modify: `apps/web/src/features/worlddock/view-community.tsx`，作为 Explore、Detail、Creator、Collections 的状态机和 toast 协调层。
- Modify: `apps/web/src/features/community/explore-page.tsx`，展示搜索、排序、分页和公开仓库列表。
- Modify: `apps/web/src/features/community/repository-detail-page.tsx`，展示六个真实标签页。
- Modify: `apps/web/src/features/community/creator-profile-page.tsx`，展示 creator profile 和 creator repositories。
- Modify: `apps/web/src/features/community/collections-page.tsx`，展示当前 session 的收藏夹状态。
- Test: `apps/web/tests/e2e/community-product-flow.spec.ts`。

### Docs

- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`，Phase8 验证通过后标记完成并写入证据。

## API Contract

```txt
GET /v1/community/repositories?cursor=&q=&tag=&sort=
Response 200:
{
  "repositories": CommunityRepository[],
  "nextCursor": "12" | null
}

GET /v1/community/repositories/:owner/:slug
Response 200:
{
  "repository": CommunityRepositoryDetail
}

GET /v1/community/repositories/:repositoryId/assets?kind=&cursor=
Response 200:
{
  "repositoryId": "repo_...",
  "releaseId": "rel_..." | null,
  "assets": CommunityRepositoryAsset[],
  "nextCursor": "8" | null
}

GET /v1/community/creators/:handle
Response 200:
{
  "creator": CommunityCreator
}

GET /v1/community/creators/:handle/repositories?cursor=&sort=
Response 200:
{
  "repositories": CommunityRepository[],
  "nextCursor": "12" | null
}

POST /v1/community/repositories/:repositoryId/collections
Authorization: Bearer session token
Response 201:
{
  "collection": RepositoryCollection
}

DELETE /v1/community/repositories/:repositoryId/collections/:collectionId
Authorization: Bearer session token
Response 200:
{
  "collection": RepositoryCollection,
  "removed": true
}
```

## Data Shapes

```ts
type CommunityRepositoryAsset = {
  id: string;
  assetId: string;
  kind: "archive" | "seed" | "conflict";
  title: string;
  category: string;
  summary: string;
  body: string;
  related: string[];
};

type CommunityCreator = {
  handle: string;
  displayName: string;
  bio: string;
  stats: { repositories: number; stars: number; forks: number };
  tags: string[];
  latestUpdated: string | null;
};

type RepositoryCollection = {
  id: string;
  repositoryId: string;
  userId: string;
  name: string;
  createdAt: string;
};
```

## Task 1: 锁定 Community API 集成验收

**Files:**
- Modify: `apps/api/test/community.integration-spec.ts`
- Read: `apps/api/src/modules/community/community.controller.ts`
- Read: `apps/api/src/modules/community/community.service.ts`
- Read: `apps/api/src/modules/repositories/repository.repository.ts`

- [x] **Step 1: 写失败测试覆盖 Phase8 API contract**

修改 `apps/api/test/community.integration-spec.ts`，确保主测试至少包含以下断言。如果文件已有等价断言，保留现有 helper，只补缺少的断言。

```ts
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
```

- [x] **Step 2: 运行测试并确认失败或确认当前实现已覆盖**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- community.integration-spec.ts
```

Expected when implementation is incomplete: FAIL with one of these signals:

```txt
expected 200 "OK", got 404 "Not Found"
expected ["memory-market"] but received []
expected forkGraph.forks to have length 1
expected duplicate collection id to equal original collection id
```

Expected when current baseline already satisfies contract:

```txt
Test Files  1 passed
Tests  1 passed
```

- [x] **Step 3: 记录需要实现的失败点**

把失败点映射到后续任务：

```txt
404 /v1/community/repositories -> Task 2
missing assetCounts/latestRelease/releaseHistory/forkGraph -> Task 3
missing assets pagination or snapshot mapping -> Task 3
missing creator profile/repositories -> Task 4
missing collection idempotency -> Task 5
removed repository appears -> Task 2 或 Task 4
```

## Task 2: 实现 Community module 路由和公开仓库分页搜索

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/community/community.module.ts`
- Modify: `apps/api/src/modules/community/community.controller.ts`
- Modify: `apps/api/src/modules/community/community.service.ts`
- Test: `apps/api/test/community.integration-spec.ts`

- [x] **Step 1: 确认根模块接入 CommunityModule**

`apps/api/src/app.module.ts` 中 imports 必须包含：

```ts
import { CommunityModule } from "./modules/community/community.module";

@Module({
  imports: [
    AccountModule,
    AgentModule,
    AnalyticsModule,
    AuthModule,
    BillingModule,
    CommunityModule,
    DeveloperAccessModule,
    ExportsModule,
    ModerationModule,
    NotificationsModule,
    ReleasesModule,
    RepositoryModule,
    StorageModule,
    SystemModule,
    WorldAssetsModule,
    WorldsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
```

- [x] **Step 2: 确认 CommunityModule 组合依赖**

`apps/api/src/modules/community/community.module.ts` 必须是：

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RepositoryModule } from "../repositories/repository.module";
import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";

@Module({
  imports: [AuthModule, RepositoryModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
```

- [x] **Step 3: 实现 community repository list controller**

`apps/api/src/modules/community/community.controller.ts` 中必须包含：

```ts
@Controller("community")
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get("repositories")
  async repositories(
    @Query("cursor") cursor?: string,
    @Query("q") q?: string,
    @Query("tag") tag?: string | string[],
    @Query("sort") sort?: string,
  ) {
    return this.communityService.listRepositories({
      cursor,
      q,
      tags: normalizeTags(tag),
      sort: normalizeCommunitySort(sort),
    });
  }
}

function normalizeTags(tag?: string | string[]) {
  const tags = Array.isArray(tag) ? tag : tag ? [tag] : [];
  return tags
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}
```

- [x] **Step 4: 实现 service 分页搜索**

`apps/api/src/modules/community/community.service.ts` 中必须包含：

```ts
type CommunitySort = NonNullable<RepositorySearchOptions["sort"]>;
const PAGE_SIZE = 12;

async listRepositories(input: { cursor?: string; q?: string; tags?: string[]; sort?: CommunitySort }) {
  const repositories = await this.repositoryService.searchPublicRepositories(input.q ?? "", {
    tags: input.tags ?? [],
    sort: input.sort ?? "updated",
  });
  const { items, nextCursor } = paginate(repositories, input.cursor, PAGE_SIZE);
  return { repositories: items, nextCursor };
}

function paginate<T>(items: T[], cursor: string | undefined, limit: number) {
  const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
  const page = items.slice(offset, offset + limit);
  const nextCursor = offset + limit < items.length ? String(offset + limit) : null;
  return { items: page, nextCursor };
}

export function normalizeCommunitySort(value?: string): CommunitySort {
  if (value === "relevance" || value === "stars" || value === "forks" || value === "updated") return value;
  return "updated";
}
```

- [x] **Step 5: 运行 community API 测试**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- community.integration-spec.ts
```

Expected: list route assertions pass; remaining failures, if any, are detail/assets/creator/collections assertions covered by later tasks.

## Task 3: 实现 Repository Detail 聚合和快照资产分页

**Files:**
- Modify: `apps/api/src/modules/community/community.controller.ts`
- Modify: `apps/api/src/modules/community/community.service.ts`
- Modify: `apps/api/src/modules/repositories/repository.repository.ts`
- Modify: `apps/api/src/modules/repositories/prisma-repository.repository.ts`
- Test: `apps/api/test/community.integration-spec.ts`

- [x] **Step 1: 增加 detail 和 assets routes**

`apps/api/src/modules/community/community.controller.ts` 必须包含：

```ts
@Get("repositories/:repositoryId/assets")
async assets(
  @Param("repositoryId") repositoryId: string,
  @Query("kind") kind?: string | string[],
  @Query("cursor") cursor?: string,
) {
  return this.communityService.listRepositoryAssets(repositoryId, {
    kind: normalizeCommunityAssetKind(kind),
    cursor,
  });
}

@Get("repositories/:owner/:slug")
async detail(@Param("owner") owner: string, @Param("slug") slug: string) {
  return { repository: await this.communityService.getRepository(owner, slug) };
}
```

- [x] **Step 2: 增加 repository contract 读取 fork graph**

`apps/api/src/modules/repositories/repository.repository.ts` 中 `RepositoryRepository` 必须包含：

```ts
listForksForRepository(repositoryId: string): Promise<ForkRecord[]>;
findSnapshotByReleaseId(releaseId: string): Promise<ReleaseSnapshotRecord | null>;
listReleases(repositoryId: string): Promise<ReleaseRecord[]>;
```

`apps/api/src/modules/repositories/prisma-repository.repository.ts` 中必须包含：

```ts
async listForksForRepository(repositoryId: string) {
  const forks = await this.prisma.repositoryFork.findMany({
    where: { repositoryId },
    orderBy: { createdAt: "desc" },
  });
  return forks.map(mapFork);
}
```

- [x] **Step 3: 实现 detail 聚合**

`apps/api/src/modules/community/community.service.ts` 必须包含：

```ts
async getRepository(owner: string, slug: string) {
  const repository = await this.repositoryService.getPublicRepository(owner, slug);
  const [releaseHistory, forks, latestSnapshot] = await Promise.all([
    this.repositoryService.listReleases(repository.id),
    this.repositories.listForksForRepository(repository.id),
    this.findLatestSnapshot(repository.id),
  ]);

  return {
    ...repository,
    latestRelease: releaseHistory[0] ?? null,
    releaseHistory,
    assetCounts: countSnapshotAssets(latestSnapshot?.snapshot),
    forkGraph: {
      repositoryId: repository.id,
      forks: forks.map((fork) => ({
        id: fork.id,
        sourceReleaseId: fork.sourceReleaseId,
        targetWorldId: fork.targetWorldId,
        userId: fork.userId,
        createdAt: fork.createdAt.toISOString(),
      })),
    },
  };
}

private async findLatestSnapshot(repositoryId: string) {
  const releases = await this.repositories.listReleases(repositoryId);
  const latestRelease = releases.find((release) => release.status === "published") ?? releases[0];
  return latestRelease ? this.repositories.findSnapshotByReleaseId(latestRelease.id) : null;
}
```

- [x] **Step 4: 实现快照资产映射**

`apps/api/src/modules/community/community.service.ts` 必须包含：

```ts
type AssetKind = "archive" | "seed" | "conflict";
const ASSET_PAGE_SIZE = 8;

async listRepositoryAssets(repositoryId: string, input: { kind?: AssetKind; cursor?: string }) {
  await this.requireVisibleRepository(repositoryId);
  const snapshot = await this.findLatestSnapshot(repositoryId);
  const assets = snapshot ? snapshotAssets(snapshot.snapshot, input.kind) : [];
  const { items, nextCursor } = paginate(assets, input.cursor, ASSET_PAGE_SIZE);
  return {
    repositoryId,
    releaseId: snapshot?.releaseId ?? null,
    assets: items,
    nextCursor,
  };
}

function countSnapshotAssets(snapshot: ReleaseSnapshot | undefined) {
  return {
    archive: snapshot?.archiveEntries.length ?? 0,
    seeds: snapshot?.storySeeds.length ?? 0,
    conflicts: snapshot?.conflicts.length ?? 0,
  };
}

function snapshotAssets(snapshot: ReleaseSnapshot, kind?: AssetKind) {
  const archive = snapshot.archiveEntries.map((entry) => ({
    id: entry.id,
    assetId: `archive:${entry.id}`,
    kind: "archive" as const,
    title: entry.title,
    category: entry.category,
    summary: entry.summary,
    body: entry.body,
    related: entry.relations ?? [],
  }));
  const seeds = snapshot.storySeeds.map((seed) => ({
    id: seed.id,
    assetId: `seed:${seed.id}`,
    kind: "seed" as const,
    title: seed.title,
    category: "story-seed",
    summary: seed.hook,
    body: seed.conflict,
    related: seed.questions ?? [],
  }));
  const conflicts = snapshot.conflicts.map((conflict) => ({
    id: conflict.id,
    assetId: `conflict:${conflict.id}`,
    kind: "conflict" as const,
    title: conflict.title,
    category: "conflict",
    summary: conflict.summary,
    body: conflict.body,
    related: conflict.related ?? [],
  }));
  const all = [...archive, ...seeds, ...conflicts];
  return kind ? all.filter((asset) => asset.kind === kind) : all;
}

export function normalizeCommunityAssetKind(value?: string | string[]): AssetKind | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "archive" || raw === "setting" || raw === "settings") return "archive";
  if (raw === "seed" || raw === "seeds") return "seed";
  if (raw === "conflict" || raw === "conflicts") return "conflict";
  return undefined;
}
```

- [x] **Step 5: 运行 detail/assets API 测试**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- community.integration-spec.ts
```

Expected: detail、assets、forkGraph、assetCounts 断言通过。

## Task 4: 实现 Creator Profile API

**Files:**
- Modify: `apps/api/src/modules/community/community.controller.ts`
- Modify: `apps/api/src/modules/community/community.service.ts`
- Test: `apps/api/test/community.integration-spec.ts`

- [x] **Step 1: 增加 creator routes**

`apps/api/src/modules/community/community.controller.ts` 必须包含：

```ts
@Get("creators/:handle")
async creator(@Param("handle") handle: string) {
  return { creator: await this.communityService.getCreator(handle) };
}

@Get("creators/:handle/repositories")
async creatorRepositories(
  @Param("handle") handle: string,
  @Query("cursor") cursor?: string,
  @Query("sort") sort?: string,
) {
  return this.communityService.listCreatorRepositories(handle, {
    cursor,
    sort: normalizeCommunitySort(sort),
  });
}
```

- [x] **Step 2: 实现 creator 聚合**

`apps/api/src/modules/community/community.service.ts` 必须包含：

```ts
async getCreator(handle: string) {
  const repositories = await this.repositoriesForCreator(handle);
  if (repositories.length === 0) throw this.notFound("Creator not found.");
  const stars = repositories.reduce((total, repository) => total + repository.stars, 0);
  const forks = repositories.reduce((total, repository) => total + repository.forks, 0);
  const tags = [...new Set(repositories.flatMap((repository) => repository.tags))].slice(0, 8);
  return {
    handle,
    displayName: repositories[0]?.owner ?? handle,
    bio: "Alpha 创作者主页会展示已公开的世界仓库、版本活动和可 fork 内容。",
    stats: {
      repositories: repositories.length,
      stars,
      forks,
    },
    tags,
    latestUpdated: repositories[0]?.updated ?? null,
  };
}

async listCreatorRepositories(handle: string, input: { cursor?: string; sort?: CommunitySort }) {
  const repositories = await this.repositoriesForCreator(handle, input.sort);
  const { items, nextCursor } = paginate(repositories, input.cursor, PAGE_SIZE);
  return { repositories: items, nextCursor };
}

private async repositoriesForCreator(handle: string, sort: CommunitySort = "updated") {
  const repositories = await this.repositoryService.searchPublicRepositories("", { sort });
  const normalized = handle.toLowerCase();
  return repositories.filter((repository) => repository.owner.toLowerCase() === normalized);
}
```

- [x] **Step 3: 运行 creator API 测试**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- community.integration-spec.ts
```

Expected: creator profile 和 creator repositories 断言通过，removed repository 不出现在 creator repositories。

## Task 5: 实现 Collection 幂等保存和移除

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/modules/repositories/repository.repository.ts`
- Modify: `apps/api/src/modules/repositories/prisma-repository.repository.ts`
- Modify: `apps/api/src/modules/community/community.controller.ts`
- Modify: `apps/api/src/modules/community/community.service.ts`
- Test: `apps/api/test/community.integration-spec.ts`

- [x] **Step 1: 确认 Prisma collection 约束**

`packages/db/prisma/schema.prisma` 必须包含：

```prisma
model RepositoryCollection {
  id           String           @id @default(cuid())
  repositoryId String
  userId       String
  name         String           @default("saved")
  createdAt    DateTime         @default(now())
  repository   PublicRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([repositoryId, userId, name])
  @@index([userId, createdAt])
  @@index([repositoryId])
  @@map("repository_collections")
}
```

- [x] **Step 2: 确认 repository contract**

`apps/api/src/modules/repositories/repository.repository.ts` 必须包含：

```ts
export type RepositoryCollectionRecord = {
  id: string;
  repositoryId: string;
  userId: string;
  name: string;
  createdAt: Date;
};

saveToCollection(input: { repositoryId: string; userId: string; name?: string }): Promise<RepositoryCollectionRecord>;
removeFromCollection(input: { collectionId: string; repositoryId: string; userId: string }): Promise<RepositoryCollectionRecord | null>;
listCollectionsForUser(userId: string): Promise<RepositoryCollectionRecord[]>;
```

- [x] **Step 3: 确认 Prisma upsert 实现**

`apps/api/src/modules/repositories/prisma-repository.repository.ts` 必须包含：

```ts
async saveToCollection(input: Parameters<RepositoryRepository["saveToCollection"]>[0]) {
  const collection = await this.prisma.repositoryCollection.upsert({
    where: {
      repositoryId_userId_name: {
        repositoryId: input.repositoryId,
        userId: input.userId,
        name: input.name ?? "saved",
      },
    },
    create: {
      repositoryId: input.repositoryId,
      userId: input.userId,
      name: input.name ?? "saved",
    },
    update: {},
  });
  return mapCollection(collection);
}

async removeFromCollection(input: Parameters<RepositoryRepository["removeFromCollection"]>[0]) {
  const collection = await this.prisma.repositoryCollection.findFirst({
    where: {
      id: input.collectionId,
      repositoryId: input.repositoryId,
      userId: input.userId,
    },
  });
  if (!collection) return null;
  await this.prisma.repositoryCollection.delete({ where: { id: collection.id } });
  return mapCollection(collection);
}
```

- [x] **Step 4: 增加 collections controller routes**

`apps/api/src/modules/community/community.controller.ts` 必须包含：

```ts
@Post("repositories/:repositoryId/collections")
@UseGuards(WorldDockAuthGuard)
@RequireScopes("world:write")
async saveToCollection(@CurrentSubject() subject: AuthSubject, @Param("repositoryId") repositoryId: string) {
  return { collection: await this.communityService.saveRepositoryToCollection(subject, repositoryId) };
}

@Delete("repositories/:repositoryId/collections/:collectionId")
@UseGuards(WorldDockAuthGuard)
@RequireScopes("world:write")
async removeFromCollection(
  @CurrentSubject() subject: AuthSubject,
  @Param("repositoryId") repositoryId: string,
  @Param("collectionId") collectionId: string,
) {
  return { collection: await this.communityService.removeRepositoryFromCollection(subject, repositoryId, collectionId), removed: true };
}
```

- [x] **Step 5: 增加 collections service 方法**

`apps/api/src/modules/community/community.service.ts` 必须包含：

```ts
async saveRepositoryToCollection(subject: AuthSubject, repositoryId: string) {
  await this.requireVisibleRepository(repositoryId);
  const collection = await this.repositories.saveToCollection({
    repositoryId,
    userId: subject.user.id,
    name: "saved",
  });
  return collection;
}

async removeRepositoryFromCollection(subject: AuthSubject, repositoryId: string, collectionId: string) {
  const collection = await this.repositories.removeFromCollection({
    collectionId,
    repositoryId,
    userId: subject.user.id,
  });
  return collection ?? { id: collectionId, repositoryId, userId: subject.user.id, name: "saved", createdAt: new Date(0) };
}

private async requireVisibleRepository(repositoryId: string): Promise<PublicRepositoryRecord> {
  const repository = await this.repositories.findById(repositoryId);
  if (!repository || repository.moderationStatus === "removed") throw this.notFound("Repository not found.");
  return repository;
}
```

- [x] **Step 6: 运行 Prisma 和 API 测试**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- community.integration-spec.ts
```

Expected: Prisma schema valid；collection 重复保存返回同一个 id；删除返回 `removed: true`。

## Task 6: 锁定 Web community client contract

**Files:**
- Modify: `apps/web/src/features/worlddock/api.ts`
- Test: `apps/web/src/features/worlddock/api.test.ts`
- Test: `apps/web/src/features/worlddock/runtime-no-mock.test.ts`

- [x] **Step 1: 增加或确认 web API 类型**

`apps/web/src/features/worlddock/api.ts` 必须包含：

```ts
export type CommunityRepositoryAsset = {
  id: string;
  assetId: string;
  kind: "archive" | "seed" | "conflict";
  title: string;
  category: string;
  summary: string;
  body: string;
  related: string[];
};

export type CommunityRepository = PublicRepository & {
  latestRelease?: {
    id: string;
    repositoryId: string;
    version: string;
    note: string;
    status: string;
    license: string;
    createdAt: string;
  } | null;
  releaseHistory?: Array<{
    id: string;
    repositoryId: string;
    version: string;
    note: string;
    status: string;
    license: string;
    createdAt: string;
  }>;
  assetCounts?: { archive: number; seeds: number; conflicts: number };
  forkGraph?: {
    repositoryId: string;
    forks: Array<{
      id: string;
      sourceReleaseId: string;
      targetWorldId: string;
      userId: string;
      createdAt: string;
    }>;
  };
};
```

- [x] **Step 2: 增加或确认 community 请求函数**

`apps/web/src/features/worlddock/api.ts` 必须包含：

```ts
export async function listCommunityRepositories(
  options: ApiClientOptions & CommunityRepositorySearchOptions,
): Promise<{ repositories: CommunityRepository[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.cursor) params.set("cursor", options.cursor);
  for (const tag of options.tags ?? []) params.append("tag", tag);
  if (options.sort) params.set("sort", options.sort);
  const query = params.toString();
  return requestJson(`/v1/community/repositories${query ? `?${query}` : ""}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function getCommunityRepository(
  owner: string,
  slug: string,
  options: ApiClientOptions,
): Promise<{ repository: CommunityRepository }> {
  return requestJson(`/v1/community/repositories/${owner}/${slug}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function listCommunityRepositoryAssets(
  repositoryId: string,
  options: ApiClientOptions & { kind?: "archive" | "seed" | "conflict"; cursor?: string },
): Promise<{ repositoryId: string; releaseId: string | null; assets: CommunityRepositoryAsset[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (options.kind) params.set("kind", options.kind);
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return requestJson(`/v1/community/repositories/${repositoryId}/assets${query ? `?${query}` : ""}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}
```

- [x] **Step 3: 运行 web unit 测试**

Run:

```bash
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
```

Expected:

```txt
Test Files  2 passed
```

## Task 7: 实现 Explore 和 Collections 前端状态机

**Files:**
- Modify: `apps/web/src/features/worlddock/view-community.tsx`
- Modify: `apps/web/src/features/community/explore-page.tsx`
- Modify: `apps/web/src/features/community/collections-page.tsx`
- Test: `apps/web/tests/e2e/community-product-flow.spec.ts`

- [x] **Step 1: 在 CommunityView 接入 community API**

`apps/web/src/features/worlddock/view-community.tsx` 必须包含：

```tsx
const [query, setQuery] = useState("");
const [sort, setSort] = useState<"relevance" | "stars" | "forks" | "updated">("updated");
const [repositories, setRepositories] = useState<CommunityRepository[]>([]);
const [nextCursor, setNextCursor] = useState<string | null>(null);
const [loading, setLoading] = useState(false);

const loadRepositories = useCallback(async (cursor: string | null) => {
  setLoading(true);
  const session = sessionToken();
  try {
    const result = await listCommunityRepositories({
      sessionToken: session,
      query,
      sort,
      cursor: cursor ?? undefined,
    });
    setRepositories((prev) => cursor ? [...prev, ...result.repositories] : result.repositories);
    setNextCursor(result.nextCursor);
  } catch {
    setRepositories((prev) => cursor ? prev : []);
    setNextCursor(null);
  } finally {
    setLoading(false);
  }
}, [query, sessionToken, sort]);

useEffect(() => {
  void loadRepositories(null);
}, [loadRepositories]);
```

- [x] **Step 2: 渲染 Explore 控件**

`apps/web/src/features/community/explore-page.tsx` 必须提供：

```tsx
<input
  className="input"
  aria-label="搜索公开世界"
  placeholder="搜索世界、标签、作者..."
  value={query}
  onChange={(event) => onQueryChange(event.target.value)}
  style={{ width: "min(100%, 360px)" }}
/>

<div className="row gap-2" role="group" aria-label="排序">
  {SORT_OPTIONS.map((option) => (
    <button
      key={option.id}
      className={"sb-btn " + (sort === option.id ? "primary" : "")}
      onClick={() => onSortChange(option.id)}
    >
      {option.label}
    </button>
  ))}
</div>

{nextCursor ? (
  <div style={{ padding: "0 32px 36px" }}>
    <button className="btn" onClick={onLoadMore}>加载更多</button>
  </div>
) : null}
```

- [x] **Step 3: 实现 collection toggle**

`apps/web/src/features/worlddock/view-community.tsx` 必须包含：

```tsx
async function toggleCollection(repository: CommunityRepository) {
  const existing = collections.find((item) => item.repository.id === repository.id);
  const session = sessionToken();
  if (existing) {
    if (session) {
      try {
        await removeRepositoryFromCollection(repository.id, existing.collection.id, { sessionToken: session });
      } catch {
        onToast({ kind: "info", text: "云端收藏夹暂不可用，已更新本地状态" });
      }
    }
    setCollections((prev) => prev.filter((item) => item.repository.id !== repository.id));
    onToast({ kind: "save", text: "已移出收藏夹 · " + repository.name });
    return;
  }

  let collection: RepositoryCollection = {
    id: `local_collection_${repository.id}`,
    repositoryId: repository.id,
    userId: "local",
    name: "saved",
    createdAt: new Date().toISOString(),
  };
  if (session) {
    try {
      const result = await addRepositoryToCollection(repository.id, { sessionToken: session });
      collection = result.collection;
    } catch {
      onToast({ kind: "info", text: "云端收藏夹暂不可用，已保存本地状态" });
    }
  }
  setCollections((prev) => [...prev, { collection, repository }]);
  onToast({ kind: "save", text: "已加入收藏夹 · " + repository.name });
}
```

- [x] **Step 4: 运行 community E2E 到第一个页面流**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- community-product-flow.spec.ts
```

Expected when later detail UI is still incomplete: Explore 断言通过，失败点落在 repository detail、creator 或 collections。

## Task 8: 实现 Repository Detail 六个真实标签页

**Files:**
- Modify: `apps/web/src/features/community/repository-detail-page.tsx`
- Modify: `apps/web/src/features/worlddock/view-community.tsx`
- Test: `apps/web/tests/e2e/community-product-flow.spec.ts`

- [x] **Step 1: 定义 tabs 和资产状态**

`apps/web/src/features/community/repository-detail-page.tsx` 必须包含：

```tsx
type TabId = "overview" | "archive" | "seeds" | "conflicts" | "releases" | "forks";
type AssetKind = "archive" | "seed" | "conflict";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "archive", label: "Archive" },
  { id: "seeds", label: "Seeds" },
  { id: "conflicts", label: "Conflicts" },
  { id: "releases", label: "Releases" },
  { id: "forks", label: "Forks" },
];

const [assets, setAssets] = useState<Record<AssetKind, CommunityRepositoryAsset[]>>({ archive: [], seed: [], conflict: [] });
const [assetCursor, setAssetCursor] = useState<Record<AssetKind, string | null>>({ archive: null, seed: null, conflict: null });
const [loadingAssets, setLoadingAssets] = useState(false);
```

- [x] **Step 2: 加载详情和资产**

`apps/web/src/features/community/repository-detail-page.tsx` 必须包含：

```tsx
useEffect(() => {
  setRepository(initialRepository);
  void getCommunityRepository(initialRepository.owner, initialRepository.slug, { sessionToken })
    .then((result) => setRepository(result.repository))
    .catch(() => {});
}, [initialRepository, sessionToken]);

const loadAssets = useCallback(async (kind: AssetKind, cursor: string | null) => {
  setLoadingAssets(true);
  try {
    const result = await listCommunityRepositoryAssets(repository.id, { sessionToken, kind, cursor: cursor ?? undefined });
    setAssets((prev) => ({ ...prev, [kind]: cursor ? [...prev[kind], ...result.assets] : result.assets }));
    setAssetCursor((prev) => ({ ...prev, [kind]: result.nextCursor }));
  } finally {
    setLoadingAssets(false);
  }
}, [repository.id, sessionToken]);
```

- [x] **Step 3: 渲染 Overview 和资产计数**

`RepositoryDetailPage` 必须展示：

```tsx
<OverviewPanel repository={repository} />

<div className="mono" style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.8 }}>
  Archive {repository.assetCounts?.archive ?? 0}<br />
  Seeds {repository.assetCounts?.seeds ?? 0}<br />
  Conflicts {repository.assetCounts?.conflicts ?? 0}
</div>
```

- [x] **Step 4: 渲染 Archive、Seeds、Conflicts**

`AssetPanel` 必须展示真实资产标题、summary、空态和加载更多：

```tsx
function AssetPanel({
  kind,
  assets,
  nextCursor,
  loading,
  onLoadMore,
}: {
  kind: AssetKind;
  assets: CommunityRepositoryAsset[];
  nextCursor: string | null;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const title = kind === "archive" ? "Archive" : kind === "seed" ? "Seeds" : "Conflicts";
  return (
    <section className="col" style={{ gap: 10 }}>
      <h2 className="title-font" style={{ margin: 0, fontSize: "var(--t-18)" }}>{title}</h2>
      {assets.map((asset) => (
        <article key={asset.assetId} className="card" style={{ padding: 14 }}>
          <div className="row gap-2">
            <span className="badge slate">{asset.category}</span>
            <span className="title-font" style={{ fontSize: "var(--t-15)", fontWeight: 600 }}>{asset.title}</span>
          </div>
          <p className="prose" style={{ marginBottom: 0 }}>{asset.summary}</p>
        </article>
      ))}
      {!loading && assets.length === 0 ? <p className="prose">当前公开快照没有这个分类的内容。</p> : null}
      {nextCursor ? <button className="btn" onClick={onLoadMore}>加载更多</button> : null}
      {loading ? <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>加载中</span> : null}
    </section>
  );
}
```

- [x] **Step 5: 渲染 Releases 和 Forks**

`RepositoryDetailPage` 必须展示：

```tsx
function ReleaseHistory({ repository }: { repository: CommunityRepository }) {
  const releases = repository.releaseHistory ?? repository.releases ?? [];
  return (
    <section className="col" style={{ gap: 10 }}>
      <h2 className="title-font" style={{ margin: 0, fontSize: "var(--t-18)" }}>Releases</h2>
      {releases.map((release: any) => (
        <article key={release.id ?? release.version} className="card" style={{ padding: 14 }}>
          <div className="row gap-2">
            <span className="badge slate">{release.version}</span>
            <span className="badge">{release.status}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{release.createdAt ?? release.updated}</span>
          </div>
          <p className="prose" style={{ marginBottom: 0 }}>{release.note}</p>
        </article>
      ))}
    </section>
  );
}

function ForkGraph({ repository }: { repository: CommunityRepository }) {
  const forks = repository.forkGraph?.forks ?? [];
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
        </article>
      ))}
      {forks.length === 0 ? <p className="prose">还没有公开 fork 记录。</p> : null}
    </section>
  );
}
```

如果保留 `ForkSyncPanel`，只允许对当前登录用户拥有的 fork 展示 sync/detach 操作；公开详情页默认读展示。没有 ownership 信息时使用上面的只读版本。

- [x] **Step 6: 运行 detail E2E**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- community-product-flow.spec.ts
```

Expected: E2E 能看到 `Memory Market`、`初始发布`、`Archive 1`、`交易法`、`继承的童年`、`人格权冲突`、`v1.0.0`、`fork_1`。

## Task 9: 实现 Creator Profile 页面与社区导航

**Files:**
- Modify: `apps/web/src/features/community/creator-profile-page.tsx`
- Modify: `apps/web/src/features/worlddock/view-community.tsx`
- Test: `apps/web/tests/e2e/community-product-flow.spec.ts`

- [x] **Step 1: CreatorProfilePage 加载 creator 和 repositories**

`apps/web/src/features/community/creator-profile-page.tsx` 必须包含：

```tsx
useEffect(() => {
  void getCommunityCreator(handle, { sessionToken })
    .then((result) => setCreator(result.creator))
    .catch(() => setCreator(null));
  void listCommunityCreatorRepositories(handle, { sessionToken, sort: "updated" })
    .then((result) => setRepositories(result.repositories))
    .catch(() => setRepositories([]));
}, [handle, sessionToken]);
```

- [x] **Step 2: CreatorProfilePage 展示仓库入口和统计**

`apps/web/src/features/community/creator-profile-page.tsx` 必须展示：

```tsx
<h1>{creator?.displayName ?? handle}</h1>
<div className="sub">{creator?.bio ?? "公开创作者主页"}</div>

{repositories.map((repository) => (
  <article key={repository.id} className="card hover" style={{ padding: 14 }}>
    <button
      onClick={() => onOpenRepository(repository)}
      style={{ border: 0, background: "transparent", color: "inherit", padding: 0, textAlign: "left", cursor: "pointer", width: "100%" }}
    >
      <div className="row gap-2">
        <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>{repository.name}</span>
        <span className="badge slate">{repository.version}</span>
      </div>
      <p className="prose" style={{ marginBottom: 0 }}>{repository.summary}</p>
    </button>
  </article>
))}

<div className="mono" style={{ fontSize: 12, lineHeight: 1.8, color: "var(--fg-2)" }}>
  {creator?.stats.repositories ?? 0} repositories<br />
  {creator?.stats.stars ?? 0} stars<br />
  {creator?.stats.forks ?? 0} forks
</div>
```

- [x] **Step 3: CommunityView 串联 detail 和 creator**

`apps/web/src/features/worlddock/view-community.tsx` 必须包含：

```tsx
if (creatorHandle) {
  return (
    <CreatorProfilePage
      handle={creatorHandle}
      sessionToken={sessionToken()}
      onBack={() => setCreatorHandle(null)}
      onOpenRepository={(repository) => {
        setActiveRepository(repository);
        setCreatorHandle(null);
      }}
    />
  );
}

if (activeRepository) {
  return (
    <RepositoryDetailPage
      repository={activeRepository}
      sessionToken={sessionToken()}
      onOpenCreator={(handle) => setCreatorHandle(handle)}
      {...otherRepositoryDetailProps}
    />
  );
}
```

- [x] **Step 4: 运行 creator E2E**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- community-product-flow.spec.ts
```

Expected: 点击 `创作者` 后出现 heading `ren`，可见 `1 repositories`，点击 `Memory Market` 可回到详情。

## Task 10: 完整验收、主记录更新和 Phase8 勾选

**Files:**
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- Read: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- Test: `apps/api/test/community.integration-spec.ts`
- Test: `apps/web/tests/e2e/community-product-flow.spec.ts`

- [x] **Step 1: 运行 Phase8 必需验收命令**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- community.integration-spec.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- community-product-flow.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected:

```txt
All listed commands exit 0.
community.integration-spec.ts passes.
community-product-flow.spec.ts passes.
```

- [x] **Step 2: 检查 Phase8 无 fixture 回退和旧占位文本**

Run:

```bash
rg -n "mock|fixture|后端接入后|占位" apps/web/src/features/community apps/web/src/features/worlddock/view-community.tsx apps/api/src/modules/community apps/api/test/community.integration-spec.ts apps/web/tests/e2e/community-product-flow.spec.ts
```

Expected:

```txt
No matches for 后端接入后 or 占位.
Any mock/fixture matches are limited to test setup comments or non-production test routing.
```

- [x] **Step 3: 更新未完成调查文档 Phase8**

将 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 中 Phase8 改为：

```md
## Phase 8: 社区发现、创作者主页和完整 Repository Detail

完成状态：已完成。

完成依据：

- `apps/api/src/modules/community/*` 已提供 community repositories、repository detail、snapshot assets、creator profile、creator repositories 和 collections API。
- `/v1/community/repositories?cursor=&q=&tag=&sort=` 支持搜索、标签、排序和 cursor 分页，并过滤 `removed` 仓库。
- `GET /v1/community/repositories/:owner/:slug` 聚合 latest release、release history、asset counts 和 fork graph。
- `GET /v1/community/repositories/:repositoryId/assets?kind=&cursor=` 从最新 published release snapshot 返回 Archive、Seeds、Conflicts 公开资产，并支持分页。
- `apps/web/src/features/community/*` 已提供 Explore、Repository Detail、Creator Profile 和 Collections 独立页面。
- `apps/web/src/features/worlddock/view-community.tsx` 已把社区主路径接入真实 community API，并提供 Star、Fork、收藏和举报入口。
- Repository Detail 的 Overview、Archive、Seeds、Conflicts、Releases、Forks 标签页已从后端数据渲染，不再显示“后端接入后按分页加载”占位文案。
- `apps/api/test/community.integration-spec.ts` 与 `apps/web/tests/e2e/community-product-flow.spec.ts` 覆盖社区发现产品流。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test:integration -- community.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- community-product-flow.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 8 不包含 creator profile report 的治理闭环、管理员审核后台、真实通知或模板库。
- Fork sync 的冲突应用能力由 Phase 6 提供；Phase 8 只要求公开 repository detail 展示 fork graph 和进入已存在 Fork 主路径。
```

- [x] **Step 4: 提交 Phase8 完成变更**

提交前检查匿名身份：

```bash
git config user.name
git config user.email
git config user.name "Codex"
git config user.email "codex@openai.com"
```

提交：

```bash
git add apps/api/src/modules/community apps/api/src/modules/repositories apps/api/test/community.integration-spec.ts apps/web/src/features/community apps/web/src/features/worlddock/api.ts apps/web/src/features/worlddock/view-community.tsx apps/web/tests/e2e/community-product-flow.spec.ts docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md docs/superpowers/plans/2026-05-31-phase-8-community-detail-completion.md
git commit -m "feat: complete community discovery detail flow"
git log -1 --format=fuller
```

Expected:

```txt
Author:     Codex <codex@openai.com>
Commit:     Codex <codex@openai.com>
```

## Phase8 Done Criteria

- `/v1/community/repositories` 支持 cursor、q、tag、sort，且不会返回 removed repository。
- `/v1/community/repositories/:owner/:slug` 返回 repository detail、latest release、release history、asset counts、fork graph。
- `/v1/community/repositories/:repositoryId/assets` 返回最新 release snapshot 中的 Archive、Seeds、Conflicts 公开资产。
- `/v1/community/creators/:handle` 和 `/v1/community/creators/:handle/repositories` 返回创作者主页所需数据。
- Collections 保存幂等，删除只影响当前用户的 collection。
- Explore、Repository Detail、Creator Profile、Collections 都在 `apps/web/src/features/community/*` 中有独立页面。
- Repository Detail 没有“后端接入后按分页加载”占位文案。
- `community.integration-spec.ts` 与 `community-product-flow.spec.ts` 通过。
- `pnpm lint`、`pnpm test`、`pnpm build` 通过。
