# Phase 1: 生产工程闸门和环境基线 Detailed Implementation Plan

> Source: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

**Goal:** 建立 Cloud Alpha 的生产工程闸门、环境强校验、镜像入口和发布事故响应基线。

**Scope:** CI、Dockerfile、Next production server 配置、共享环境配置校验、系统集成测试和运维 runbook。

**Non-goals:** 不接入真实云厂商部署，不改变业务 API，不接入真实支付、邮件、管理后台、模板库或本地部署版。

**Dependencies:** 现有 pnpm monorepo、Next App Router、Nest API、Prisma、Playwright、Vitest。

## Files

- Create: `.github/workflows/ci.yml`
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/worker/Dockerfile`
- Create: `docs/operations/incident_runbook.md`
- Create: `docs/operations/queue_runbook.md`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/tests/e2e/helpers.ts`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/test/env.test.ts`
- Modify: `apps/api/test/system.integration-spec.ts`
- Modify: `docs/operations/production_release_checklist.md`

## Task 1: 增加 CI 工作流

**Design:** GitHub Actions 在 pull request 和 main push 上执行同一套 Alpha 闸门：安装、Prisma generate/validate、lint、test、build、API integration、Web E2E。

**Steps:**

- [x] Step 1: Write failing test or evidence check by creating the workflow expectation in this detailed plan.
- [x] Step 2: Run `test -f .github/workflows/ci.yml` and confirm it fails before implementation.
- [x] Step 3: Create `.github/workflows/ci.yml` with the required commands.
- [x] Step 4: Run `test -f .github/workflows/ci.yml` and inspect the workflow content.
- [x] Step 5: Update release checklist evidence.
- [x] Step 6: Commit as part of the Phase 1 commit.

## Task 2: 移除生产静态导出假设

**Design:** Next production build must keep server features available. E2E must target a real production server instead of `out/index.html`.

**UI/API states:** No visible UI change. E2E keeps the same user flows but starts from `baseURL`.

**Failure states:** If the production server cannot start, Playwright fails before tests run.

**Steps:**

- [x] Step 1: Update E2E helper/config tests so they expect a production server URL, not a file URL.
- [x] Step 2: Run `pnpm --filter @worlddock/web test:e2e` and confirm the old static-export setup fails once `output: "export"` is removed.
- [x] Step 3: Remove `output: "export"` and `assetPrefix`, configure Playwright `webServer`, and update E2E helper to use `/`.
- [x] Step 4: Run `pnpm --filter @worlddock/web test:e2e` and confirm pass.
- [x] Step 5: Remove the stale static export script from package scripts.
- [x] Step 6: Commit as part of the Phase 1 commit.

## Task 3: 强化环境校验

**Design:** `parseWorldDockEnv` keeps shared API/Worker parsing, requires stronger auth secrets, models Alpha providers as `pi | mock`, and rejects production deployments that use mock AI, missing pi provider settings, or missing Sentry.

**Data model:** Environment variables only; no database changes.

**Failure states:** Zod errors for malformed required values; explicit errors for production-only policy violations.

**Steps:**

- [x] Step 1: Add failing tests in `packages/config/test/env.test.ts` and `apps/api/test/system.integration-spec.ts`.
- [x] Step 2: Run targeted tests and confirm failure.
- [x] Step 3: Implement minimal schema and `parseWorldDockEnv` production policy checks.
- [x] Step 4: Run targeted tests and confirm pass.
- [x] Step 5: Update `.env.example`, `deploy/staging.env.example`, and production checklist for the stronger env baseline.
- [x] Step 6: Commit as part of the Phase 1 commit.

## Task 4: 增加 Docker 镜像入口

**Design:** API、Web、Worker 使用同一 multi-stage pnpm pattern，最终 runtime 分别执行 package start script。

**Failure states:** Docker build should fail if lockfile/install/build cannot complete.

**Steps:**

- [x] Step 1: Run `test -f apps/api/Dockerfile` and confirm missing Dockerfile.
- [x] Step 2: Create three Dockerfiles with service-specific final `CMD`.
- [x] Step 3: Run `test -f` checks for all three Dockerfiles.
- [x] Step 4: Inspect CMD lines.
- [x] Step 5: Add release checklist entries for image build and runtime env.
- [x] Step 6: Commit as part of the Phase 1 commit.

## Task 5: 运维 Runbook 和最终验证

**Design:** Incident runbook covers severity, rollback, comms, evidence and postmortem. Queue runbook covers search/moderation workers, stalled jobs, replay and escalation.

**Steps:**

- [x] Step 1: Create docs with checklist-oriented procedures.
- [x] Step 2: Run `pnpm --filter @worlddock/db prisma:validate`.
- [x] Step 3: Run `pnpm lint`.
- [x] Step 4: Run `pnpm test`.
- [x] Step 5: Run `pnpm build`.
- [x] Step 6: Run `pnpm --filter @worlddock/api test:integration`.
- [x] Step 7: Run `pnpm --filter @worlddock/web test:e2e`.
- [x] Step 8: Record verification result in the final response.

## Verification Result

- `pnpm --filter @worlddock/db prisma:validate`: passed.
- `pnpm lint`: passed.
- `pnpm test`: passed.
- `pnpm build`: passed.
- `pnpm --filter @worlddock/api test:integration`: passed.
- `pnpm --filter @worlddock/web test:e2e`: passed, 5 Playwright tests.
- Production server smoke on `http://127.0.0.1:3101/`: `我的世界` heading and `新建世界` action visible.

## Staging Smoke And Release Checklist Updates

- Confirm production env uses `APP_ENV=production`, `AI_PROVIDER=pi`, `SENTRY_DSN`, `BETTER_AUTH_SECRET` length >= 32, and pi model provider variables.
- Confirm the Web image runs `next start`, not static file hosting.
- Confirm API `/v1/system/health`, `/v1/system/readiness`, `/v1/system/metrics` respond in staging.
- Confirm worker queues are visible and queue runbook names the replay commands.
