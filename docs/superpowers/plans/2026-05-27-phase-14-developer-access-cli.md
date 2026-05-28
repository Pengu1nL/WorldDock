# Phase 14: 世界包 CLI、个人访问令牌和轻量生态 Detailed Implementation Plan

> Source: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

**Goal:** 提供不依赖本地部署版的 Alpha 轻量开发者入口：个人访问令牌、公开仓库世界包拉取和最小 CLI。
**Scope:** PAT scope 定义、Developer Access API、worlddock CLI、公共 API 文档。
**Non-goals:** 不实现本地 Docker 部署、Local 模型配置、真实 OAuth 设备登录或 Local Push 产品化。

## Task 1: 定义个人访问令牌 scope

**Files:**
- Create: `packages/domain/src/developer-access/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/package.json`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

- [x] **Step 1: Write failing test**
- [x] **Step 2: Run test and confirm failure**
- [x] **Step 3: Implement minimal code**
- [x] **Step 4: Run test and confirm pass**
- [x] **Step 5: Update docs**
- [x] **Step 6: Commit**

## Task 2: Developer Access API

**Files:**
- Create: `apps/api/src/modules/developer-access/developer-access.controller.ts`
- Create: `apps/api/src/modules/developer-access/developer-access.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/repositories/repository.repository.ts`
- Test: `apps/api/test/public-api.integration-spec.ts`

- [x] **Step 1: Write failing test**
- [x] **Step 2: Run test and confirm failure**
- [x] **Step 3: Implement minimal code**
- [x] **Step 4: Run test and confirm pass**
- [x] **Step 5: Update docs**
- [x] **Step 6: Commit**

## Task 3: CLI 最小能力

**Files:**
- Create: `packages/worlddock-cli/package.json`
- Create: `packages/worlddock-cli/tsconfig.json`
- Create: `packages/worlddock-cli/vitest.config.ts`
- Create: `packages/worlddock-cli/src/main.ts`
- Test: `packages/worlddock-cli/test/cli.test.ts`

- [x] **Step 1: Write failing test**
- [x] **Step 2: Run test and confirm failure**
- [x] **Step 3: Implement minimal code**
- [x] **Step 4: Run test and confirm pass**
- [x] **Step 5: Update docs**
- [x] **Step 6: Commit**

## Verification

```bash
pnpm --filter @worlddock/api test:integration -- public-api.integration-spec.ts
pnpm --filter @worlddock-cli test
pnpm lint
pnpm test
pnpm build
```

Expected:
- Personal access tokens obey `world:read`, `world:write`, `repository:read`, and `billing:read`.
- CLI can list, export, and import cloud world packages.
- Repository pull returns a `.worlddock.json` compatible package without local deployment dependency.
