# Phase 2: 个人账户认证、账户和 Onboarding Detailed Implementation Plan

> Source: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

**Goal:** 建立 Alpha 可用的邮箱密码登录/注册、账户资料 API 和首次体验闭环，让用户不再手动填写 `worlddock.sessionToken`。

**Scope:** UserProfile 数据模型、账户 API、邮箱密码 session 桥接、登录/注册页面、onboarding 三步流和对应测试。

**Non-goals:** 不做邮箱验证、邮件找回、真实邮件发送、第三方 OAuth、管理后台、模板库或真实支付。

**Dependencies:** Phase 1 production-server E2E、现有 AuthModule bearer session、Better Auth schema tables、Prisma/PostgreSQL。

## Files

- Create: `apps/api/src/modules/account/account.controller.ts`
- Create: `apps/api/src/modules/account/account.service.ts`
- Create: `apps/api/src/modules/account/account.module.ts`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`
- Create: `apps/web/src/app/(app)/onboarding/page.tsx`
- Create: `apps/web/src/app/api/auth/[...all]/route.ts`
- Create: `apps/web/src/features/account/account-api.ts`
- Create: `apps/web/src/features/onboarding/onboarding-flow.tsx`
- Create: `apps/api/test/account.integration-spec.ts`
- Create: `apps/web/tests/e2e/auth-onboarding.spec.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/prisma-auth.repository.ts`
- Modify: `apps/api/src/modules/auth/better-auth.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260527192200_user_profiles/migration.sql`

## Task 1: 定义账户产品能力

**Design:** `UserProfile` 与 Better Auth `User` 一对一，保存 displayName、handle、avatarObjectId、onboardingCompletedAt 和 deletedAt。

**Failure states:** handle 不合法或重复时返回 400/409；删除账号只做 Alpha 软删除。

**Steps:**

- [x] Step 1: Add failing account integration tests for profile creation/read/update/onboarding/delete.
- [x] Step 2: Run `pnpm --filter @worlddock/api test:integration -- account.integration-spec.ts` and confirm failure.
- [x] Step 3: Add Prisma model and migration.
- [x] Step 4: Implement account service/controller/module and register in AppModule.
- [x] Step 5: Run targeted account integration test and confirm pass.
- [x] Step 6: Commit as part of the Phase 2 commit.

## Task 2: 邮箱密码 session 桥接

**Design:** Keep existing bearer session guard. Add Alpha auth endpoints that create Better Auth compatible `User`/`Account`/`Session` records and return the session token to Web. The Next `/api/auth/[...all]` route proxies `sign-in/email` and `sign-up/email` to the Nest API and lets the page store the returned token automatically.

**Failure states:** duplicate email, invalid credentials, short password and deleted account are rejected.

**Steps:**

- [x] Step 1: Extend integration tests for register/login/logout and token-backed `/v1/me`.
- [x] Step 2: Run targeted auth/account integration tests and confirm failure.
- [x] Step 3: Add password hashing/session issuing methods to AuthService and Prisma repository.
- [x] Step 4: Add register/login endpoints and Next proxy route.
- [x] Step 5: Run targeted integration tests and confirm pass.
- [x] Step 6: Commit as part of the Phase 2 commit.

## Task 3: Alpha 登录注册 UI

**Design:** Login and register pages post to `/api/auth/sign-in/email` and `/api/auth/sign-up/email`, save the returned session token into localStorage, then redirect to `/onboarding`.

**UI states:** idle, submitting, field validation, server error.

**Failure states:** invalid email/password shows an alert; no email verification or reset link is shown.

**Steps:**

- [x] Step 1: Add Playwright E2E that mocks auth proxy responses and verifies localStorage token is written.
- [x] Step 2: Run `pnpm --filter @worlddock/web test:e2e -- auth-onboarding.spec.ts` and confirm failure.
- [x] Step 3: Build login/register pages with shared form behavior.
- [x] Step 4: Run targeted E2E and confirm pass.
- [x] Step 5: Run web lint/test if needed.
- [x] Step 6: Commit as part of the Phase 2 commit.

## Task 4: 首次体验，不做模板库

**Design:** Onboarding is a client component with three steps: goal, tone, first-world. Completing calls `/v1/account/onboarding/complete` through `account-api`, then enters `/`.

**UI states:** current step, selected option, API failure alert, completed redirect.

**Failure states:** missing session token redirects to `/login`; API failure stays on onboarding.

**Steps:**

- [x] Step 1: Extend Playwright E2E to complete onboarding with mocked account API.
- [x] Step 2: Run targeted E2E and confirm failure before implementation.
- [x] Step 3: Implement `account-api.ts`, onboarding flow and route.
- [x] Step 4: Run targeted E2E and confirm pass.
- [x] Step 5: Run Phase 2 verification commands.
- [x] Step 6: Commit as part of the Phase 2 commit.

## Verification Commands

```bash
pnpm --filter @worlddock/api test:integration -- account.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- auth-onboarding.spec.ts
pnpm --filter @worlddock/db prisma:validate
pnpm lint
pnpm test
pnpm build
```

## Verification Result

- `pnpm --filter @worlddock/api test:integration -- account.integration-spec.ts auth.integration-spec.ts`: passed.
- `pnpm --filter @worlddock/web test:e2e -- auth-onboarding.spec.ts`: passed, 2 Playwright tests.
- `pnpm --filter @worlddock/db prisma:validate`: passed.
- `pnpm lint`: passed.
- `pnpm test`: passed.
- `pnpm build`: passed.
- `pnpm --filter @worlddock/api test:integration`: passed, 29 tests and 1 skipped.
- `pnpm --filter @worlddock/web test:e2e`: passed, 7 Playwright tests.
