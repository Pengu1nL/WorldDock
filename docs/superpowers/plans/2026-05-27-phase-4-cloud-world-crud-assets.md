# Phase 4: 云端世界 CRUD 和资产编辑器 Detailed Implementation Plan

> Source: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

**Goal:** 让登录后的 Cloud 主路径可以创建、复制、删除世界，并通过统一资产 API 保存、搜索、编辑、删除、排序和关联世界资产。

**Scope:** 统一资产 domain schema、资产 API controller/service/module、必要的 Prisma 持久化字段、前端 cloud world API wrapper、资产编辑/搜索基础组件、`world-dock-app.tsx` 的云端创建/保存/删除/复制主路径、API integration 和 web E2E。

**Non-goals:** 不重做完整资产编辑 UI、不移除旧的 `/archive`、`/seeds`、`/conflicts` 兼容端点、不实现复杂协同编辑或全文搜索后端。

**Dependencies:** Phase 2 的登录/session；Phase 3 的 Cloud-only fixture 边界。

## Files

- Create: `packages/domain/src/assets/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260527200500_world_asset_order_relations/migration.sql`
- Create: `apps/api/src/modules/world-assets/world-assets.controller.ts`
- Create: `apps/api/src/modules/world-assets/world-assets.service.ts`
- Create: `apps/api/src/modules/world-assets/world-assets.module.ts`
- Modify: `apps/api/src/modules/worlds/worlds.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/web/src/features/worlddock/api.ts`
- Create: `apps/web/src/features/worlds/worlds-api.ts`
- Create: `apps/web/src/features/world-assets/asset-editor.tsx`
- Create: `apps/web/src/features/world-assets/asset-search.tsx`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`
- Modify: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- Test: `apps/api/test/world-assets.integration-spec.ts`
- Test: `apps/web/tests/e2e/cloud-world-crud.spec.ts`

## Task 1: 统一资产 domain schema

**Design:** 新增 `worldAssetKindSchema` 和 `worldAssetSchema`。服务端统一资产 API 返回这个 schema，旧表数据映射为 `setting | seed | conflict`。

- [x] Step 1: Add domain schema and export.
- [x] Step 2: Add/extend tests through API and web consumers.
- [x] Step 3: Run `pnpm --filter @worlddock/domain test` through full `pnpm test`.

## Task 2: 补齐资产 API 行为

**Design:** 新增 `WorldAssetsModule`。Controller 在所有路由上使用 `WorldDockAuthGuard` 和 `WORLD_REPOSITORY` 做 world ownership 校验。Service 使用 Prisma 持久化旧资产表，并用 `position` 和 `WorldAssetRelation` 支持排序与关系。

- [x] Step 1: Add failing integration test for list/create/get/patch/delete/reorder/relations.
- [x] Step 2: Run `pnpm --filter @worlddock/api test:integration -- world-assets.integration-spec.ts` and confirm failure.
- [x] Step 3: Add Prisma migration and service/controller/module.
- [x] Step 4: Add duplicate endpoint in `WorldsController`.
- [x] Step 5: Re-run targeted API integration and confirm pass.

## Task 3: 前端主链路移除登录后的本地 CRUD

**Design:** 登录后创建世界调用 `POST /v1/worlds`，删除调用 `DELETE /v1/worlds/:worldId`，复制调用 `POST /v1/worlds/:worldId/duplicate`，保存本地 Agent 建议时调用统一资产 API。API 失败时保留清晰 toast，不把本地成功误当云端成功。

- [x] Step 1: Add failing E2E for cloud create/save/delete/refresh.
- [x] Step 2: Run `pnpm --filter @worlddock/web test:e2e -- cloud-world-crud.spec.ts` and confirm failure.
- [x] Step 3: Add `worlds-api.ts`, `asset-editor.tsx`, and `asset-search.tsx`.
- [x] Step 4: Extend web API client with duplicate/delete/world asset functions.
- [x] Step 5: Update `world-dock-app.tsx` handlers.
- [x] Step 6: Re-run targeted web E2E and confirm pass.

## Task 4: Verification and Commit

- [x] Step 1: Run `pnpm --filter @worlddock/db prisma:validate`.
- [x] Step 2: Run `pnpm --filter @worlddock/api test:integration -- world-assets.integration-spec.ts`.
- [x] Step 3: Run `pnpm --filter @worlddock/web test:e2e -- cloud-world-crud.spec.ts`.
- [x] Step 4: Run `pnpm lint`.
- [x] Step 5: Run `pnpm test`.
- [x] Step 6: Run `pnpm build`.
- [x] Step 7: Update source plan checkboxes.
- [x] Step 8: Check git identity, commit with anonymized author/committer, and verify `git log --format=fuller`.
