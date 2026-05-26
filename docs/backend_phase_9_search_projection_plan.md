# Phase 9: Meilisearch 搜索投影实施计划

## 目标

建立公开世界搜索投影的后端主干：

- 新增 `outbox_events` 表；
- repository 发布、Star、Fork 状态变化写入 outbox；
- 新增 `apps/worker` 搜索投影 worker；
- 定义 `world_repositories` 搜索文档 mapper；
- API 提供公开仓库搜索接口；
- 前端 Explore 查询优先调用真实搜索接口。

## 范围

本 Phase 建立 outbox、BullMQ worker、Meilisearch HTTP 索引适配和 API fallback 搜索。真实 Meilisearch daemon 的端到端联调依赖本地 Docker/服务可用环境；如果 daemon 不可用，本 Phase 以可测试的 mapper、请求适配、API 回查与 fallback 行为作为验收。

## 涉及文件

- `packages/domain/src/repository/**`
- `packages/db/prisma/schema.prisma`
- `apps/api/src/modules/repositories/**`
- `apps/api/test/repository.integration-spec.ts`
- `apps/worker/**`
- `apps/web/src/features/worlddock/api.ts`
- `apps/web/src/features/worlddock/view-community.tsx`
- `docs/backend_development_plan.md`

## 数据模型

- `outbox_events`

## API

- `GET /v1/repositories/search?q=<keyword>&tag=<tag>&sort=<relevance|stars|forks|updated>`

## 前端接入点

- Explore 搜索输入优先调用真实搜索接口；
- 无 API 或失败时保留本地筛选 fallback。

## Task 清单

- [x] 新增 `outbox_events` 表和 outbox repository。
- [x] 在 repository 发布、更新、Star、Fork 状态变化时写入 outbox。
- [x] 新增 `apps/worker`，接入 BullMQ 搜索投影队列。
- [x] 实现 `search-indexing` processor。
- [x] 定义 Meilisearch `world_repositories` index 文档结构与 settings。
- [x] 实现 repository document mapper。
- [x] 实现 upsert、delete、full rebuild 命令骨架。
- [x] API 搜索接口读取 Meilisearch 搜索结果，回查 PostgreSQL，并保留 PostgreSQL fallback。
- [x] API 搜索支持关键词、标签和排序参数。
- [x] 前端 Explore 搜索接入真实搜索接口。

## 测试命令

```bash
pnpm --filter @worlddock/db prisma:generate
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/api build
pnpm --filter @worlddock/worker test
pnpm --filter @worlddock/worker build
pnpm --filter @worlddock/web test
pnpm --filter @worlddock/web build
pnpm --filter @worlddock/web test:e2e
pnpm lint
pnpm test
pnpm build
```

## 验收标准

- 发布、Star、Fork 会写入 outbox；
- 搜索文档 mapper 输出稳定结构；
- API 搜索支持关键词、标签、排序；
- Explore 搜索可从真实 API 获取结果，失败时 fallback；
- Worker 搜索投影测试通过；
- Phase 9 测试与全仓质量门通过。

## 实际验收结果

- `outbox_events` 已加入 Prisma schema，API 通过 `OutboxRepository` 写入 repository 发布、Local Push、Star、Unstar、Fork 事件。
- `apps/worker` 已新增 BullMQ queue/worker、Prisma outbox source、Meilisearch HTTP index adapter、settings 配置、upsert/delete/full rebuild 入口。
- `GET /v1/repositories/search` 会优先读取 Meilisearch hit，再回查 PostgreSQL；Meilisearch 不可用时回退 PostgreSQL 过滤和排序。
- Explore 搜索输入已调用 `/v1/repositories/search`，请求失败时保留本地筛选体验。
- 已通过针对性验证：`pnpm --filter @worlddock/api test:integration -- repository.integration-spec.ts`、`pnpm --filter @worlddock/api build`、`pnpm --filter @worlddock/worker test`、`pnpm --filter @worlddock/worker build`、`pnpm --filter @worlddock/web test`、`pnpm --filter @worlddock/web build`。
- 已通过全仓验证：`pnpm --filter @worlddock/db prisma:validate`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm --filter @worlddock/api test:integration`、`pnpm --filter @worlddock/web test:e2e`。

## 未完成项与风险

- 当前环境未启动真实 Meilisearch daemon，因此未执行真实服务端到端 upsert/search/delete/rebuild 联调；相关 HTTP 请求体、settings、API 回查和 fallback 已用单元/集成测试覆盖。
- 审核状态变更写入 outbox 需要等 Phase 10 审核模型落地后接入。
