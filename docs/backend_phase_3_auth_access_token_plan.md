# Phase 3: 认证、用户与 Access Token 实施计划

## 目标

建立云端用户身份主干和 Local Push 所需的受限 Access Token 能力：

- Prisma schema 增加 Better Auth 兼容的 `users`、`accounts`、`sessions`、`verifications`；
- API 提供 `GET /v1/me`、`POST /v1/auth/logout`、Access Token 创建/列表/撤销；
- Access Token 只保存 hash，明文 token 只在创建响应中返回一次；
- 认证层能区分登录用户 session 与 Access Token subject，并支持 scope 校验。

## 范围

本 Phase 重点完成 API 认证边界和 token 管理。前端只接入设置页社区连接的最小 Access Token 路径；完整登录 UI 和第三方登录体验可在后续用户系统打磨中增强。

## 参考

- Better Auth NestJS 集成文档要求 Nest 挂载 Better Auth 时关闭默认 body parser，并通过 `AuthModule` 或 handler 接入。
- Better Auth Prisma 文档说明 Prisma 7 自定义 client output 时应从生成目录导入 Prisma Client。

## 涉及文件

- `packages/db/prisma/schema.prisma`
- `apps/api/src/modules/auth/**`
- `apps/api/src/app.module.ts`
- `apps/api/test/auth.integration-spec.ts`
- `apps/web/src/features/worlddock/api.ts`
- `apps/web/src/features/worlddock/view-settings.tsx`
- `apps/web/src/features/worlddock/__tests__/**`

## 数据模型

- `users`
- `accounts`
- `sessions`
- `verifications`
- `access_tokens`

Access Token 字段：

- `tokenHash`：SHA-256 hash，唯一，不保存明文；
- `prefix`：用于 UI 展示和排查；
- `scopes`：`world:read`、`world:write`、`repository:push`；
- `lastUsedAt`、`expiresAt`、`revokedAt`。

## API

- `GET /v1/me`
- `POST /v1/auth/logout`
- `GET /v1/access-tokens`
- `POST /v1/access-tokens`
- `DELETE /v1/access-tokens/:tokenId`

## 前端接入点

设置页社区连接区域从纯本地 mock 状态改为调用 Access Token API：

- 创建 token 后展示一次性明文 token；
- 列表展示 prefix、scope、过期和撤销状态；
- 撤销后刷新状态。

## Task 清单

- [x] 扩展 Prisma schema：users、accounts、sessions、verifications、access_tokens。
- [x] 增加 Better Auth 配置文件，使用 Prisma adapter 与 PostgreSQL provider。
- [x] 实现 AuthRepository 接口和 Prisma 实现。
- [x] 实现 AuthService：session 认证、Access Token hash、scope 校验、撤销。
- [x] 实现 AuthGuard、`CurrentSubject`、`RequireScopes`。
- [x] 实现 `GET /v1/me` 和 `POST /v1/auth/logout`。
- [x] 实现 Access Token 创建、列表、撤销 API。
- [x] 增加 API 单元测试和 Supertest 集成测试：未登录、已登录、scope 不足、撤销。
- [x] 前端设置页接入真实 Access Token API 的最小路径。

## 测试命令

```bash
pnpm install
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

- 未登录访问 `/v1/me` 返回 `AUTH_REQUIRED`；
- session 用户访问 `/v1/me` 返回用户基础资料；
- Access Token 创建响应只返回一次明文 token；
- token hash 入库，列表不返回明文；
- scope 不足返回 `PERMISSION_DENIED`；
- 撤销后的 token 不能继续使用；
- 设置页能展示真实 token 状态或 API 不可用错误态。

## 实际验收结果

- `pnpm install`：通过。
- `pnpm --filter @worlddock/db prisma:generate`：通过。
- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test`：通过，2 个测试文件、5 条测试。
- `pnpm --filter @worlddock/api test:integration`：通过，2 个测试文件、6 条测试；本地 Docker readiness 测试按预期跳过。
- `pnpm --filter @worlddock/api build`：通过。
- `pnpm --filter @worlddock/web test`：通过，3 个测试文件、7 条测试。
- `pnpm --filter @worlddock/web build`：通过。
- `pnpm --filter @worlddock/web test:e2e`：通过，5 条 Playwright E2E。
- `pnpm lint`、`pnpm test`、`pnpm build`：均通过。

## 未完成项与风险

- Better Auth 的 Prisma adapter 配置入口已建立，但完整 Better Auth HTTP handler 和登录/注册前端 UI 尚未挂载；当前测试通过 session bearer fixture 覆盖 `/v1/me`、logout 和 Access Token 行为。
- Access Token API 已实现 hash 存储、scope、lastUsedAt 和 revoke；真实数据库集成仍需在 Docker daemon 可用后通过迁移/容器补验。
