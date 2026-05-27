# Phase 3: 云端部署版范围冻结和 Cloud-only 主路径 Detailed Implementation Plan

> Source: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

**Goal:** 冻结 Cloud Alpha 产品范围，强制生产环境使用 cloud edition，并确保登录后的云端主链路不会回退到 Local 或 fixture 数据。

**Scope:** 产品范围文档、Local 延后文档、Cloud API contract、环境变量门禁、前端 fixture 开关、登录后云端世界列表的空/错/加载状态、发布 checklist。

**Non-goals:** 不实现本地部署版、不移除后续 Beta/Post-Cloud 所需的后端 Local Push 能力、不接入真实 Stripe、邮件、管理后台或模板库。

**Dependencies:** Phase 1 的环境强校验和 CI 基线；Phase 2 的登录、注册、onboarding 和 session token 存储。

## Files

- Create: `docs/product/cloud-release-scope.md`
- Create: `docs/product/local-deployment-later.md`
- Create: `docs/product/cloud-api-contract.md`
- Modify: `packages/config/src/env.ts`
- Modify: `apps/web/src/features/worlddock/api.ts`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`
- Modify: `apps/web/src/features/worlddock/view-worlds.tsx`
- Modify: `docs/operations/production_release_checklist.md`
- Modify: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- Test: `packages/config/test/env.test.ts`
- Test: `apps/web/src/features/worlddock/api.test.ts`
- Test: `apps/web/tests/e2e/cloud-deployment-flow.spec.ts`

## Task 1: 冻结 Cloud Alpha 产品范围

**Design:** 新增产品范围文档，明确 Cloud Alpha in scope、Beta out of scope 和 Post-Cloud Local out of scope。新增 Local 延后文档，作为未来独立计划入口。

- [x] Step 1: Write failing evidence check by creating doc expectations in this plan and final verification.
- [x] Step 2: Create `docs/product/cloud-release-scope.md`.
- [x] Step 3: Create `docs/product/local-deployment-later.md`.
- [x] Step 4: Update `docs/operations/production_release_checklist.md` to require Cloud scope review.
- [x] Step 5: Confirm docs contain the explicit exclusions for payments, email delivery, admin dashboard, template library, and local deployment.

## Task 2: 增加 Cloud edition 环境门禁

**Design:** `WORLD_DOCK_EDITION` 默认为 `cloud`，允许 `cloud | local`。生产环境只允许 `cloud`，并保留 Phase 1 的 pi、Sentry 和强 secret 校验。

- [x] Step 1: Add failing tests in `packages/config/test/env.test.ts`.
- [x] Step 2: Run `pnpm --filter @worlddock/config test -- env.test.ts` and confirm failure.
- [x] Step 3: Add `worldDockEditionSchema` and production guard in `packages/config/src/env.ts`.
- [x] Step 4: Re-run targeted config test and confirm pass.

## Task 3: 建立 Cloud API contract 与 fixture 边界

**Design:** 新增 `docs/product/cloud-api-contract.md`。在前端 API client 中新增 `canUseFixtures()`，只允许非生产且显式 `NEXT_PUBLIC_WORLD_DOCK_FIXTURES=1` 时使用 fixture。把 session token 读取集中到 API helper，避免 `world-dock-app.tsx` 直接读取 `worlddock.sessionToken`。登录后如果处于 production cloud mode，世界列表加载、错误和空状态都不能显示 mock world。

- [x] Step 1: Add failing unit tests in `apps/web/src/features/worlddock/api.test.ts`.
- [x] Step 2: Add failing E2E in `apps/web/tests/e2e/cloud-deployment-flow.spec.ts`.
- [x] Step 3: Run targeted web tests and confirm failure.
- [x] Step 4: Implement `canUseFixtures()` and session token storage helper in `api.ts`.
- [x] Step 5: Update `world-dock-app.tsx` to clear fixture worlds after auth in production cloud mode and pass cloud state to `WorldsView`.
- [x] Step 6: Update `view-worlds.tsx` to render loading/error/empty cloud states without mock fallback.
- [x] Step 7: Re-run targeted web tests and confirm pass.

## Task 4: Verification and Commit

- [x] Step 1: Run `pnpm --filter @worlddock/config test -- env.test.ts`.
- [x] Step 2: Run `pnpm --filter @worlddock/web test -- api.test.ts`.
- [x] Step 3: Run `pnpm --filter @worlddock/web test:e2e -- cloud-deployment-flow.spec.ts`.
- [x] Step 4: Run `pnpm lint`.
- [x] Step 5: Run `pnpm test`.
- [x] Step 6: Run `pnpm build`.
- [x] Step 7: Update this detailed plan and the source phase checkboxes.
- [x] Step 8: Check git identity, commit with anonymized author/committer, and verify `git log --format=fuller`.
