# Phase 7: 发布、Release Snapshot 与公开仓库实施计划

## 目标

把 Publish 从 Mock 状态推进到真实公开仓库系统：

- 共享领域包补齐 repository、release、release snapshot schema；
- Prisma schema 增加 `repositories`、`releases`、`release_snapshots`；
- 私有世界可以发布为公开 repository；
- 每次发布生成 release 与不可变 snapshot；
- snapshot 只包含白名单公开资产，不包含对话、token、模型配置、私密草稿；
- 前端发布页调用真实 publish API，Explore / repository detail 优先读取真实公开仓库。

## 范围

本 Phase 不做 Star/Fork/Report 的真实写入，不做 Meilisearch 搜索投影，不做 S3 大附件。公开列表先读 PostgreSQL；Star/Fork/Report 在 Phase 8 接上。

## 涉及文件

- `packages/domain/src/repository/**`
- `packages/db/prisma/schema.prisma`
- `apps/api/src/modules/repositories/**`
- `apps/api/test/repository.integration-spec.ts`
- `apps/web/src/features/worlddock/api.ts`
- `apps/web/src/features/worlddock/view-publish.tsx`
- `apps/web/src/features/worlddock/view-community.tsx`
- `apps/web/src/features/worlddock/world-dock-app.tsx`
- `docs/backend_development_plan.md`

## 数据模型

- `repositories`
- `releases`
- `release_snapshots`

## API

- `GET /v1/repositories`
- `GET /v1/repositories/:owner/:slug`
- `POST /v1/worlds/:worldId/publish`
- `GET /v1/repositories/:repositoryId/releases`

## 前端接入点

- API client 增加 publish 与 public repository 查询；
- 发布页确认时调用真实 API；
- Explore 优先读取真实公开仓库，无 session 或失败时保留 fixture；
- Repository detail 使用 release metadata 展示真实 release。

## Task 清单

- [x] 在 `packages/domain` 定义 release snapshot、repository detail、publish response schema。
- [x] 设计并迁移 `repositories`、`releases`、`release_snapshots` 表。
- [x] 实现 RepositoryRepository 与 Prisma adapter。
- [x] 实现 world 到 public repository 的首次发布。
- [x] 实现后续发布生成新 release。
- [x] 实现发布隐私过滤，排除原始私密对话、模型配置、API Key、未选择公开资产。
- [x] 实现实体级 diff：新增设定、修改设定、移除设定、新增故事种子。
- [x] 将 release snapshot 保存为数据库 JSON。
- [x] 实现 `GET /v1/repositories`。
- [x] 实现 `GET /v1/repositories/:owner/:slug`。
- [x] 实现 `GET /v1/repositories/:repositoryId/releases`。
- [x] 实现 `POST /v1/worlds/:worldId/publish`。
- [x] 前端发布页接入真实 diff、授权、更新说明和发布结果。
- [x] 公开仓库详情页接入真实 repository 和 release 数据。

## 测试命令

```bash
pnpm --filter @worlddock/domain test
pnpm --filter @worlddock/db prisma:generate
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/api build
pnpm --filter @worlddock/web test
pnpm --filter @worlddock/web build
pnpm --filter @worlddock/web test:e2e
pnpm lint
pnpm test
pnpm build
```

## 验收标准

- 私有世界可以发布为公开仓库；
- 发布后生成 release 和 immutable snapshot；
- 公开页只能读取 snapshot 中的公开内容；
- 发布前后 diff 与保存资产一致；
- 后续发布生成递增版本；
- 其他用户不能发布不属于自己的世界；
- 发布页与公开仓库详情优先走真实 API，失败时保留当前演示体验；
- Phase 7 测试与全仓质量门通过。

## 实际验收结果

- `pnpm --filter @worlddock/domain test` 通过，覆盖 release snapshot / publish response schema。
- `pnpm --filter @worlddock/db prisma:generate` 通过。
- `pnpm --filter @worlddock/db prisma:validate` 通过。
- `pnpm --filter @worlddock/api test` 通过。
- `pnpm --filter @worlddock/api test:integration` 通过，覆盖首次发布、后续发布版本递增、越权发布拒绝、公开列表与详情。
- `pnpm --filter @worlddock/api build` 通过。
- `pnpm --filter @worlddock/web test` 通过，覆盖 publish / repository API client。
- `pnpm --filter @worlddock/web build` 通过。
- `pnpm --filter @worlddock/web test:e2e` 通过，5 条现有前端关键链路保持可用。
- `pnpm lint` 通过。
- `pnpm test` 通过。
- `pnpm build` 通过。
- 发布快照只从 world、archive、story seed、conflict 白名单资产构造；不会序列化对话、token、模型配置或前端草稿状态。

## 未完成项与风险

- Star / Fork / Report 仍为前端演示态，按总计划留到 Phase 8。
- 公开仓库列表当前直接读取 PostgreSQL；Meilisearch 搜索投影留到 Phase 9。
- release snapshot 当前保存为数据库 JSON；S3 大附件留到 Phase 11。
- Prisma schema 已通过 generate / validate；真实数据库迁移仍需在可用 PostgreSQL 环境执行。
