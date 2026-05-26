# Phase 8: Star、Fork、Local Push 与社区闭环实施计划

## 目标

完成公开世界社区的核心互动和 Local 客户端上传边界：

- 设计 `stars`、`forks` 表；
- Star / Unstar 幂等更新公开仓库统计；
- Fork 从公开 release snapshot 生成私有 draft world；
- Fork 记录 source repository、source release、target world、license snapshot；
- Local Push 使用 `repository:push` Access Token 上传公开快照；
- 前端社区页优先调用真实 Star / Fork API。

## 范围

本 Phase 不做举报审核真实写入（Phase 10），不做搜索投影（Phase 9），不做对象存储附件（Phase 11）。Local Push 只接收客户端显式提交的公开快照 JSON，不读取本地私有文件。

## 涉及文件

- `packages/db/prisma/schema.prisma`
- `apps/api/src/modules/repositories/**`
- `apps/api/test/repository.integration-spec.ts`
- `apps/web/src/features/worlddock/api.ts`
- `apps/web/src/features/worlddock/view-community.tsx`
- `apps/web/src/features/worlddock/world-dock-app.tsx`
- `docs/backend_development_plan.md`

## 数据模型

- `stars`
- `forks`

## API

- `POST /v1/repositories/:repositoryId/star`
- `DELETE /v1/repositories/:repositoryId/star`
- `POST /v1/repositories/:repositoryId/fork`
- `POST /v1/repositories/local-push`

## 前端接入点

- Community detail 的 Star / Fork 优先调用真实 API，失败时保留演示态；
- Fork 成功后仍生成本地私有世界并进入“我的世界”；
- 设置页已有 Access Token 创建能力，本 Phase 只打通服务端 token scope 边界。

## Task 清单

- [x] 设计并迁移 `stars` 和 `forks` 表。
- [x] 实现 Star / Unstar API，使用唯一约束保证幂等。
- [x] 实现 Fork API，从指定 repository release 生成私有 draft world。
- [x] Fork 记录 source repository、source release、target world、license snapshot。
- [x] 实现 Local Push API，要求 Access Token 具备 `repository:push` scope。
- [x] Local Push 只接收明确上传的公开快照，不读取本地私有数据。
- [x] 实现授权规则校验，禁止 Fork 的仓库不可 Fork。
- [x] 前端社区页接入真实 Star、Fork。
- [x] 设置页 token 状态与 Local Push 禁用态接入真实 API。

## 测试命令

```bash
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

- Star 数量可见且幂等；
- Unstar 后统计回退且幂等；
- Fork 后生成私有 draft world；
- Fork 来源和授权快照可追踪；
- 无 token 或 scope 不足时 Local Push 被拒绝；
- 社区 E2E 保持通过；
- Phase 8 测试与全仓质量门通过。

## 实际验收结果

- `pnpm --filter @worlddock/db prisma:generate` 通过。
- `pnpm --filter @worlddock/db prisma:validate` 通过。
- `pnpm --filter @worlddock/api test` 通过。
- `pnpm --filter @worlddock/api test:integration` 通过，覆盖 Star / Unstar 幂等、Fork 生成私有 world、Local Push access token scope。
- `pnpm --filter @worlddock/api build` 通过。
- `pnpm --filter @worlddock/web test` 通过，覆盖 Star / Unstar / Fork / Local Push API client。
- `pnpm --filter @worlddock/web build` 通过。
- `pnpm --filter @worlddock/web test:e2e` 通过，5 条现有前端关键链路保持可用。
- `pnpm lint` 通过。
- `pnpm test` 通过。
- `pnpm build` 通过。

## 未完成项与风险

- 举报真实写入与审核流仍按总计划留到 Phase 10；本 Phase 保留前端举报入口演示态。
- Local Push 当前保存公开快照 JSON，不处理大附件；对象存储留到 Phase 11。
- Prisma schema 已通过 generate / validate；真实数据库迁移仍需在可用 PostgreSQL 环境执行。
