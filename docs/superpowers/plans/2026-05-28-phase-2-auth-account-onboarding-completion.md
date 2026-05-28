# Phase 2 个人账户认证、账户和 Onboarding 完成执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Phase 2 从 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的过期“未完成”记录推进到有证据可勾选的 Alpha 完成状态。

**Architecture:** 当前仓库已经具备 Phase 2 的主要实现：Nest API 使用 Better Auth 兼容的 Prisma 用户、账号和 Session 表，并继续通过 bearer session guard 保护业务 API；Web 使用 Next App Router 登录/注册页面和 `/api/auth/[...all]` 代理获取 session token；onboarding 客户端流自动读取登录写入的 session token 并调用账户 API。执行重点是验证现有实现、补齐失败时的最小修复、同步调查文档和保留可复核证据。

**Tech Stack:** NestJS、Fastify、Prisma/PostgreSQL、Better Auth crypto、Next.js App Router、React、Vitest、Supertest、Playwright、pnpm。

---

## 当前状态判断

`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 2 段落仍记录缺少登录、注册、onboarding、账户 API、`UserProfile` 和测试文件。当前工作区已经出现这些文件，并且 `docs/superpowers/plans/2026-05-27-phase-2-auth-account-onboarding.md` 已记录 Phase 2 的验证结果。因此本计划不是从零实现 Phase 2，而是执行一次严格复核：若验证通过，则更新过期调查记录；若验证失败，则只修复失败项涉及的最小文件。

执行边界：

- Alpha 仅支持邮箱密码注册/登录，不做邮箱验证、邮件找回、第三方 OAuth。
- Session token 由登录/注册流程自动写入 `worlddock.sessionToken`；验收标准是不让用户手动填写 token。
- `UserProfile.deletedAt` 是 Alpha 软删除标记，不在本阶段做完整账号数据擦除。
- 不改 Phase 3 及后续 Cloud-only、世界 CRUD、支付、社区或治理能力。

## 文件结构

验证和可能修改的文件：

- Verify: `packages/db/prisma/schema.prisma`
- Verify: `packages/db/prisma/migrations/20260527192200_user_profiles/migration.sql`
- Verify: `apps/api/src/modules/account/account.controller.ts`
- Verify: `apps/api/src/modules/account/account.service.ts`
- Verify: `apps/api/src/modules/account/account.module.ts`
- Verify: `apps/api/src/modules/auth/auth.controller.ts`
- Verify: `apps/api/src/modules/auth/auth.service.ts`
- Verify: `apps/api/src/modules/auth/prisma-auth.repository.ts`
- Verify: `apps/api/src/modules/auth/better-auth.ts`
- Verify: `apps/api/src/app.module.ts`
- Verify: `apps/web/src/app/api/auth/[...all]/route.ts`
- Verify: `apps/web/src/app/(auth)/login/page.tsx`
- Verify: `apps/web/src/app/(auth)/register/page.tsx`
- Verify: `apps/web/src/app/(app)/onboarding/page.tsx`
- Verify: `apps/web/src/features/account/account-api.ts`
- Verify: `apps/web/src/features/onboarding/onboarding-flow.tsx`
- Verify: `apps/api/test/account.integration-spec.ts`
- Verify: `apps/api/test/auth.integration-spec.ts`
- Verify: `apps/web/tests/e2e/auth-onboarding.spec.ts`
- Modify after successful verification: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- Do not modify unless drift is found: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

## Task 1: 建立 Phase 2 现状基线

**Files:**
- Read: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- Read: `docs/superpowers/plans/2026-05-27-phase-2-auth-account-onboarding.md`
- Read: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [x] **Step 1: 确认 Alpha 主计划 Phase 2 已列出完整验收面**

Run:

```bash
sed -n '377,532p' docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md
```

Expected: 输出包含 Phase 2 的 5 个已勾选任务：`定义账户产品能力`、`暴露账户 API`、`建立 Alpha 登录注册 UI`、`建立首次体验`、`Run verification`。

- [x] **Step 2: 确认 2026-05-28 调查记录中的 Phase 2 段落是待同步对象**

Run:

```bash
sed -n '39,75p' docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected: 输出仍包含“缺少 `apps/web/src/app/(auth)/login/page.tsx`”等过期缺失项。该段只有在 Task 5 的验证全部通过后才能替换。

- [x] **Step 3: 检查 Phase 2 必需文件全部存在**

Run:

```bash
for path in \
  'apps/web/src/app/(auth)/login/page.tsx' \
  'apps/web/src/app/(auth)/register/page.tsx' \
  'apps/web/src/app/(app)/onboarding/page.tsx' \
  'apps/web/src/app/api/auth/[...all]/route.ts' \
  'apps/web/src/features/account/account-api.ts' \
  'apps/web/src/features/onboarding/onboarding-flow.tsx' \
  'apps/api/src/modules/account/account.controller.ts' \
  'apps/api/src/modules/account/account.service.ts' \
  'apps/api/src/modules/account/account.module.ts' \
  'apps/api/test/account.integration-spec.ts' \
  'apps/api/test/auth.integration-spec.ts' \
  'apps/web/tests/e2e/auth-onboarding.spec.ts' \
  'packages/db/prisma/migrations/20260527192200_user_profiles/migration.sql'; do
  test -f "$path" || { echo "missing $path"; exit 1; }
done
```

Expected: 命令无输出并以 exit code 0 结束。

- [x] **Step 4: 确认开始执行前没有无关工作区漂移**

Run:

```bash
git status --short
```

Expected: 只允许看到本执行文档和后续 Phase 2 调查记录更新。若出现其他文件，先判断是否与 Phase 2 相关；无关改动不纳入本阶段提交。

## Task 2: 验证数据库和账户资料契约

**Files:**
- Verify: `packages/db/prisma/schema.prisma`
- Verify: `packages/db/prisma/migrations/20260527192200_user_profiles/migration.sql`

- [x] **Step 1: 校验 Prisma schema**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
```

Expected: 输出 Prisma schema validation 成功，命令 exit code 0。

- [x] **Step 2: 核对 `UserProfile` schema 关系和唯一约束**

Run:

```bash
rg -n 'model UserProfile|profile       UserProfile|handle                String   @unique|onboardingCompletedAt DateTime\\?|deletedAt             DateTime\\?|@@map\\("user_profiles"\\)' packages/db/prisma/schema.prisma
```

Expected: 输出包含 `User.profile` 关系、`model UserProfile`、`handle @unique`、`onboardingCompletedAt`、`deletedAt` 和 `@@map("user_profiles")`。

- [x] **Step 3: 核对迁移文件会创建 `user_profiles`**

Run:

```bash
rg -n 'CREATE TABLE "user_profiles"|user_profiles_userId_key|user_profiles_handle_key|user_profiles_userId_fkey' packages/db/prisma/migrations/20260527192200_user_profiles/migration.sql
```

Expected: 输出包含建表、`userId` 唯一索引、`handle` 唯一索引和级联删除外键。

- [ ] **Step 4: 失败时只修复数据库契约**

If Step 1-3 fails, update `packages/db/prisma/schema.prisma` so `User` contains `profile UserProfile?` and `UserProfile` has this exact product contract:

```prisma
model UserProfile {
  id                    String   @id @default(cuid())
  userId                String   @unique
  displayName           String
  handle                String   @unique
  avatarObjectId        String?
  onboardingCompletedAt DateTime?
  deletedAt             DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_profiles")
}
```

Then add or repair `packages/db/prisma/migrations/20260527192200_user_profiles/migration.sql` with the corresponding `user_profiles` table, unique indexes on `userId` and `handle`, and the cascade foreign key to `users(id)`. Re-run Steps 1-3 before continuing.

## Task 3: 验证 API 注册、登录、账户资料和 onboarding

**Files:**
- Verify: `apps/api/src/modules/auth/auth.controller.ts`
- Verify: `apps/api/src/modules/auth/auth.service.ts`
- Verify: `apps/api/src/modules/auth/prisma-auth.repository.ts`
- Verify: `apps/api/src/modules/account/account.controller.ts`
- Verify: `apps/api/src/modules/account/account.service.ts`
- Verify: `apps/api/src/modules/account/account.module.ts`
- Verify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/auth.integration-spec.ts`
- Test: `apps/api/test/account.integration-spec.ts`

- [x] **Step 1: 核对 API 路由契约**

Run:

```bash
rg -n '@Post\\("auth/register"\\)|@Post\\("auth/login"\\)|@Get\\("me"\\)|@Get\\("profile"\\)|@Patch\\("profile"\\)|@Patch\\("onboarding/complete"\\)|@Delete\\(\\)' apps/api/src/modules/auth/auth.controller.ts apps/api/src/modules/account/account.controller.ts
```

Expected: 输出包含 `POST /v1/auth/register`、`POST /v1/auth/login`、`GET /v1/me`、`GET /v1/account/profile`、`PATCH /v1/account/profile`、`PATCH /v1/account/onboarding/complete` 和 `DELETE /v1/account`。

- [x] **Step 2: 核对 Auth repository 支持邮箱密码 session 桥接**

Run:

```bash
rg -n 'findUserByEmail|findPasswordAccountByEmail|createPasswordUser|createSession|providerId: "credential"|accountId: input.user.email|sessions:' apps/api/src/modules/auth/prisma-auth.repository.ts apps/api/src/modules/auth/auth.service.ts
```

Expected: 输出表明注册会创建 `User`、credential `Account` 和 `Session`，登录会校验 Better Auth password hash 并创建新 `Session`。

- [x] **Step 3: 运行 API targeted integration tests**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- account.integration-spec.ts auth.integration-spec.ts
```

Expected: `account endpoints` 和 `auth endpoints` 全部通过；失败时不要更新调查记录。

- [ ] **Step 4: API 失败时按失败面修复最小文件**

If account profile tests fail, limit fixes to `apps/api/src/modules/account/*` and keep these response envelopes:

```ts
return this.account.getProfile(subject.user.id).then((profile) => ({ profile }));
return this.account.updateProfile(subject.user.id, updateProfileSchema.parse(body)).then((profile) => ({ profile }));
return this.account.completeOnboarding(subject.user.id).then((profile) => ({ profile }));
return this.account.scheduleAccountDeletion(subject.user.id).then((profile) => ({ profile }));
```

If email/password tests fail, limit fixes to `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/auth/auth.service.ts`, and `apps/api/src/modules/auth/prisma-auth.repository.ts`; keep register/login responses compatible with the Web proxy:

```ts
return {
  user: result.user,
  session: {
    token: result.session.token,
    expiresAt: result.session.expiresAt.toISOString(),
  },
  token: result.session.token,
};
```

After a fix, re-run Step 3 before continuing.

## Task 4: 验证 Web 登录、注册和 onboarding 闭环

**Files:**
- Verify: `apps/web/src/app/api/auth/[...all]/route.ts`
- Verify: `apps/web/src/app/(auth)/login/page.tsx`
- Verify: `apps/web/src/app/(auth)/register/page.tsx`
- Verify: `apps/web/src/app/(app)/onboarding/page.tsx`
- Verify: `apps/web/src/features/account/account-api.ts`
- Verify: `apps/web/src/features/onboarding/onboarding-flow.tsx`
- Test: `apps/web/tests/e2e/auth-onboarding.spec.ts`

- [x] **Step 1: 核对 Next auth proxy 指向 Nest API**

Run:

```bash
rg -n 'sign-up/email|sign-in/email|/v1/auth/register|/v1/auth/login|WORLD_DOCK_API_BASE_URL|NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL' 'apps/web/src/app/api/auth/[...all]/route.ts'
```

Expected: 输出表明 `/api/auth/sign-up/email` 代理到 `/v1/auth/register`，`/api/auth/sign-in/email` 代理到 `/v1/auth/login`。

- [x] **Step 2: 核对登录/注册会自动保存 session token**

Run:

```bash
rg -n 'worlddock\\.sessionToken|payload\\.token|payload\\.session\\?\\.token|window\\.location\\.href = "/onboarding"|邮箱或密码不正确|注册失败' 'apps/web/src/app/(auth)/login/page.tsx' 'apps/web/src/app/(auth)/register/page.tsx'
```

Expected: 输出包含登录和注册页面读取 `payload.token ?? payload.session?.token`、写入 `worlddock.sessionToken`，成功后跳转 `/onboarding`。

- [x] **Step 3: 核对 onboarding 三步流和账户 API 调用**

Run:

```bash
rg -n 'ONBOARDING_STEPS|小说世界观|悬疑奇想|从空白世界开始|completeOnboarding|worlddock\\.sessionToken|window\\.location\\.href = "/app"|window\\.location\\.href = "/login"' apps/web/src/features/onboarding/onboarding-flow.tsx
```

Expected: 输出包含三步选项、缺 session 跳转 `/login`、完成后调用 `completeOnboarding` 并跳转 `/app`。

- [x] **Step 4: 运行 Web targeted E2E**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- auth-onboarding.spec.ts
```

Expected: Playwright chromium 项目中 `new user can register, complete onboarding, and enter the app` 与 `login shows an error for invalid credentials` 两个用例通过。

- [ ] **Step 5: Web 失败时按失败面修复最小文件**

If token persistence fails, limit fixes to `apps/web/src/app/(auth)/login/page.tsx` and `apps/web/src/app/(auth)/register/page.tsx`; preserve this token extraction behavior:

```tsx
const token = payload.token ?? payload.session?.token;
if (typeof token === "string") {
  window.localStorage.setItem("worlddock.sessionToken", token);
}
window.location.href = "/onboarding";
```

If onboarding completion fails, limit fixes to `apps/web/src/features/onboarding/onboarding-flow.tsx` and `apps/web/src/features/account/account-api.ts`; preserve this authenticated request shape:

```ts
headers: {
  authorization: `Bearer ${options.sessionToken}`,
  ...(options.body ? { "content-type": "application/json" } : {}),
}
```

After a fix, re-run Step 4 before continuing.

## Task 5: 同步 Phase 2 调查记录

**Files:**
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- Read: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

- [x] **Step 1: 确认允许更新调查记录**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- account.integration-spec.ts auth.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- auth-onboarding.spec.ts
```

Expected: 三条命令全部 exit code 0。只有此时才修改 `2026-05-28-alpha-incomplete-tasks.md` 的 Phase 2 段落。

- [x] **Step 2: 替换 Phase 2 段落为完成记录**

Replace only the `## Phase 2: 个人账户认证、账户和 Onboarding` section in `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`, stopping before the next `## Phase 3` heading, with:

```markdown
## Phase 2: 个人账户认证、账户和 Onboarding

完成状态：已完成。

完成依据：

- `apps/web/src/app/(auth)/login/page.tsx` 和 `apps/web/src/app/(auth)/register/page.tsx` 已提供 Alpha 邮箱密码登录/注册入口，并在成功后自动保存后端返回的 session token。
- `apps/web/src/app/(app)/onboarding/page.tsx` 与 `apps/web/src/features/onboarding/onboarding-flow.tsx` 已提供三步 onboarding，完成后调用账户 API 并进入 `/app`。
- `apps/web/src/features/account/account-api.ts` 已封装 `GET/PATCH /v1/account/profile` 和 `PATCH /v1/account/onboarding/complete`。
- `apps/api/src/modules/account/*` 已提供账户资料读取、更新、onboarding 完成和 Alpha 软删除。
- `packages/db/prisma/schema.prisma` 与 `packages/db/prisma/migrations/20260527192200_user_profiles/migration.sql` 已包含 `UserProfile`。
- `apps/api/src/modules/auth/*` 已提供邮箱密码注册、登录、logout、`GET /v1/me` 和 bearer session 认证。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：passed。
- `pnpm --filter @worlddock/api test:integration -- account.integration-spec.ts auth.integration-spec.ts`：passed。
- `pnpm --filter @worlddock/web test:e2e -- auth-onboarding.spec.ts`：passed。

剩余说明：

- Phase 2 不包含邮箱验证、邮件找回、第三方 OAuth、模板库、真实支付或管理后台。
- 代码中仍有集中式 `worlddock.sessionToken` 存储和读取，这是当前 Alpha bearer session 方案；Phase 2 的完成标准是登录/注册自动写入 session，不要求用户手动填写 token。
```

- [x] **Step 3: 确认 Alpha 主计划无需改动**

Run:

```bash
sed -n '377,532p' docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md
```

Expected: Phase 2 Task 1-5 已经是 `- [x]`。若它们已经勾选，不再修改主计划，避免重复 churn。

## Task 6: 最终验证和提交准备

**Files:**
- Verify: root workspace
- Verify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- Verify: `docs/superpowers/plans/2026-05-28-phase-2-auth-account-onboarding-completion.md`

- [x] **Step 1: 运行 Phase 2 完成门禁**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- account.integration-spec.ts auth.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- auth-onboarding.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: 全部通过。若 `pnpm lint`、`pnpm test` 或 `pnpm build` 出现与 Phase 2 无关的既有失败，记录失败命令、错误文件和是否阻塞 Phase 2；不要把无关失败混入 Phase 2 修复。

- [x] **Step 2: 提交前检查 Git 身份**

Run:

```bash
git config user.name
git config user.email
```

Expected: 输出不包含用户真实姓名或个人邮箱。若输出会暴露个人身份，在本仓库设置匿名提交身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

- [x] **Step 3: 查看最终 diff**

Run:

```bash
git diff -- docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md docs/superpowers/plans/2026-05-28-phase-2-auth-account-onboarding-completion.md
```

Expected: diff 只包含本执行文档和 Phase 2 调查记录同步；没有产品代码修改，除非 Task 2-4 的验证暴露了真实缺陷。

- [x] **Step 4: Stage 并提交 Phase 2 文档同步**

Run:

```bash
git add docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md docs/superpowers/plans/2026-05-28-phase-2-auth-account-onboarding-completion.md
git commit -m "docs: complete phase 2 auth account onboarding"
```

Expected: commit succeeds.

- [x] **Step 5: 提交后复核 Author 和 Committer**

Run:

```bash
git log -1 --format=fuller
```

Expected: `Author` 和 `Commit` 身份不包含用户真实姓名或个人邮箱；若发现身份泄露，立即修正本地提交元数据后再继续交付。

## Self-Review

Spec coverage:

- 登录/注册页面：Task 4 Step 2 和 Step 4 覆盖。
- Better Auth 兼容邮箱密码 session 桥接：Task 3 Step 2-4 覆盖。
- 账户资料 API：Task 3 Step 1、Step 3、Step 4 覆盖。
- `UserProfile` schema 和迁移：Task 2 覆盖。
- Onboarding 三步流：Task 4 Step 3-5 覆盖。
- 测试和验收证据：Task 5 Step 1、Task 6 Step 1 覆盖。
- 调查记录同步：Task 5 Step 2 覆盖。

Placeholder scan:

- 文档没有使用占位式待补内容。
- 每个命令步骤都有明确 Expected。
- 每个失败修复分支都限制了文件范围和保留的具体代码形状。

Type and contract consistency:

- API 账户响应统一为 `{ profile }`，与 `account-api.ts` 的类型一致。
- 注册/登录响应同时保留 `session.token` 和顶层 `token`，与登录/注册页面的 token extraction 一致。
- Onboarding 使用 `/v1/account/onboarding/complete`，与 `AccountController` 的 `@Patch("onboarding/complete")` 一致。
