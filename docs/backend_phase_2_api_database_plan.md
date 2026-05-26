# Phase 2: API 与数据库骨架实施计划

## 目标

建立 WorldDock 后端主干的可运行骨架：

- `apps/api` 使用 NestJS + Fastify Adapter；
- `packages/db` 提供 Prisma schema、Prisma Client 导出和基础脚本；
- 本地 `docker-compose.yml` 提供 PostgreSQL、Redis、Meilisearch 和 S3 兼容存储；
- API 暴露健康检查、依赖 readiness、统一错误结构、request id 和 Zod 校验基础设施。

## 范围

本 Phase 只做 API/数据库工程骨架与系统端点，不实现认证、业务 CRUD、Agent、计费、搜索投影或对象上传业务。

## 涉及文件

- `apps/api/package.json`
- `apps/api/src/**`
- `apps/api/test/**`
- `packages/db/package.json`
- `packages/db/prisma/schema.prisma`
- `packages/db/src/**`
- `docker-compose.yml`
- `.env.example`
- `docs/backend_development_plan.md`

## 数据模型

本 Phase 不引入业务表。Prisma schema 先建立 PostgreSQL datasource 与 client generator，API readiness 使用 `$queryRaw` 检查数据库连通性。

## API

本 Phase 实现：

- `GET /v1/system/health`
- `GET /v1/system/readiness`

统一错误结构：

```ts
type ApiError = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
};
```

## 前端接入点

本 Phase 不切换前端业务数据。后续 Phase 3 起再接入 `/v1/me`、认证与世界资产 API。

## Task 清单

- [x] 新增 `apps/api`，使用 NestJS + Fastify Adapter。
- [x] 新增 `packages/db`，配置 Prisma、PostgreSQL provider、Prisma Client 导出。
- [x] 新增 `docker-compose.yml`，提供本地 PostgreSQL、Redis、Meilisearch、S3 兼容服务。
- [x] 新增 `.env.example`，列出 API、数据库、Redis、搜索、对象存储、Auth、模型供应商配置。
- [x] 实现 `GET /v1/system/health`，返回进程健康状态。
- [x] 实现 `GET /v1/system/readiness`，检查数据库和 Redis 连接。
- [x] 建立 API 全局错误过滤器，将异常转换为统一 `ApiError`。
- [x] 建立 request id middleware。
- [x] 建立 Zod validation pipe，统一校验 request body、params、query。
- [x] 增加 API 单元测试和 Supertest 集成测试。

## 测试命令

```bash
pnpm install
pnpm --filter @worlddock/db prisma:generate
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/db build
pnpm --filter @worlddock/api test
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/api build
docker compose up -d postgres redis meilisearch storage
pnpm --filter @worlddock/api test:readiness:local
```

## 验收标准

- `pnpm --filter @worlddock/api test` 通过；
- `pnpm --filter @worlddock/api test:integration` 通过；
- `pnpm --filter @worlddock/api build` 通过；
- `pnpm --filter @worlddock/db prisma:validate` 通过；
- `pnpm --filter @worlddock/db build` 通过；
- `docker compose up -d postgres redis meilisearch storage` 后 readiness 返回可用；
- 错误响应始终包含 `code`、`message`、`requestId`。

## 实际验收结果

- `pnpm install`：通过。
- `pnpm --filter @worlddock/db prisma:generate`：通过。
- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/db build`：通过。
- `pnpm --filter @worlddock/api test`：通过，1 个测试文件、2 条测试。
- `pnpm --filter @worlddock/api test:integration`：通过，1 个测试文件、3 条测试；本地 Docker readiness 测试因未设置 `WORLD_DOCK_LOCAL_READINESS=1` 按预期跳过。
- `pnpm --filter @worlddock/api build`：通过。
- `pnpm lint`、`pnpm test`、`pnpm build`：均通过。
- `docker compose up -d postgres redis meilisearch storage`：未通过，原因是本机 Docker daemon 未运行，错误为无法连接 `$HOME/.docker/run/docker.sock`。
- `pnpm --filter @worlddock/api test:readiness:local`：未执行，依赖上一步 Docker daemon。

## 未完成项与风险

- 真实 PostgreSQL/Redis readiness 尚未在本机容器环境验证；Docker daemon 启动后应执行 `docker compose up -d postgres redis meilisearch storage` 和 `pnpm --filter @worlddock/api test:readiness:local` 补验。
- 本 Phase 只建立系统端点与依赖检查，不包含业务数据表、迁移或认证模型。
