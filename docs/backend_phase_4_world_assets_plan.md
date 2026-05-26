# Phase 4: 世界资产与前端 Mock 替换实施计划

## 目标

让“我的世界、世界详情、档案、故事种子、冲突池”具备真实 API 与数据库模型：

- Prisma schema 增加 `worlds`、`archive_entries`、`story_seeds`、`conflicts`、`consistency_issues`；
- API 实现 world CRUD、archive/seed/conflict 列表与创建；
- 所有私有世界读写都通过 owner 权限检查；
- 前端增加最小 API client，为后续 TanStack Query 切换做准备。

## 范围

本 Phase 只实现创作资产主链路，不实现 Agent suggestion save、发布、搜索或计费。前端保留当前 Mock 兜底体验，新增真实 API 调用能力，不强制要求无登录的静态 E2E 依赖后端。

## 涉及文件

- `packages/db/prisma/schema.prisma`
- `apps/api/src/modules/worlds/**`
- `apps/api/test/worlds.integration-spec.ts`
- `apps/web/src/features/worlddock/api.ts`
- `apps/web/src/features/worlddock/view-worlds.tsx`
- `apps/web/src/features/worlddock/view-archive.tsx`
- `docs/backend_development_plan.md`

## 数据模型

- `worlds`
- `archive_entries`
- `story_seeds`
- `conflicts`
- `consistency_issues`

## API

- `GET /v1/worlds`
- `POST /v1/worlds`
- `GET /v1/worlds/:worldId`
- `PATCH /v1/worlds/:worldId`
- `DELETE /v1/worlds/:worldId`
- `GET /v1/worlds/:worldId/archive`
- `POST /v1/worlds/:worldId/archive`
- `GET /v1/worlds/:worldId/seeds`
- `POST /v1/worlds/:worldId/seeds`
- `GET /v1/worlds/:worldId/conflicts`
- `POST /v1/worlds/:worldId/conflicts`

## 前端接入点

- API client 增加 worlds/archive/seeds/conflicts 方法；
- `view-worlds` 可从外部传入真实 world 列表；
- `view-archive` 保留现有本地状态，同时允许后续 server state 注入。

## Task 清单

- [x] 设计并迁移 `worlds` 表，包含 owner、name、type、summary、tags、status、visibility、mode、maturity。
- [x] 设计并迁移 `archive_entries` 表，承载设定条目。
- [x] 设计并迁移 `story_seeds` 表，承载故事种子。
- [x] 设计并迁移 `conflicts` 表，承载世界冲突。
- [x] 设计并迁移 `consistency_issues` 表，承载一致性提醒。
- [x] 实现 world repository 和 domain mapper。
- [x] 实现 world CRUD API。
- [x] 实现 archive / seed / conflict 列表和创建 API。
- [x] 实现 owner 权限检查，私有世界仅 owner 可读写。
- [x] 建立 seed 数据，覆盖当前前端 Mock 中的示例世界。
- [x] 前端增加真实 API client，为 `view-worlds`、`view-archive`、工作台资产计数接入做准备。
- [x] 增加 API 单元测试和 Supertest 集成测试。

## 测试命令

```bash
pnpm --filter @worlddock/db prisma:generate
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/api build
pnpm --filter @worlddock/web test
pnpm --filter @worlddock/web build
pnpm lint
pnpm test
pnpm build
```

## 验收标准

- 登录用户可以创建世界；
- 创建后世界出现在 `GET /v1/worlds`；
- 保存设定后档案接口可见；
- 保存故事种子后故事种子接口可见；
- 保存冲突后冲突池接口可见；
- 其他用户无法访问私有世界；
- 前端 API client 覆盖真实 world/archive/seed/conflict 调用。

## 实际验收结果

- `pnpm --filter @worlddock/db prisma:generate`：通过。
- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/db build`：通过。
- `pnpm --filter @worlddock/api test`：通过，2 个测试文件、5 条测试。
- `pnpm --filter @worlddock/api test:integration`：通过，3 个测试文件、9 条测试；本地 Docker readiness 测试按预期跳过。
- `pnpm --filter @worlddock/api build`：通过。
- `pnpm --filter @worlddock/web test`：通过，3 个测试文件、8 条测试。
- `pnpm --filter @worlddock/web build`：通过。
- `pnpm --filter @worlddock/web test:e2e`：通过，5 条 Playwright E2E。
- `pnpm lint`、`pnpm test`、`pnpm build`：均通过。

## 未完成项与风险

- API 集成测试使用 in-memory repository 覆盖行为；真实 PostgreSQL 容器补验仍受 Docker daemon 未运行影响。
- 前端已用 TanStack Query 接入 `/v1/worlds`、archive、seeds、conflicts 的最小 server state；无 session 时仍保留本地 Mock/工作台状态，保证静态演示路径不回退。
