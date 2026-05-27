# WorldDock 个人创作者产品闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase-by-phase. Tasks use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先把 WorldDock 云端部署版从可演示的创作原型升级为可邀请个人创作者试用的 Alpha 产品，再把真实支付、邮件、管理后台、模板库和本地部署版放到后续 Beta 计划。

**Architecture:** 以现有 monorepo 为基础，保留 Nest API、Next Web、Worker、Prisma、共享 domain/config 包的边界。当前主路径只建设 Cloud-first Alpha 闭环：云端创作、pi Agent、发布、Fork、创作点账本、支付 UI 占位、社区反馈、最小内容治理和生产运维；真实支付、邮件通知、邮箱注册验证、管理后台、模板库、本地部署、Local 模型配置和 Local Push 不进入 Alpha 阻塞路径。每个阶段都必须形成可独立验收的软件增量。

**Tech Stack:** Next.js App Router、React、TypeScript、TanStack Query、Zod、NestJS、Prisma/PostgreSQL、Redis/BullMQ、Meilisearch、S3-compatible storage、Better Auth、Sentry、OpenTelemetry、Vitest、Playwright、GitHub Actions。Stripe 和邮件服务只在 Beta 计划中接入，Alpha 仅保留 UI 占位。

---

## Scope Check

这是一份 Cloud-first Alpha 产品闭环总计划，覆盖认证、云端创作、版本、社区、创作点账本、最小治理、运维、反馈和轻量生态多个独立子系统。执行时不要一次性实现整份计划；每个 Phase 执行前，必须先基于本文件创建更细的执行文档，例如 `docs/superpowers/plans/2026-05-27-phase-1-production-engineering.md`。细化执行文档里再把该 Phase 的每个 Task 拆成具体 Steps，并使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 逐项执行。

总计划的职责：

- 锁定产品化范围、阶段顺序和模块边界。
- 明确每个阶段需要改动的主要文件、测试命令和上线验收。
- 防止局部补丁把 WorldDock 做成“功能堆叠”，而不是完整的个人创作者工具。
- 明确 Alpha 不做真实支付、邮件通知、邮箱注册验证、管理后台和模板库；这些统一放入 Beta。
- 明确本地部署版不阻塞云端部署版；Local 相关工作在云端 Alpha 后写独立计划。

## 当前基线

当前仓库已经具备：

- `apps/api`：Nest API、认证守卫、世界资产 API、Agent Run SSE、用量账本、公开仓库、举报审核、对象存储 signed URL、readiness/metrics。
- `apps/web`：单页 WorldDock 前端原型、创作工作台、Explore、发布、设置页、部分 API client。
- `apps/worker`：搜索索引队列、审核扫描队列、对象清理函数。
- `packages/domain`：共享领域 schema。
- `packages/db`：Prisma schema 和初始 migration。
- `docs/operations`：备份、migration、生产发布 checklist 文档。

当前产品化缺口：

- 前端主链路仍混合 Mock、本地状态和真实 API。
- 登录注册、账户设置、session 生命周期不是商业产品形态。
- 世界资产缺少完整编辑、删除、排序、关联、版本和恢复。
- 发布、Fork、社区详情、搜索、审核后台还处于最小闭环。
- 模型 provider、价格表、创作点账本和余额拦截需要完成；真实支付、订阅、发票和 webhook 推迟到 Beta。
- 云端部署版的产品边界、环境配置、真实 API 主链路和生产发布证据仍需收敛。
- 本地初始化、模型配置、PAT 连接和 Push 公开快照仍需产品化，但不属于云端 Alpha 的阻塞项。
- pi Agent harness、World Tool Registry、Skill Loader、Safety Gate 和用量结算边界仍需对齐 PRD。
- 通知、客服、增长分析和运营工具尚未产品化。
- CI/CD、部署编排、告警、Worker 可视化、备份恢复演练和生产值守需要落地。

## 文件结构目标

计划完成后，核心文件边界如下。

```txt
apps/web/src/app/
  (marketing)/              # 官网、Alpha 说明、定价占位
  (auth)/                   # 登录、注册；Alpha 不做邮箱验证和邮件找回
  (app)/                    # 登录后产品主界面
  api/auth/[...all]/        # Better Auth Next/API 代理或会话桥接

apps/web/src/features/
  account/                  # 账户、安全、数据导出、注销
  onboarding/               # 新用户首次体验
  worlds/                   # 世界列表、创建、设置、归档、删除
  world-assets/             # 档案、种子、冲突、关系、搜索、批量编辑
  agent/                    # Pi Session Runner、上下文、工具、安全门、建议生命周期
  releases/                 # 版本、diff、发布、回滚
  community/                # Explore、详情、创作者主页、收藏、Fork
  billing/                  # 创作点余额、用量账本、支付 UI 占位
  notifications/            # 站内通知、活动流；Alpha 不发邮件
  support/                  # Alpha 反馈入口和问题上报

apps/api/src/modules/
  account/                  # 用户资料、安全设置、数据导出、删除账号
  worlds/                   # 世界 CRUD 与权限边界
  world-assets/             # 资产 CRUD、关联、搜索、排序、批量操作
  agent/                    # Pi Session Runner、World Tools、安全门、建议、取消、重试
  releases/                 # release、diff、snapshot、rollback、fork sync
  billing/                  # ledger、price book、entitlement、quota
  community/                # discover、creator profile、collections
  moderation/               # report、rate limit、manual ops runbook
  notifications/            # in-app notification、activity

apps/worker/src/
  activity.ts               # 活动流和通知投递
  search-indexing.ts        # 搜索索引同步
  moderation-scan.ts        # 规则和模型审核扫描
  storage-cleanup.ts        # 对象存储清理
  queue-dashboard.ts        # 队列健康快照

packages/domain/src/
  account/
  worlds/
  assets/
  agent/
  world-package/
  releases/
  billing/
  community/
  moderation/
  notifications/

packages/config/src/
  env.ts                    # dev/staging/production 强配置校验

packages/db/prisma/
  schema.prisma             # 个人创作者产品数据模型
  migrations/               # expand/backfill/contract migration

docs/
  product/
    cloud-release-scope.md
    positioning.md
    pricing.md
    permissions.md
    data-and-ip-policy.md
    local-deployment-later.md
  operations/
    production_release_checklist.md
    incident_runbook.md
    queue_runbook.md
    billing_runbook.md
```

## Phase 执行前置要求

本文件只定义 Phase 和 Phase-level Tasks，不直接细化到可执行 Steps。执行任一 Phase 前，先创建细化执行文档，文档必须包含：

- Phase 目标、范围、非目标和依赖关系。
- 该 Phase 涉及的完整文件清单。
- 每个 Task 的具体设计、数据模型、API contract、UI 状态和失败状态。
- 每个 Task 的 Steps，至少包含：写失败测试、运行确认失败、实现最小代码、运行确认通过、更新文档或验收证据、提交。
- 每个 Task 的精确命令和预期结果。
- Phase 完成后的 staging smoke 和生产发布 checklist 更新项。

细化执行文档结构示例：

```md
# Phase 1: 生产工程闸门和环境基线 Detailed Implementation Plan

> Source: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

**Goal:** 建立生产工程闸门、环境强校验、镜像入口和发布事故响应基线。
**Scope:** CI、Dockerfile、环境配置校验、系统集成测试和运维 runbook。
**Non-goals:** 不接入真实云厂商部署，不改业务功能。

## Task 1: 增加 CI 工作流

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Test: `apps/api/test/system.integration-spec.ts`

- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Run test and confirm failure**
- [ ] **Step 3: Implement minimal code**
- [ ] **Step 4: Run test and confirm pass**
- [ ] **Step 5: Update docs or release evidence**
- [ ] **Step 6: Commit**
```

## 全局执行规则

- 每个 Phase 执行前必须先写细化执行文档；没有细化文档时，不允许开始代码实现。
- 每个细化执行文档中的 Task 必须先写测试或验收脚本，再写实现。
- 每个 Phase 完成后至少运行 `pnpm lint`、`pnpm test`、`pnpm build`。
- 触及 API 时运行 `pnpm --filter @worlddock/api test:integration`。
- 触及前端主链路时运行 `pnpm --filter @worlddock/web test:e2e`。
- 触及 Prisma schema 时运行 `pnpm --filter @worlddock/db prisma:validate` 和 `pnpm --filter @worlddock/db prisma:migrate:deploy`。
- 触及生产发布能力时同步更新 `docs/operations/production_release_checklist.md`。
- 每个 Phase 至少在 staging 完成一次 smoke，才允许标记为产品闭环完成。
- 本总计划中的 checkbox 只表示 Phase 内 Task 的完成状态；具体 Step 只写在对应 Phase 的细化执行文档里。

## Milestones

```txt
M1 单人云端创作闭环
  Auth + onboarding + 云端世界 CRUD + 世界资产 CRUD + Agent 持久化

M2 云端部署版产品边界
  Cloud-only 范围冻结 + Mock/fixture 移除 + 生产 env 门禁 + Cloud API 主链路

M3 Alpha 可测试产品闭环
  pi Agent + price book + 创作点余额 + 账单 UI 占位 + 发布版本 + 生产部署

M4 界仓社区与治理
  Explore 完整详情 + 创作者主页 + Star/Fork/Release + 举报入口 + 人工治理 runbook + 搜索分页

M5 个人创作者增长与轻量生态
  官网 + Alpha 申请/反馈 + 产品分析 + 世界包 CLI / SDK

Beta 延后能力
  真实支付 + 邮件通知 + 邮箱注册验证 + 管理后台 + 模板库

Post-Cloud 本地部署版独立计划
  Docker 本地初始化 + 本地模型配置 + PAT 连接 + Push 公开快照 + Local/Cloud 边界
```

---

### Phase 1: 生产工程闸门和环境基线

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/worker/Dockerfile`
- Create: `docs/operations/incident_runbook.md`
- Create: `docs/operations/queue_runbook.md`
- Modify: `package.json`
- Modify: `packages/config/src/env.ts`
- Modify: `docs/operations/production_release_checklist.md`
- Test: `apps/api/test/system.integration-spec.ts`

- [x] **Task 1: 增加 CI 工作流**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @worlddock/db prisma:generate
      - run: pnpm --filter @worlddock/db prisma:validate
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - run: pnpm --filter @worlddock/api test:integration
      - run: pnpm --filter @worlddock/web test:e2e
```

- [x] **Task 2: 移除生产静态导出假设**

Modify `apps/web/next.config.ts` so production can use authenticated routes and server features:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@worlddock/domain"],
};

export default nextConfig;
```

- [x] **Task 3: 强化环境校验**

Modify `packages/config/src/env.ts` so production rejects mock model and weak auth secrets:

```ts
import { z } from "zod";

export const runtimeEnvironmentSchema = z.enum(["development", "test", "staging", "production"]);
export const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);

export const worldDockEnvSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema.default("development"),
  APP_ENV: runtimeEnvironmentSchema.default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1048576),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  TRUSTED_ORIGINS: z.string().optional(),
  WEB_APP_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MEILISEARCH_HOST: z.string().url(),
  MEILISEARCH_API_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  SENTRY_DSN: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  AI_PROVIDER: z.enum(["pi", "mock"]).default("mock"),
  AI_MODEL: z.string().min(1).optional(),
  PI_AGENT_CORE_VERSION: z.string().min(1).optional(),
  PI_AI_VERSION: z.string().min(1).optional(),
  PI_MODEL_PROVIDER: z.string().min(1).optional(),
  PI_MODEL_ID: z.string().min(1).optional(),
  PI_PROVIDER_API_KEY: z.string().min(1).optional(),
  PI_SKILLS_DIR: z.string().min(1).optional(),
});

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WorldDockEnv = z.infer<typeof worldDockEnvSchema>;

export function parseWorldDockEnv(env: Record<string, string | undefined>): WorldDockEnv {
  const parsed = worldDockEnvSchema.parse(env);
  if (parsed.APP_ENV === "production" && parsed.AI_PROVIDER === "mock") {
    throw new Error("AI_PROVIDER=mock is not allowed in production.");
  }
  if (parsed.APP_ENV === "production" && parsed.AI_PROVIDER === "pi" && (!parsed.PI_MODEL_PROVIDER || !parsed.PI_MODEL_ID || !parsed.PI_PROVIDER_API_KEY)) {
    throw new Error("PI_MODEL_PROVIDER, PI_MODEL_ID, and PI_PROVIDER_API_KEY are required when AI_PROVIDER=pi in production.");
  }
  if (parsed.APP_ENV === "production" && !parsed.SENTRY_DSN) {
    throw new Error("SENTRY_DSN is required in production.");
  }
  return parsed;
}
```

- [x] **Task 4: 增加 Docker 镜像入口**

Create `apps/api/Dockerfile`, `apps/web/Dockerfile`, and `apps/worker/Dockerfile` with the same build pattern:

```dockerfile
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["pnpm", "--filter", "@worlddock/api", "start"]
```

For `apps/web/Dockerfile`, change the final `CMD` to:

```dockerfile
CMD ["pnpm", "--filter", "@worlddock/web", "start"]
```

For `apps/worker/Dockerfile`, change the final `CMD` to:

```dockerfile
CMD ["pnpm", "--filter", "@worlddock/worker", "start"]
```

- [x] **Task 5: Run verification**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm lint
pnpm test
pnpm build
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/web test:e2e
```

Expected: all commands pass.

### Phase 2: 个人账户认证、账户和 Onboarding

**Files:**
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`
- Create: `apps/web/src/app/(app)/onboarding/page.tsx`
- Create: `apps/web/src/features/account/account-api.ts`
- Create: `apps/web/src/features/onboarding/onboarding-flow.tsx`
- Create: `apps/api/src/modules/account/account.controller.ts`
- Create: `apps/api/src/modules/account/account.service.ts`
- Create: `apps/api/src/modules/account/account.module.ts`
- Modify: `apps/api/src/modules/auth/better-auth.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Test: `apps/web/tests/e2e/auth-onboarding.spec.ts`
- Test: `apps/api/test/account.integration-spec.ts`

- [x] **Task 1: 定义账户产品能力**

Add account data fields in `packages/db/prisma/schema.prisma`:

```prisma
model UserProfile {
  id          String   @id @default(cuid())
  userId      String   @unique
  displayName String
  handle      String   @unique
  avatarObjectId String?
  onboardingCompletedAt DateTime?
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_profiles")
}
```

- [x] **Task 2: 暴露账户 API**

Create endpoints in `apps/api/src/modules/account/account.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { AccountService } from "./account.service";

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  handle: z.string().regex(/^[a-z0-9-]{3,32}$/).optional(),
});

@Controller("account")
@UseGuards(WorldDockAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get("profile")
  profile(@CurrentSubject() subject: AuthSubject) {
    return this.account.getProfile(subject.user.id);
  }

  @Patch("profile")
  updateProfile(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    return this.account.updateProfile(subject.user.id, updateProfileSchema.parse(body));
  }

  @Patch("onboarding/complete")
  completeOnboarding(@CurrentSubject() subject: AuthSubject) {
    return this.account.completeOnboarding(subject.user.id);
  }

  @Delete()
  deleteAccount(@CurrentSubject() subject: AuthSubject) {
    return this.account.scheduleAccountDeletion(subject.user.id);
  }
}
```

- [x] **Task 3: 建立 Alpha 登录注册 UI，不做邮箱验证**

Create `apps/web/src/app/(auth)/login/page.tsx` and matching register route. Alpha uses email/password as the login identifier but does not send email verification or password reset email. Each route must include:

```tsx
"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setError("邮箱或密码不正确。");
      return;
    }
    window.location.href = "/onboarding";
  }

  return (
    <main className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <h1>登录 WorldDock</h1>
        <label>
          <span>邮箱</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
        </label>
        <label>
          <span>密码</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">登录</button>
      </form>
    </main>
  );
}
```

- [x] **Task 4: 建立首次体验，不做模板库**

Create `apps/web/src/features/onboarding/onboarding-flow.tsx` with a three-step flow:

```tsx
export const ONBOARDING_STEPS = [
  { id: "goal", title: "选择创作目标", options: ["小说世界观", "游戏设定", "TRPG 战役", "影视宇宙"] },
  { id: "tone", title: "选择推演风格", options: ["严肃史诗", "悬疑奇想", "轻喜剧", "黑色寓言"] },
  { id: "first-world", title: "创建第一个世界", options: ["从空白世界开始"] },
] as const;
```

- [x] **Task 5: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- account.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- auth-onboarding.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: new user can register, log in, complete onboarding, and enter the app without using `worlddock.sessionToken` manually.

### Phase 3: 云端部署版范围冻结和 Cloud-only 主路径

**Files:**
- Create: `docs/product/cloud-release-scope.md`
- Create: `docs/product/local-deployment-later.md`
- Create: `docs/product/cloud-api-contract.md`
- Modify: `packages/config/src/env.ts`
- Modify: `apps/web/src/features/worlddock/api.ts`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`
- Modify: `apps/web/src/features/worlddock/view-worlds.tsx`
- Modify: `docs/operations/production_release_checklist.md`
- Test: `packages/config/test/env.test.ts`
- Test: `apps/web/src/features/worlddock/api.test.ts`
- Test: `apps/web/tests/e2e/cloud-deployment-flow.spec.ts`

- [x] **Task 1: 冻结云端部署版范围**

Create `docs/product/cloud-release-scope.md`:

```md
# Cloud Release Scope

WorldDock Cloud Alpha focuses on the hosted personal-creator product.

In scope:
- Email/password account, onboarding, account settings, session lifecycle
- Cloud world creation, editing, archive entries, story seeds, conflicts, consistency reminders
- pi-backed Agent runs, inspectable context, pending suggestions, explicit save/discard
- Cloud releases, repository detail, Star, Fork, creator profile, Explore search
- Creation credits, price book, billing ledger, low-balance blocking, payment UI placeholder
- Report submission, manual moderation runbook, rate limiting, support feedback
- Production deployment, Sentry, OpenTelemetry, worker queues, backups, release checklist

Out of scope until Beta:
- Real Stripe checkout, subscription, invoice, payment webhook, customer portal
- Email notification delivery
- Email signup verification
- Admin dashboard and moderation workbench
- Template library

Out of scope until after Cloud Alpha:
- Docker local deployment
- Local model configuration UI
- Local database ownership and offline drafts
- Local PAT connection flow
- Local Push public snapshot wizard
- Local filesystem import/export automation

Local deployment will be planned in a separate document after Cloud Alpha is usable end to end.
```

Create `docs/product/local-deployment-later.md`:

```md
# Local Deployment Later

Local deployment is intentionally deferred. Do not add Local setup screens, Local Push APIs, or Local model settings to the Cloud Alpha execution path.

When Cloud Alpha reaches launch readiness, create a separate implementation plan:
`docs/superpowers/plans/YYYY-MM-DD-local-deployment-product.md`.

That later plan should cover:
- Docker Compose local initialization
- Local model provider setup and connection tests
- Local world package import/export
- Personal access token connection to Cloud
- Explicit Push public snapshot review
- Local/Cloud privacy boundary and no-secret upload guarantees
```

- [x] **Task 2: 增加 Cloud edition 环境门禁**

Modify `packages/config/src/env.ts`:

```ts
export const worldDockEditionSchema = z.enum(["cloud", "local"]).default("cloud");

export const worldDockEnvSchema = z.object({
  WORLD_DOCK_EDITION: worldDockEditionSchema,
  APP_ENV: runtimeEnvironmentSchema.default("development"),
  AI_PROVIDER: z.enum(["pi", "mock"]).default("mock"),
});

export function parseWorldDockEnv(env: Record<string, string | undefined>): WorldDockEnv {
  const parsed = worldDockEnvSchema.parse(env);
  if (parsed.APP_ENV === "production" && parsed.WORLD_DOCK_EDITION !== "cloud") {
    throw new Error("Production deployment must use WORLD_DOCK_EDITION=cloud.");
  }
  return parsed;
}
```

- [x] **Task 3: 建立 Cloud API contract，前端不再依赖 Local 兜底**

Create `docs/product/cloud-api-contract.md`:

```md
# Cloud API Contract

Cloud frontend must use authenticated API calls for product state.

Required cloud endpoints before Alpha:
- GET /v1/me
- PATCH /v1/me
- GET /v1/worlds
- POST /v1/worlds
- GET /v1/worlds/:worldId
- PATCH /v1/worlds/:worldId
- DELETE /v1/worlds/:worldId
- GET /v1/worlds/:worldId/assets
- POST /v1/worlds/:worldId/assets
- PATCH /v1/worlds/:worldId/assets/:assetId
- DELETE /v1/worlds/:worldId/assets/:assetId
- POST /v1/worlds/:worldId/agent-runs
- GET /v1/agent-runs/:runId/events
- POST /v1/agent-suggestions/:suggestionId/save
- POST /v1/agent-suggestions/:suggestionId/discard
- GET /v1/repositories
- POST /v1/repositories
- GET /v1/repositories/:ownerName/:slug
- POST /v1/repositories/:repositoryId/releases
- POST /v1/repositories/:repositoryId/stars
- POST /v1/repositories/:repositoryId/forks
- GET /v1/billing/usage
- GET /v1/billing/placeholder

Cloud frontend must not read `worlddock.sessionToken` manually, must not use fixture data after authentication succeeds, and must show typed empty/error/loading states for every API call.
```

Modify `apps/web/src/features/worlddock/api.ts` so production cloud mode rejects fixture fallback:

```ts
export function canUseFixtures() {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_WORLD_DOCK_FIXTURES === "1";
}
```

- [x] **Task 4: Run verification**

Run:

```bash
pnpm --filter @worlddock/config test -- env.test.ts
pnpm --filter @worlddock/web test -- api.test.ts
pnpm --filter @worlddock/web test:e2e -- cloud-deployment-flow.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: production env requires `WORLD_DOCK_EDITION=cloud`, authenticated cloud flows do not use Local/fixture fallback, and Cloud Alpha scope explicitly excludes real payments, email delivery, admin dashboard, template library, and local deployment work.

### Phase 4: 云端世界 CRUD 和资产编辑器

**Files:**
- Create: `packages/domain/src/assets/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260527200500_world_asset_order_relations/migration.sql`
- Create: `apps/api/src/modules/world-assets/world-assets.controller.ts`
- Create: `apps/api/src/modules/world-assets/world-assets.service.ts`
- Create: `apps/api/src/modules/world-assets/world-assets.module.ts`
- Modify: `apps/web/src/features/worlddock/api.ts`
- Create: `apps/web/src/features/worlds/worlds-api.ts`
- Create: `apps/web/src/features/world-assets/asset-editor.tsx`
- Create: `apps/web/src/features/world-assets/asset-search.tsx`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`
- Modify: `apps/api/src/modules/worlds/worlds.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/world-assets.integration-spec.ts`
- Test: `apps/web/tests/e2e/cloud-world-crud.spec.ts`

- [x] **Task 1: 补齐资产 API 行为**

World asset endpoints must support:

```txt
GET    /v1/worlds/:worldId/assets?kind=&q=&cursor=
POST   /v1/worlds/:worldId/assets
GET    /v1/worlds/:worldId/assets/:assetId
PATCH  /v1/worlds/:worldId/assets/:assetId
DELETE /v1/worlds/:worldId/assets/:assetId
POST   /v1/worlds/:worldId/assets/reorder
POST   /v1/worlds/:worldId/assets/:assetId/relations
DELETE /v1/worlds/:worldId/assets/:assetId/relations/:targetAssetId
```

- [x] **Task 2: 统一资产 domain schema**

Create `packages/domain/src/assets/index.ts`:

```ts
import { z } from "zod";

export const worldAssetKindSchema = z.enum(["setting", "seed", "conflict"]);

export const worldAssetSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  kind: worldAssetKindSchema,
  title: z.string().min(1),
  category: z.string().min(1).optional(),
  summary: z.string().min(1),
  body: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  position: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type WorldAsset = z.infer<typeof worldAssetSchema>;
```

- [x] **Task 3: 前端主链路移除本地 CRUD**

Modify `apps/web/src/features/worlddock/world-dock-app.tsx` so these actions call cloud APIs:

```txt
createWorld -> POST /v1/worlds
deleteWorld -> DELETE /v1/worlds/:worldId
duplicateWorld -> POST /v1/worlds/:worldId/duplicate
handleSave -> POST /v1/worlds/:worldId/assets or save agent suggestion
handleDiscard -> discard agent suggestion and update cloud state
```

- [x] **Task 4: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- world-assets.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- cloud-world-crud.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: create, edit, delete, duplicate, search, reorder, and relate assets persist after browser refresh and logout/login.

### Phase 5: 基于 pi 的 Agent Session、工具和长世界记忆

**Files:**
- Create: `docs/product/pi-upstream-audit.md`
- Create: `docs/product/pi-agent-architecture.md`
- Create: `docs/product/world-asset-progressive-disclosure.md`
- Create: `packages/domain/src/agent/context.ts`
- Create: `packages/domain/src/agent/pi.ts`
- Create: `apps/api/src/modules/agent/pi/pi-runtime.client.ts`
- Create: `apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts`
- Create: `apps/api/src/modules/agent/pi/pi-session-runner.ts`
- Create: `apps/api/src/modules/agent/pi/pi-event-adapter.ts`
- Create: `apps/api/src/modules/agent/pi/world-tool-registry.ts`
- Create: `apps/api/src/modules/agent/pi/world-tools.ts`
- Create: `apps/api/src/modules/agent/pi/skill-loader.ts`
- Create: `apps/api/src/modules/agent/pi/safety-gate.ts`
- Create: `apps/api/src/modules/agent/context-builder.ts`
- Create: `apps/web/src/features/agent/agent-run-panel.tsx`
- Create: `apps/web/src/features/agent/context-inspector.tsx`
- Modify: `packages/domain/package.json`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/modules/agent/agent.repository.ts`
- Modify: `apps/api/src/modules/agent/prisma-agent.repository.ts`
- Modify: `apps/api/src/modules/agent/agent.provider.ts`
- Modify: `apps/api/src/modules/agent/agent.module.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/config/src/env.ts`
- Test: `apps/api/test/pi-agent.integration-spec.ts`
- Test: `apps/api/test/agent-context.integration-spec.ts`
- Test: `apps/web/tests/e2e/pi-agent.spec.ts`

- [x] **Task 1: 锁定 pi upstream 版本和真实 API**

Before writing the Phase 5 detailed execution document, inspect the real upstream repository and record evidence. Do not invent package names, endpoints, event types, or method signatures.

Upstream source:

```txt
https://github.com/earendil-works/pi
```

Local source tree:

```txt
/Users/luohaodong/Documents/CodeBase/pi
```

Verified baseline at plan-writing time:

```txt
Repository: earendil-works/pi
Local source tree confirmed: /Users/luohaodong/Documents/CodeBase/pi
Local root package name: pi-monorepo
Local root package version: 0.0.3
Local git metadata: not present at confirmation time; use remote clone only when a commit hash is required
Agent package directory: packages/agent
Agent package name: @earendil-works/pi-agent-core
Agent package version: 0.75.5
Agent package exports: "." and "./node"
AI package directory: packages/ai
AI package name: @earendil-works/pi-ai
AI package version: 0.75.5
Node engine in agent package: >=22.19.0
Agent core class: Agent
Agent methods confirmed locally: subscribe, prompt, waitForIdle
Agent cancellation API to verify before implementation: abort or active AbortSignal path
Agent hooks to verify before implementation: beforeToolCall, afterToolCall
Agent events confirmed locally: agent_start, agent_end, turn_start, turn_end, message_start, message_update, message_end, tool_execution_start, tool_execution_update, tool_execution_end
```

Run these commands and paste the outputs into `docs/product/pi-upstream-audit.md`. Prefer the local source tree. Do not use guessed API shapes when local source is available.

```bash
LOCAL_PI_ROOT=/Users/luohaodong/Documents/CodeBase/pi
test -d "$LOCAL_PI_ROOT"
cat "$LOCAL_PI_ROOT/package.json"
cat "$LOCAL_PI_ROOT/packages/agent/package.json"
cat "$LOCAL_PI_ROOT/packages/ai/package.json"
rg -n "export class Agent|subscribe\\(|prompt\\(|waitForIdle\\(|beforeToolCall|afterToolCall|AgentEvent|AgentTool" "$LOCAL_PI_ROOT/packages/agent/src" "$LOCAL_PI_ROOT/packages/ai/src"
npm view @earendil-works/pi-agent-core version exports
npm view @earendil-works/pi-ai version exports
```

If commit pinning is required and `$LOCAL_PI_ROOT` still has no `.git` directory, run:

```bash
rm -rf .tmp/pi-upstream
git clone --depth 1 https://github.com/earendil-works/pi.git .tmp/pi-upstream
git -C .tmp/pi-upstream rev-parse HEAD
```

Create `docs/product/pi-upstream-audit.md`:

```md
# Pi Upstream Audit

Source repository: https://github.com/earendil-works/pi
Local source tree: /Users/luohaodong/Documents/CodeBase/pi
Local source status: present; no `.git` directory was present during plan confirmation.
Pinned commit: record the exact `git rev-parse HEAD` output from the local tree if `.git` exists, otherwise from a temporary remote clone.

Use only APIs confirmed in this audit when implementing Phase 5.

Confirmed packages:
- @earendil-works/pi-agent-core 0.75.5
- @earendil-works/pi-ai 0.75.5

Confirmed Agent API:
- subscribe
- prompt
- waitForIdle
- cancellation: verify exact abort or AbortSignal path from local source before implementation
- beforeToolCall
- afterToolCall

Confirmed event names:
- agent_start
- agent_end
- turn_start
- turn_end
- message_start
- message_update
- message_end
- tool_execution_start
- tool_execution_update
- tool_execution_end

Confirmed tool shape:
Record the exact AgentTool type or equivalent source excerpt.

Implementation decision:
WorldDock will integrate pi as a TypeScript package adapter, not as a guessed HTTP `/v1/sessions/stream` service. If the upstream API differs from this plan, update the Phase 5 detailed execution document before writing code.
```

- [x] **Task 2: 固化 pi Agent 架构边界**

Create `docs/product/pi-agent-architecture.md`:

```md
# Pi Agent Architecture

WorldDock API owns users, worlds, assets, releases, billing, moderation, permissions, and persistence.

pi owns Agent session execution: model calls, streaming events, tool-call loop, skill invocation, context compaction, and session state.

WorldDock never lets pi write directly to product tables. pi can only request registered WorldDock tools. Every tool request passes Safety Gate, returns typed data, and is persisted through WorldDock services.

Allowed read tools:
- get_world_manifest
- search_world_assets
- get_asset_brief
- get_asset_detail
- get_asset_source_fragments
- list_repository_releases

Allowed proposal tools:
- propose_setting
- propose_story_seed
- propose_conflict
- propose_release_notes

Dangerous operations stay outside pi and require explicit user confirmation through WorldDock API:
- save suggestion to world asset
- delete or overwrite existing asset
- publish release
- push local snapshot
- charge credits
- change visibility or permissions
- read local files or secrets
- execute shell commands

Billing rule: only pi/model execution consumes creation credits. Manual editing, browsing, Star, Fork, import/export, Push, and release viewing do not consume credits unless the user explicitly asks pi to generate or review content.
```

- [x] **Task 3: 定义 pi 事件和工具契约**

Create `packages/domain/src/agent/pi.ts`:

```ts
import { z } from "zod";
import { worldAssetKindSchema, worldDisclosureLevelSchema } from "./context";
import { suggestionSchema, tokenUsageSchema } from "./index";

export const piToolNameSchema = z.enum([
  "get_world_manifest",
  "search_world_assets",
  "get_asset_brief",
  "get_asset_detail",
  "get_asset_source_fragments",
  "list_repository_releases",
  "propose_setting",
  "propose_story_seed",
  "propose_conflict",
  "propose_release_notes",
]);

export const piToolCallSchema = z.object({
  id: z.string().min(1),
  name: piToolNameSchema,
  arguments: z.record(z.string(), z.unknown()),
});

export const piRuntimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.started"), piSessionId: z.string().min(1) }),
  z.object({
    type: z.literal("context.used"),
    level: worldDisclosureLevelSchema,
    kind: worldAssetKindSchema,
    title: z.string().min(1),
    excerpt: z.string().min(1),
    targetId: z.string().min(1).optional(),
    source: z.enum(["initial", "tool"]).optional(),
  }),
  z.object({ type: z.literal("message.delta"), text: z.string() }),
  z.object({ type: z.literal("tool.requested"), toolCall: piToolCallSchema }),
  z.object({ type: z.literal("tool.completed"), toolCallId: z.string().min(1), result: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("suggestion.created"), suggestion: suggestionSchema }),
  z.object({ type: z.literal("usage"), tokenUsage: tokenUsageSchema }),
  z.object({ type: z.literal("session.completed") }),
  z.object({ type: z.literal("session.failed"), code: z.string().min(1), message: z.string().min(1) }),
]);

export type PiToolName = z.infer<typeof piToolNameSchema>;
export type PiToolCall = z.infer<typeof piToolCallSchema>;
export type PiRuntimeEvent = z.infer<typeof piRuntimeEventSchema>;
```

Modify `packages/domain/package.json`:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./agent": "./src/agent/index.ts",
    "./agent/context": "./src/agent/context.ts",
    "./agent/pi": "./src/agent/pi.ts"
  }
}
```

Modify existing `AgentRun` in `packages/db/prisma/schema.prisma` by adding fields and index without removing existing columns:

```prisma
model AgentRun {
  piSessionId String?
  provider    String  @default("mock")

  @@index([piSessionId])
}
```

Modify existing `ContextRef` in `packages/db/prisma/schema.prisma` so context usage can be inspected by disclosure level:

```prisma
model ContextRef {
  level  String @default("card")
  source String @default("initial")

  @@index([runId, level])
}
```

Modify `packages/domain/src/agent/index.ts` so existing `agentEventSchema` also accepts pi-visible lifecycle events:

```ts
baseAgentEventSchema.extend({
  type: z.literal("pi.session.started"),
  payload: z.object({ piSessionId: z.string().min(1) }),
}),
baseAgentEventSchema.extend({
  type: z.literal("tool.requested"),
  payload: z.object({ toolCall: piToolCallSchema }),
}),
baseAgentEventSchema.extend({
  type: z.literal("tool.completed"),
  payload: z.object({ toolCallId: z.string().min(1), result: z.record(z.string(), z.unknown()) }),
}),
```

- [x] **Task 4: 定义 World Asset Progressive Disclosure Protocol**

Create `docs/product/world-asset-progressive-disclosure.md`:

```md
# World Asset Progressive Disclosure Protocol

WorldDock long-world context follows the same progressive disclosure principle as pi skills: give the Agent a compact entry point first, then let it open only the relevant layers.

Disclosure layers:
- Manifest: the world entry point. Includes world name, type, summary, tags, asset counts, recent changes, and a compact index.
- Card: one asset preview. Includes id, kind, title, short excerpt, tags, relations, and updatedAt.
- Brief: compact canonical summary for one asset. Includes stable facts, relationships, open questions, and source pointers.
- Detail: the full canonical asset body. Loaded only after the Agent has a specific reason.
- Source Fragment: original text fragments used for citation, reconciliation, or conflict review.
- Release Delta: version change summary used when generating release notes or comparing forks.

Initial session context:
- Always include exactly one Manifest.
- Include up to 8 ranked Cards.
- Include up to 3 ranked Briefs when the prompt strongly matches those assets.
- Do not include Detail or Source Fragment in initial context.

Tool disclosure rules:
- `get_world_manifest` returns only Manifest.
- `search_world_assets` returns Cards, never full bodies.
- `get_asset_brief` returns Brief.
- `get_asset_detail` returns Detail and must be preceded by Card or Brief use in the same run.
- `get_asset_source_fragments` returns Source Fragments and is reserved for citation, contradiction checks, or precise rewrite tasks.

Persistence rules:
- Every disclosed context item emits `context.used` with `level`, `kind`, `title`, `excerpt`, `targetId`, and `source`.
- Frontend Context Inspector groups context by disclosure level.
- Product data remains canonical in WorldDock tables; summaries are retrieval aids, not source of truth.

Alpha token budget:
- Manifest: <= 1200 tokens.
- Initial Cards: <= 8 cards, <= 80 tokens each.
- Initial Briefs: <= 3 briefs, <= 600 tokens each.
- Detail: loaded on demand, target <= 2000 tokens.
- Source Fragment: loaded on demand, target <= 1200 tokens.
```

Create `packages/domain/src/agent/context.ts`:

```ts
import { z } from "zod";

export const worldDisclosureLevelSchema = z.enum(["manifest", "card", "brief", "detail", "source_fragment", "release_delta"]);
export const worldAssetKindSchema = z.enum(["world", "setting", "seed", "conflict", "repository"]);
export const worldDisclosableAssetKindSchema = z.enum(["setting", "seed", "conflict", "repository"]);

export const worldContextBudget = {
  manifestTokens: 1200,
  initialCardCount: 8,
  initialBriefCount: 3,
  cardTokens: 80,
  briefTokens: 600,
  detailTokens: 2000,
  sourceFragmentTokens: 1200,
} as const;

export const worldAssetCardSchema = z.object({
  worldId: z.string().min(1),
  targetId: z.string().min(1),
  kind: worldDisclosableAssetKindSchema,
  title: z.string().min(1),
  excerpt: z.string().min(1),
  tags: z.array(z.string()).default([]),
  relations: z.array(z.string()).default([]),
  updatedAt: z.string().datetime().optional(),
  score: z.number().default(0),
});

export const worldAssetBriefSchema = worldAssetCardSchema.extend({
  summary: z.string().min(1),
  facts: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  sourcePointers: z.array(z.string()).default([]),
});

export const worldManifestSchema = z.object({
  worldId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  status: z.string().min(1),
  visibility: z.string().min(1),
  assetCounts: z.object({
    archive: z.number().int().nonnegative(),
    seeds: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
  }),
  recentChanges: z.array(z.string()).default([]),
  index: z.array(worldAssetCardSchema).default([]),
});

export const worldContextRefSchema = z.object({
  level: worldDisclosureLevelSchema,
  kind: worldAssetKindSchema,
  title: z.string().min(1),
  excerpt: z.string().min(1),
  targetId: z.string().min(1).optional(),
  source: z.enum(["initial", "tool"]).default("initial"),
});

export type WorldDisclosureLevel = z.infer<typeof worldDisclosureLevelSchema>;
export type WorldAssetKind = z.infer<typeof worldAssetKindSchema>;
export type WorldDisclosableAssetKind = z.infer<typeof worldDisclosableAssetKindSchema>;
export type WorldAssetCard = z.infer<typeof worldAssetCardSchema>;
export type WorldAssetBrief = z.infer<typeof worldAssetBriefSchema>;
export type WorldManifest = z.infer<typeof worldManifestSchema>;
export type WorldContextRef = z.infer<typeof worldContextRefSchema>;
```

- [x] **Task 5: 建立 World Context Builder**

Create `apps/api/src/modules/agent/context-builder.ts`:

```ts
import type { WorldAssetBrief, WorldAssetCard, WorldContextRef, WorldManifest } from "@worlddock/domain/agent/context";

export type AgentContextItem = WorldAssetCard & {
  keywords?: string[];
  score: number;
};

export function rankAssetCards(input: {
  prompt: string;
  items: AgentContextItem[];
  maxItems: number;
}) {
  const prompt = input.prompt.toLowerCase();
  return [...input.items]
    .map((item) => ({
      ...item,
      score: item.score + (prompt.includes(item.title.toLowerCase()) ? 10 : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, input.maxItems);
}

export function selectInitialWorldContext(input: {
  prompt: string;
  manifest: WorldManifest;
  cards: WorldAssetCard[];
  briefs: WorldAssetBrief[];
  maxCards?: number;
  maxBriefs?: number;
}): WorldContextRef[] {
  const rankedCards = rankAssetCards({
    prompt: input.prompt,
    items: input.cards.map((card) => ({ ...card, score: card.score ?? 0 })),
    maxItems: input.maxCards ?? 8,
  });
  const rankedBriefIds = new Set(rankedCards.slice(0, input.maxBriefs ?? 3).map((card) => card.targetId));

  return [
    {
      level: "manifest",
      kind: "world",
      title: input.manifest.name,
      excerpt: input.manifest.summary,
      targetId: input.manifest.worldId,
      source: "initial",
    },
    ...rankedCards.map((card) => ({
      level: "card" as const,
      kind: card.kind,
      title: card.title,
      excerpt: card.excerpt,
      targetId: card.targetId,
      source: "initial" as const,
    })),
    ...input.briefs
      .filter((brief) => rankedBriefIds.has(brief.targetId))
      .map((brief) => ({
        level: "brief" as const,
        kind: brief.kind,
        title: brief.title,
        excerpt: brief.summary,
        targetId: brief.targetId,
        source: "initial" as const,
      })),
  ];
}
```

- [x] **Task 6: 建立 Pi Runtime Client 和 Session Runner**

Create `apps/api/src/modules/agent/pi/pi-runtime.client.ts`:

```ts
import { piRuntimeEventSchema, type PiRuntimeEvent, type PiToolName } from "@worlddock/domain/agent/pi";
import type { WorldContextRef } from "@worlddock/domain/agent/context";

export type PiSessionInput = {
  runId: string;
  worldId: string;
  userId: string;
  mode: "expand" | "challenge" | "fork" | "polish";
  prompt: string;
  model?: string | null;
  context: WorldContextRef[];
  tools: Array<{ name: PiToolName; description: string; inputSchema: Record<string, unknown> }>;
  skills: Array<{ name: string; path: string; description: string }>;
};

export type PiRuntimeClient = {
  runSession(input: PiSessionInput): AsyncIterable<PiRuntimeEvent>;
};

export type PiAgentCoreAdapter = (
  input: PiSessionInput,
  emit: (event: PiRuntimeEvent) => void,
) => Promise<void>;

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(value: IteratorResult<T>) => void> = [];
  private ended = false;

  push(value: T) {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.values.push(value);
  }

  end() {
    this.ended = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      const value = this.values.shift();
      if (value) yield value;
      else if (this.ended) return;
      else yield await new Promise<T>((resolve) => this.waiters.push((result) => resolve(result.value)));
    }
  }
}

export class PiAgentCoreRuntimeClient implements PiRuntimeClient {
  constructor(private readonly adapter: PiAgentCoreAdapter) {}

  async *runSession(input: PiSessionInput): AsyncIterable<PiRuntimeEvent> {
    const queue = new AsyncEventQueue<PiRuntimeEvent>();

    for (const contextRef of input.context) {
      queue.push(piRuntimeEventSchema.parse({
        type: "context.used",
        level: contextRef.level,
        kind: contextRef.kind,
        title: contextRef.title,
        excerpt: contextRef.excerpt,
        targetId: contextRef.targetId,
        source: "initial",
      }));
    }

    const run = this.adapter(input, (event) => {
      queue.push(piRuntimeEventSchema.parse(event));
    })
      .catch((error) => {
        queue.push(piRuntimeEventSchema.parse({
          type: "session.failed",
          code: "PI_RUNTIME_FAILED",
          message: error instanceof Error ? error.message : "pi runtime failed",
        }));
      })
      .finally(() => {
        queue.end();
      });

    for await (const event of queue) {
      yield event;
    }

    await run;
  }
}

export function createMissingPiAdapter(): PiAgentCoreAdapter {
  return async () => {
    throw new Error("PiAgentCoreAdapter is not configured. Run the pi upstream audit and implement the adapter from confirmed @earendil-works/pi-agent-core APIs.");
  };
}

export class MockPiRuntimeClient implements PiRuntimeClient {
  async *runSession(input: PiSessionInput): AsyncIterable<PiRuntimeEvent> {
    yield { type: "session.started", piSessionId: `pi_${input.runId}` };
    for (const contextRef of input.context) {
      yield {
        type: "context.used",
        level: contextRef.level,
        kind: contextRef.kind,
        title: contextRef.title,
        excerpt: contextRef.excerpt,
        targetId: contextRef.targetId ?? undefined,
        source: contextRef.source,
      };
    }
    yield { type: "message.delta", text: `我会基于「${input.prompt}」生成一条可确认的世界设定。` };
    yield {
      type: "suggestion.created",
      suggestion: {
        id: "pi_setting_mock",
        kind: "setting",
        category: "世界规则",
        title: "可确认的世界规则",
        summary: "pi mock runtime 生成的设定建议。",
        body: "这条设定只能作为 pending suggestion，必须由用户确认后才能写入世界资产。",
      },
    };
    yield { type: "usage", tokenUsage: { inputTokens: input.prompt.length, outputTokens: 64, totalTokens: input.prompt.length + 64 } };
    yield { type: "session.completed" };
  }
}
```

Modify `apps/api/package.json` after Task 1 confirms versions:

```json
{
  "dependencies": {
    "@earendil-works/pi-agent-core": "0.75.5",
    "@earendil-works/pi-ai": "0.75.5"
  }
}
```

Create `apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts` only after Task 1 has recorded the real upstream API. This file is the only place allowed to import `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai`.

Required exports:

```txt
PiAgentCoreAdapterOptions
createPiAgentCoreAdapter(options: PiAgentCoreAdapterOptions): PiAgentCoreAdapter
```

The factory must throw when `PI_MODEL_PROVIDER`, `PI_MODEL_ID`, or `PI_PROVIDER_API_KEY` is missing. The implementation body must be written in the Phase 5 detailed execution document from the confirmed upstream API shape. The adapter must not introduce guessed HTTP endpoints, guessed constructor options, or guessed event payload fields.

Create `apps/api/src/modules/agent/pi/pi-session-runner.ts`:

```ts
import type { PiRuntimeEvent, PiToolName } from "@worlddock/domain/agent/pi";
import type { PiRuntimeClient, PiSessionInput } from "./pi-runtime.client";
import type { SafetyGate } from "./safety-gate";
import type { WorldToolRegistry } from "./world-tool-registry";

function contextEventsFromToolResult(toolName: PiToolName, result: Record<string, unknown>): PiRuntimeEvent[] {
  if (toolName === "get_world_manifest" && result.manifest && typeof result.manifest === "object") {
    const manifest = result.manifest as { worldId: string; name: string; summary: string };
    return [{ type: "context.used", level: "manifest", kind: "world", title: manifest.name, excerpt: manifest.summary, targetId: manifest.worldId, source: "tool" }];
  }

  if (toolName === "search_world_assets" && Array.isArray(result.cards)) {
    return result.cards.map((card): PiRuntimeEvent => {
      const item = card as { kind: "setting" | "seed" | "conflict" | "repository"; title: string; excerpt: string; targetId: string };
      return { type: "context.used", level: "card", kind: item.kind, title: item.title, excerpt: item.excerpt, targetId: item.targetId, source: "tool" };
    });
  }

  if (toolName === "get_asset_brief" && result.brief && typeof result.brief === "object") {
    const brief = result.brief as { kind: "setting" | "seed" | "conflict" | "repository"; title: string; summary: string; targetId: string };
    return [{ type: "context.used", level: "brief", kind: brief.kind, title: brief.title, excerpt: brief.summary, targetId: brief.targetId, source: "tool" }];
  }

  if (toolName === "get_asset_detail" && result.detail && typeof result.detail === "object") {
    const detail = result.detail as { kind: "setting" | "seed" | "conflict" | "repository"; title: string; body: string; targetId: string };
    return [{ type: "context.used", level: "detail", kind: detail.kind, title: detail.title, excerpt: detail.body.slice(0, 500), targetId: detail.targetId, source: "tool" }];
  }

  if (toolName === "get_asset_source_fragments" && Array.isArray(result.fragments)) {
    return result.fragments.map((fragment): PiRuntimeEvent => {
      const item = fragment as { kind: "setting" | "seed" | "conflict" | "repository"; text: string; targetId: string };
      return { type: "context.used", level: "source_fragment", kind: item.kind, title: `${item.kind}:${item.targetId}`, excerpt: item.text, targetId: item.targetId, source: "tool" };
    });
  }

  return [];
}

export class PiSessionRunner {
  constructor(
    private readonly runtime: PiRuntimeClient,
    private readonly tools: WorldToolRegistry,
    private readonly safetyGate: SafetyGate,
  ) {}

  async *run(input: PiSessionInput): AsyncIterable<PiRuntimeEvent> {
    const disclosedAssetIds = new Set(input.context.map((ref) => ref.targetId).filter((id): id is string => Boolean(id)));

    for await (const event of this.runtime.runSession(input)) {
      if (event.type === "tool.requested") {
        this.safetyGate.assertToolAllowed(event.toolCall, disclosedAssetIds);
        const result = await this.tools.execute(event.toolCall.name, event.toolCall.arguments);
        yield event;
        yield { type: "tool.completed", toolCallId: event.toolCall.id, result };
        for (const contextEvent of contextEventsFromToolResult(event.toolCall.name, result)) {
          if (contextEvent.targetId) disclosedAssetIds.add(contextEvent.targetId);
          yield contextEvent;
        }
        continue;
      }

      yield event;
    }
  }
}
```

- [x] **Task 7: 建立 World Tool Registry 和 Safety Gate**

Create `apps/api/src/modules/agent/pi/safety-gate.ts`:

```ts
import type { PiToolCall, PiToolName } from "@worlddock/domain/agent/pi";

const ALLOWED_TOOLS = new Set<PiToolName>([
  "get_world_manifest",
  "search_world_assets",
  "get_asset_brief",
  "get_asset_detail",
  "get_asset_source_fragments",
  "list_repository_releases",
  "propose_setting",
  "propose_story_seed",
  "propose_conflict",
  "propose_release_notes",
]);

export class SafetyGate {
  assertToolAllowed(toolCall: PiToolCall, disclosedAssetIds = new Set<string>()) {
    if (!ALLOWED_TOOLS.has(toolCall.name)) {
      throw new Error(`Blocked unsafe pi tool: ${toolCall.name}`);
    }

    if (toolCall.name === "get_asset_detail" || toolCall.name === "get_asset_source_fragments") {
      const assetId = String(toolCall.arguments.assetId ?? "");
      if (!disclosedAssetIds.has(assetId)) {
        throw new Error(`Blocked premature asset expansion: ${toolCall.name} requires prior Card or Brief disclosure for ${assetId}`);
      }
    }
  }
}
```

Create `apps/api/src/modules/agent/pi/world-tool-registry.ts`:

```ts
import type { PiToolName } from "@worlddock/domain/agent/pi";

export type WorldToolHandler = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class WorldToolRegistry {
  private readonly handlers = new Map<PiToolName, WorldToolHandler>();

  register(name: PiToolName, handler: WorldToolHandler) {
    this.handlers.set(name, handler);
  }

  async execute(name: PiToolName, input: Record<string, unknown>) {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`World tool is not registered: ${name}`);
    return handler(input);
  }
}

export function describeWorldTools() {
  return [
    { name: "get_world_manifest", description: "Read the World Manifest entry point without full asset bodies.", inputSchema: { type: "object", required: ["worldId"] } },
    { name: "search_world_assets", description: "Search world assets and return Cards only.", inputSchema: { type: "object", required: ["worldId", "query"] } },
    { name: "get_asset_brief", description: "Read one compact asset Brief after a Card is relevant.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
    { name: "get_asset_detail", description: "Read one full canonical asset Detail after Card or Brief disclosure.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
    { name: "get_asset_source_fragments", description: "Read bounded source fragments for citation or conflict checks.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
    { name: "list_repository_releases", description: "List public release metadata for a repository.", inputSchema: { type: "object", required: ["repositoryId"] } },
    { name: "propose_setting", description: "Return a typed pending setting suggestion.", inputSchema: { type: "object", required: ["title", "body"] } },
    { name: "propose_story_seed", description: "Return a typed pending story seed suggestion.", inputSchema: { type: "object", required: ["title", "hook", "conflict"] } },
    { name: "propose_conflict", description: "Return a typed pending conflict suggestion.", inputSchema: { type: "object", required: ["title", "body"] } },
    { name: "propose_release_notes", description: "Return proposed release notes without publishing.", inputSchema: { type: "object", required: ["repositoryId"] } },
  ] as const;
}
```

Create `apps/api/src/modules/agent/pi/world-tools.ts`:

```ts
import type { ArchiveEntryRecord, ConflictRecord, StorySeedRecord, WorldRecord, WorldRepository } from "../../worlds/world.repository";
import { WorldToolRegistry } from "./world-tool-registry";

type DisclosureAsset = {
  id: string;
  worldId: string;
  kind: "setting" | "seed" | "conflict";
  title: string;
  excerpt: string;
  summary: string;
  body: string;
  relations: string[];
  updatedAt: Date;
};

function excerpt(text: string, max = 320) {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function archiveToAsset(entry: ArchiveEntryRecord): DisclosureAsset {
  return {
    id: entry.id,
    worldId: entry.worldId,
    kind: "setting",
    title: entry.title,
    excerpt: entry.summary,
    summary: entry.summary,
    body: entry.body,
    relations: entry.relations ?? [],
    updatedAt: entry.updatedAt,
  };
}

function seedToAsset(seed: StorySeedRecord): DisclosureAsset {
  return {
    id: seed.id,
    worldId: seed.worldId,
    kind: "seed",
    title: seed.title,
    excerpt: seed.hook,
    summary: `${seed.hook}\n\nConflict: ${seed.conflict}`,
    body: [seed.hook, seed.trigger, seed.conflict, seed.protagonists].filter(Boolean).join("\n\n"),
    relations: seed.questions ?? [],
    updatedAt: seed.updatedAt,
  };
}

function conflictToAsset(conflict: ConflictRecord): DisclosureAsset {
  return {
    id: conflict.id,
    worldId: conflict.worldId,
    kind: "conflict",
    title: conflict.title,
    excerpt: conflict.summary,
    summary: conflict.summary,
    body: conflict.body,
    relations: [...(conflict.related ?? []), ...(conflict.derivedSeeds ?? [])],
    updatedAt: conflict.updatedAt,
  };
}

export async function listDisclosureAssets(worlds: WorldRepository, worldId: string) {
  const [archive, seeds, conflicts] = await Promise.all([
    worlds.listArchiveEntries(worldId),
    worlds.listStorySeeds(worldId),
    worlds.listConflicts(worldId),
  ]);
  return [
    ...archive.map(archiveToAsset),
    ...seeds.map(seedToAsset),
    ...conflicts.map(conflictToAsset),
  ];
}

export function toCard(asset: DisclosureAsset) {
  return {
    worldId: asset.worldId,
    targetId: asset.id,
    kind: asset.kind,
    title: asset.title,
    excerpt: excerpt(asset.excerpt, 240),
    tags: [],
    relations: asset.relations,
    updatedAt: asset.updatedAt.toISOString(),
    score: 0,
  };
}

export function toBrief(asset: DisclosureAsset) {
  return {
    ...toCard(asset),
    summary: excerpt(asset.summary, 1200),
    facts: asset.summary.split("\n").filter(Boolean).slice(0, 6),
    openQuestions: [],
    sourcePointers: [`${asset.kind}:${asset.id}`],
  };
}

async function findDisclosureAsset(worlds: WorldRepository, worldId: string, assetId: string) {
  return (await listDisclosureAssets(worlds, worldId)).find((asset) => asset.id === assetId) ?? null;
}

export function toManifest(world: WorldRecord, counts: Awaited<ReturnType<WorldRepository["countAssets"]>>, assets: DisclosureAsset[]) {
  return {
    worldId: world.id,
    name: world.name,
    type: world.type,
    summary: world.summary,
    tags: world.tags,
    status: world.status,
    visibility: world.visibility,
    assetCounts: counts,
    recentChanges: assets
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, 5)
      .map((asset) => `${asset.kind}: ${asset.title}`),
    index: assets.slice(0, 12).map(toCard),
  };
}

export async function buildDisclosureManifest(worlds: WorldRepository, world: WorldRecord) {
  const [counts, assets] = await Promise.all([worlds.countAssets(world.id), listDisclosureAssets(worlds, world.id)]);
  return toManifest(world, counts, assets);
}

export async function buildDisclosureCards(worlds: WorldRepository, worldId: string) {
  return (await listDisclosureAssets(worlds, worldId)).map(toCard);
}

export async function buildDisclosureBriefs(worlds: WorldRepository, worldId: string) {
  return (await listDisclosureAssets(worlds, worldId)).map(toBrief);
}

export function createWorldToolRegistry(worlds: WorldRepository) {
  const registry = new WorldToolRegistry();

  registry.register("get_world_manifest", async (input) => {
    const worldId = String(input.worldId);
    const world = await worlds.findWorldById(worldId);
    if (!world) return { found: false };
    return { found: true, manifest: await buildDisclosureManifest(worlds, world) };
  });

  registry.register("search_world_assets", async (input) => {
    const worldId = String(input.worldId);
    const query = String(input.query ?? "").toLowerCase();
    const assets = await listDisclosureAssets(worlds, worldId);
    return {
      cards: assets
        .filter((asset) => `${asset.title}\n${asset.summary}\n${asset.body}`.toLowerCase().includes(query))
        .slice(0, 12)
        .map(toCard),
    };
  });

  registry.register("get_asset_brief", async (input) => {
    const asset = await findDisclosureAsset(worlds, String(input.worldId), String(input.assetId));
    return asset ? { found: true, brief: toBrief(asset) } : { found: false };
  });

  registry.register("get_asset_detail", async (input) => {
    const asset = await findDisclosureAsset(worlds, String(input.worldId), String(input.assetId));
    return asset ? { found: true, detail: { ...toBrief(asset), body: asset.body } } : { found: false };
  });

  registry.register("get_asset_source_fragments", async (input) => {
    const asset = await findDisclosureAsset(worlds, String(input.worldId), String(input.assetId));
    if (!asset) return { found: false };
    return {
      found: true,
      fragments: [{ targetId: asset.id, kind: asset.kind, text: excerpt(asset.body, 1200) }],
    };
  });

  registry.register("propose_setting", async (input) => ({
    suggestion: {
      kind: "setting",
      category: String(input.category ?? "世界规则"),
      title: String(input.title ?? "未命名设定"),
      summary: String(input.summary ?? ""),
      body: String(input.body ?? ""),
    },
  }));

  return registry;
}
```

- [x] **Task 8: 建立 Skill Loader 和 Event Adapter**

Create `apps/api/src/modules/agent/pi/skill-loader.ts`:

```ts
export type PiSkillDescriptor = {
  name: string;
  path: string;
  description: string;
};

export function loadWorldDockPiSkills(env: { PI_SKILLS_DIR?: string }): PiSkillDescriptor[] {
  const basePath = env.PI_SKILLS_DIR ?? "apps/api/src/modules/agent/pi/skills";
  return [
    { name: "world-context", path: `${basePath}/world-context`, description: "Use WorldDock progressive disclosure: Manifest, Cards, Briefs, Details, then Source Fragments." },
    { name: "world-suggestion", path: `${basePath}/world-suggestion`, description: "Create typed pending suggestions instead of writing product data directly." },
  ];
}
```

Create `apps/api/src/modules/agent/pi/pi-event-adapter.ts`:

```ts
import type { PiRuntimeEvent } from "@worlddock/domain/agent/pi";
import type { AgentProviderChunk } from "../agent.provider";

export function adaptPiEvent(event: PiRuntimeEvent): AgentProviderChunk[] {
  if (event.type === "session.started") {
    return [{ type: "pi-session-started", piSessionId: event.piSessionId }];
  }
  if (event.type === "context.used") {
    return [{
      type: "context",
      contextRef: {
        level: event.level,
        kind: event.kind,
        title: event.title,
        excerpt: event.excerpt,
        targetId: event.targetId,
        source: event.source ?? "tool",
      },
    }];
  }
  if (event.type === "message.delta") {
    return [{ type: "delta", text: event.text }];
  }
  if (event.type === "suggestion.created") {
    return [{ type: "suggestion", suggestion: event.suggestion }];
  }
  if (event.type === "usage") {
    return [{ type: "usage", tokenUsage: event.tokenUsage }];
  }
  if (event.type === "tool.requested") {
    return [{ type: "tool-requested", toolCall: event.toolCall }];
  }
  if (event.type === "tool.completed") {
    return [{ type: "tool-completed", toolCallId: event.toolCallId, result: event.result }];
  }
  return [];
}
```

- [x] **Task 9: 将 AgentProvider 切换为 PiAgentProvider**

Modify `apps/api/src/modules/agent/agent.provider.ts` so pi becomes the production provider:

```ts
import type { WorldContextRef } from "@worlddock/domain/agent/context";

export type AgentProviderInput = {
  runId: string;
  userId: string;
  prompt: string;
  world: {
    id: string;
    name: string;
    summary: string;
  };
  context: WorldContextRef[];
  tools: PiSessionInput["tools"];
  skills: PiSessionInput["skills"];
  model?: string | null;
  mode: "expand" | "challenge" | "fork" | "polish";
};

export type AgentProviderChunk =
  | { type: "pi-session-started"; piSessionId: string }
  | { type: "context"; contextRef: WorldContextRef }
  | { type: "delta"; text: string }
  | { type: "tool-requested"; toolCall: PiToolCall }
  | { type: "tool-completed"; toolCallId: string; result: Record<string, unknown> }
  | { type: "suggestion"; suggestion: WorldSuggestion }
  | { type: "usage"; tokenUsage: TokenUsage };

export class PiAgentProvider implements AgentProvider {
  constructor(private readonly runner: PiSessionRunner) {}

  async *stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk> {
    for await (const event of this.runner.run({
      runId: input.runId,
      worldId: input.world.id,
      userId: input.userId,
      mode: input.mode,
      prompt: input.prompt,
      model: input.model,
      context: input.context,
      tools: input.tools,
      skills: input.skills,
    })) {
      for (const chunk of adaptPiEvent(event)) {
        yield chunk;
      }
    }
  }
}
```

Modify `apps/api/src/modules/agent/agent.module.ts`:

```ts
{
  provide: AGENT_PROVIDER,
  useFactory: (worlds: WorldRepository) => {
    if (process.env.AI_PROVIDER === "pi") {
      const adapter = createPiAgentCoreAdapter({
        modelProvider: process.env.PI_MODEL_PROVIDER,
        modelId: process.env.PI_MODEL_ID,
        providerApiKey: process.env.PI_PROVIDER_API_KEY,
      });
      const runtime = new PiAgentCoreRuntimeClient(adapter);
      const tools = createWorldToolRegistry(worlds);
      const safetyGate = new SafetyGate();
      return new PiAgentProvider(new PiSessionRunner(runtime, tools, safetyGate));
    }
    return new MockAgentProvider();
  },
  inject: [WORLD_REPOSITORY],
}
```

- [x] **Task 10: 将 AgentService 改为 pi session 编排器**

Modify `apps/api/src/modules/agent/agent.repository.ts` and `apps/api/src/modules/agent/prisma-agent.repository.ts` so:
- `AgentRunRecord` includes `piSessionId?: string | null` and `provider: "mock" | "pi"`.
- `ContextRefRecord` includes `level: "manifest" | "card" | "brief" | "detail" | "source_fragment" | "release_delta"` and `source: "initial" | "tool"`.

Modify `apps/api/src/modules/agent/agent.service.ts` so `streamEvents` builds pi session input before calling provider:

```ts
import { selectInitialWorldContext } from "./context-builder";
import { buildDisclosureBriefs, buildDisclosureCards, buildDisclosureManifest } from "./pi/world-tools";

const context = selectInitialWorldContext({
  prompt: run.prompt,
  manifest: await buildDisclosureManifest(this.worlds, world),
  cards: await buildDisclosureCards(this.worlds, world.id),
  briefs: await buildDisclosureBriefs(this.worlds, world.id),
  maxCards: 8,
  maxBriefs: 3,
});

const tools = describeWorldTools();
const skills = loadWorldDockPiSkills(process.env);

for await (const chunk of this.provider.stream({
  runId: run.id,
  userId: run.userId,
  prompt: run.prompt,
  mode: run.mode,
  model: run.model,
  world: { id: world.id, name: world.name, summary: world.summary },
  context,
  tools,
  skills,
})) {
  if (chunk.type === "context") {
    const created = await this.agents.createContextRef({ runId: run.id, ...chunk.contextRef });
    yield await this.append(run.id, sequence++, "context.used", {
      contextRef: {
        id: created.id,
        level: created.level,
        kind: created.kind,
        title: created.title,
        excerpt: created.excerpt,
        targetId: created.targetId ?? undefined,
        source: created.source,
      },
    });
  }

  if (chunk.type === "pi-session-started") {
    await this.agents.updateRun(run.id, { piSessionId: chunk.piSessionId, provider: "pi" });
    yield await this.append(run.id, sequence++, "pi.session.started", { piSessionId: chunk.piSessionId });
  }
  if (chunk.type === "tool-requested") {
    yield await this.append(run.id, sequence++, "tool.requested", { toolCall: chunk.toolCall });
  }
  if (chunk.type === "tool-completed") {
    yield await this.append(run.id, sequence++, "tool.completed", { toolCallId: chunk.toolCallId, result: chunk.result });
  }
}
```

WorldDock API remains the only writer for product data. pi output can create pending suggestions and tool events, but saving suggestions still goes through `POST /v1/agent-suggestions/:suggestionId/save`.

- [x] **Task 11: 建议生命周期产品化**

Agent suggestions must support:

```txt
pending -> saved
pending -> discarded
pending -> edited -> saved
saved -> superseded
failed run -> refunded
cancelled run -> refunded
```

- [x] **Task 12: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- pi-agent.integration-spec.ts
pnpm --filter @worlddock/api test:integration -- agent-context.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- pi-agent.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: `AI_PROVIDER=pi` runs through Pi Session Runner, pi can only call registered safe tools, events are adapted into the extended SSE contracts, suggestions remain pending until explicit user save, failed/cancelled runs settle billing correctly, and long worlds use progressive disclosure instead of dumping every asset: Manifest first, Cards/Briefs by rank, Details/Source Fragments only through tool expansion.

### Phase 6: 版本、发布、回滚和 Fork 同步

**Files:**
- Create: `packages/domain/src/releases/index.ts`
- Create: `apps/api/src/modules/releases/releases.controller.ts`
- Create: `apps/api/src/modules/releases/releases.service.ts`
- Create: `apps/api/src/modules/releases/releases.module.ts`
- Create: `apps/web/src/features/releases/release-wizard.tsx`
- Create: `apps/web/src/features/releases/diff-view.tsx`
- Modify: `apps/api/src/modules/repositories/repository.service.ts`
- Modify: `apps/web/src/features/worlddock/view-publish.tsx`
- Modify: `packages/db/prisma/schema.prisma`
- Test: `apps/api/test/releases.integration-spec.ts`
- Test: `apps/web/tests/e2e/release-flow.spec.ts`

- [x] **Task 1: 定义 release 状态机**

Create `packages/domain/src/releases/index.ts`:

```ts
import { z } from "zod";

export const releaseStatusSchema = z.enum(["draft", "published", "rolled_back"]);
export const releaseDiffKindSchema = z.enum(["added", "changed", "removed"]);

export const releaseChangeSchema = z.object({
  assetId: z.string().min(1),
  kind: releaseDiffKindSchema,
  title: z.string().min(1),
  beforeHash: z.string().optional(),
  afterHash: z.string().optional(),
});

export const worldReleaseSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  repositoryId: z.string().min(1),
  version: z.string().regex(/^v\d+\.\d+\.\d+$/),
  status: releaseStatusSchema,
  note: z.string().min(1),
  changes: z.array(releaseChangeSchema),
  createdAt: z.string().datetime(),
});
```

- [x] **Task 2: 发布前检查**

Release wizard must block publish when:

```txt
world has zero saved assets
license is missing
release note is empty
moderation pre-scan fails
billing entitlement does not include public publishing
```

- [x] **Task 3: Fork 同步**

Add APIs:

```txt
GET  /v1/forks/:forkId/upstream-diff
POST /v1/forks/:forkId/sync
POST /v1/forks/:forkId/detach
```

- [x] **Task 4: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- releases.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- release-flow.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: user can preview diff, publish, view release, roll back, Fork, compare upstream, sync non-conflicting changes, and detach a fork.

### Phase 7: 真实模型、创作点账本和支付 UI 占位

**Files:**
- Create: `packages/domain/src/billing/price-book.ts`
- Create: `apps/api/src/modules/billing/entitlements.service.ts`
- Create: `apps/web/src/features/billing/billing-page.tsx`
- Create: `apps/web/src/features/billing/pricing-page.tsx`
- Create: `docs/product/beta-payments.md`
- Modify: `apps/api/src/modules/billing/billing.service.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Test: `apps/api/test/billing-price-book.spec.ts`
- Test: `apps/api/test/billing-alpha.integration-spec.ts`
- Test: `apps/web/tests/e2e/billing-flow.spec.ts`

- [x] **Task 1: 建立价格表**

Create `packages/domain/src/billing/price-book.ts`:

```ts
export type ModelPrice = {
  provider: "openai" | "anthropic" | "openai-compatible";
  model: string;
  inputCentsPerMillionTokens: number;
  outputCentsPerMillionTokens: number;
};

export const MODEL_PRICE_BOOK: ModelPrice[] = [
  { provider: "openai", model: "gpt-5.4", inputCentsPerMillionTokens: 100, outputCentsPerMillionTokens: 500 },
  { provider: "anthropic", model: "claude-sonnet-5", inputCentsPerMillionTokens: 120, outputCentsPerMillionTokens: 600 },
  { provider: "openai-compatible", model: "qwen3-32b", inputCentsPerMillionTokens: 20, outputCentsPerMillionTokens: 80 },
];

export function calculateModelRunCostCents(input: {
  provider: ModelPrice["provider"];
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const price = MODEL_PRICE_BOOK.find((item) => item.provider === input.provider && item.model === input.model);
  if (!price) throw new Error(`Missing model price: ${input.provider}/${input.model}`);
  const inputCost = input.inputTokens * price.inputCentsPerMillionTokens / 1_000_000;
  const outputCost = input.outputTokens * price.outputCentsPerMillionTokens / 1_000_000;
  return Math.max(1, Math.ceil(inputCost + outputCost));
}
```

- [x] **Task 2: 增加 Alpha 用量和余额模型，不接真实支付**

Add models:

```prisma
model BillingPlaceholderIntent {
  id        String   @id @default(cuid())
  userId    String
  plan      String
  source    String   @default("alpha_ui")
  status    String   @default("captured")
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@map("billing_placeholder_intents")
}
```

- [x] **Task 3: 建立支付 UI 占位**

Billing UI must show:

```txt
current alpha balance
last agent run usage
recent ledger entries
plan cards marked "Beta 即将开放"
disabled payment buttons with waitlist/feedback action
no Stripe redirect
no customer portal
no webhook
```

Create `docs/product/beta-payments.md`:

```md
# Beta Payments

Alpha does not process real payments.

Deferred to Beta:
- Stripe checkout
- Stripe customer portal
- Stripe webhook
- Subscription status sync
- Invoices and receipts
- Payment failure dunning
- Production tax and refund policy
```

- [x] **Task 4: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test -- billing-price-book.spec.ts
pnpm --filter @worlddock/api test:integration -- billing-alpha.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- billing-flow.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: Agent Run uses real price book, low balance blocks runs, billing page explains every ledger entry, payment CTAs are visibly disabled or waitlist-only, and no real Stripe checkout/webhook/customer portal exists in Alpha.

### Phase 8: 社区发现、创作者主页和完整 repository detail

**Files:**
- Create: `apps/api/src/modules/community/community.controller.ts`
- Create: `apps/api/src/modules/community/community.service.ts`
- Create: `apps/api/src/modules/community/community.module.ts`
- Create: `apps/web/src/features/community/explore-page.tsx`
- Create: `apps/web/src/features/community/repository-detail-page.tsx`
- Create: `apps/web/src/features/community/creator-profile-page.tsx`
- Create: `apps/web/src/features/community/collections-page.tsx`
- Modify: `apps/api/src/modules/repositories/repository.controller.ts`
- Modify: `apps/api/src/modules/repositories/repository.service.ts`
- Modify: `apps/web/src/features/worlddock/view-community.tsx`
- Test: `apps/api/test/community.integration-spec.ts`
- Test: `apps/web/tests/e2e/community-product-flow.spec.ts`

- [ ] **Task 1: 分页和过滤 API**

Community APIs must provide:

```txt
GET /v1/community/repositories?cursor=&q=&tag=&sort=
GET /v1/community/repositories/:owner/:slug
GET /v1/community/repositories/:repositoryId/assets?kind=&cursor=
GET /v1/community/creators/:handle
GET /v1/community/creators/:handle/repositories
POST /v1/community/repositories/:repositoryId/collections
DELETE /v1/community/repositories/:repositoryId/collections/:collectionId
```

- [ ] **Task 2: 替换 repository detail 未接入标签页**

Repository detail must render:

```txt
Overview: README, license, owner, stats, latest release
Archive: public setting assets with pagination
Seeds: public story seeds with pagination
Conflicts: public conflicts with pagination
Releases: full release history
Forks: fork graph and linked worlds
```

- [ ] **Task 3: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- community.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- community-product-flow.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: Explore works without fixtures, search is paginated, repository detail shows real assets, creator profile links all public repositories, removed repositories do not appear.

### Phase 9: Alpha 举报、人工治理 Runbook 和反滥用

**Files:**
- Create: `docs/operations/alpha_moderation_runbook.md`
- Create: `docs/product/beta-admin-dashboard.md`
- Create: `apps/web/src/features/community/report-dialog.tsx`
- Modify: `apps/api/src/modules/moderation/moderation.service.ts`
- Modify: `apps/api/src/common/security.ts`
- Modify: `apps/worker/src/moderation-scan.ts`
- Test: `apps/api/test/alpha-moderation.integration-spec.ts`
- Test: `apps/web/tests/e2e/report-flow.spec.ts`

- [ ] **Task 1: 建立 Alpha 举报入口，不做管理后台**

Report flow must support:

```txt
report repository
report creator profile
report reason categories
free-text detail with minimum length
duplicate report idempotency by reporter + target + day
success state with "Alpha 团队会人工处理"
no admin route
no admin dashboard
no moderation workbench
```

Create `docs/operations/alpha_moderation_runbook.md`:

```md
# Alpha Moderation Runbook

Alpha does not include an admin dashboard.

Operators handle reports manually from database records and logs.

Minimum process:
- Review open reports daily.
- If content is clearly unsafe, update repository moderation status through a controlled database migration or one-off operator script.
- Record every manual action in the release evidence notes.
- Escalate legal, privacy, or payment-related reports to the product owner.

Beta will replace this with a proper admin dashboard and audit workflow.
```

Create `docs/product/beta-admin-dashboard.md`:

```md
# Beta Admin Dashboard

Deferred to Beta:
- Admin report queue
- User and repository management pages
- Moderation actions: keep, limit, remove, restore
- Audit log UI
- Admin role management
```

- [ ] **Task 2: 分布式限流**

Replace in-memory buckets in `apps/api/src/common/security.ts` with Redis-backed keys:

```ts
export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};
```

The implementation must key by:

```txt
ip + route family
user id + route family
access token id + route family
```

- [ ] **Task 3: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- alpha-moderation.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- report-flow.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: users can submit reports, duplicate reports are idempotent, no admin UI route is introduced, manual moderation runbook exists, and Redis rate limit works across API instances.

### Phase 10: 文件、导入导出和数据权利

**Files:**
- Create: `apps/api/src/modules/exports/exports.controller.ts`
- Create: `apps/api/src/modules/exports/exports.service.ts`
- Create: `apps/api/src/modules/exports/exports.module.ts`
- Create: `apps/worker/src/export-jobs.ts`
- Create: `apps/web/src/features/account/data-rights-page.tsx`
- Create: `apps/web/src/features/worlds/import-export-panel.tsx`
- Modify: `apps/api/src/modules/storage/storage.service.ts`
- Modify: `apps/web/src/features/worlddock/view-settings.tsx`
- Test: `apps/api/test/exports.integration-spec.ts`
- Test: `apps/web/tests/e2e/import-export.spec.ts`

- [ ] **Task 1: 设计世界包格式**

Create `packages/domain/src/worlds/world-package.ts`:

```ts
import { z } from "zod";

export const worldPackageSchema = z.object({
  format: z.literal("worlddock.world-package.v1"),
  exportedAt: z.string().datetime(),
  world: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(z.string()),
    maturity: z.number().int().min(0).max(100),
  }),
  assets: z.array(z.object({
    kind: z.enum(["setting", "seed", "conflict"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    body: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
  })),
  releases: z.array(z.object({
    version: z.string().min(1),
    note: z.string().min(1),
    createdAt: z.string().datetime(),
  })).default([]),
});
```

- [ ] **Task 2: 增加导入导出 API**

APIs:

```txt
POST /v1/worlds/:worldId/export
GET  /v1/exports/:exportId
POST /v1/worlds/import
POST /v1/account/data-export
GET  /v1/account/data-export/:exportId
```

- [ ] **Task 3: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- exports.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- import-export.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: user can export a world package, import it into a new private world, request account data export, and delete account after export warning.

### Phase 11: 站内通知、活动流和 Alpha 反馈入口

**Files:**
- Create: `packages/domain/src/notifications/index.ts`
- Create: `apps/api/src/modules/notifications/notifications.controller.ts`
- Create: `apps/api/src/modules/notifications/notifications.service.ts`
- Create: `apps/api/src/modules/notifications/notifications.module.ts`
- Create: `apps/web/src/features/notifications/notification-center.tsx`
- Create: `apps/web/src/features/support/support-entry.tsx`
- Create: `docs/product/beta-email.md`
- Modify: `packages/db/prisma/schema.prisma`
- Test: `apps/api/test/notifications.integration-spec.ts`

- [ ] **Task 1: 定义通知类型**

Create `packages/domain/src/notifications/index.ts`:

```ts
import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "welcome",
  "low_balance",
  "agent_run_failed",
  "world_published",
  "repository_forked",
  "release_published",
  "billing_placeholder_clicked",
]);

export const notificationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: notificationTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
```

- [ ] **Task 2: 建立站内通知和 Alpha 反馈入口**

In-app notification and support entry must support:

```txt
welcome
low balance
agent run failed
publish success
release published
report received
support feedback submitted
unread count
mark as read
no email delivery
no email verification
```

Create `docs/product/beta-email.md`:

```md
# Beta Email

Alpha does not send transactional or marketing email.

Deferred to Beta:
- Email signup verification
- Password reset email
- Welcome email
- Low balance email
- Payment failed email
- Publish success email
- Moderation action email
```

- [ ] **Task 3: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- notifications.integration-spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: notification records are created idempotently, notification center shows unread count, support entry preserves request context, and no email worker or email verification flow is added for Alpha.

### Phase 12: 产品分析、官网和 Alpha 申请/反馈

**Files:**
- Create: `apps/web/src/app/(marketing)/page.tsx`
- Create: `apps/web/src/app/(marketing)/pricing/page.tsx`
- Create: `apps/web/src/features/analytics/product-events.ts`
- Create: `apps/api/src/modules/analytics/analytics.controller.ts`
- Create: `apps/api/src/modules/analytics/analytics.service.ts`
- Create: `apps/api/src/modules/analytics/analytics.module.ts`
- Create: `docs/product/beta-template-library.md`
- Create: `docs/product/positioning.md`
- Create: `docs/product/pricing.md`
- Create: `docs/product/permissions.md`
- Create: `docs/product/data-and-ip-policy.md`
- Test: `apps/web/tests/e2e/marketing-and-activation.spec.ts`

- [ ] **Task 1: 定义产品事件**

Create `apps/web/src/features/analytics/product-events.ts`:

```ts
export const PRODUCT_EVENTS = {
  signedUp: "signed_up",
  onboardingCompleted: "onboarding_completed",
  worldCreated: "world_created",
  agentRunStarted: "agent_run_started",
  suggestionSaved: "suggestion_saved",
  worldPublished: "world_published",
  repositoryForked: "repository_forked",
  alphaFeedbackSubmitted: "alpha_feedback_submitted",
  billingPlaceholderClicked: "billing_placeholder_clicked",
} as const;

export type ProductEventName = typeof PRODUCT_EVENTS[keyof typeof PRODUCT_EVENTS];
```

- [ ] **Task 2: 建立 Alpha 官网和定价占位，不做模板库**

Marketing pages must support:

```txt
home page explains WorldDock Cloud Alpha
pricing page shows "Alpha 免费试用 / Beta 后开放付费"
feedback or waitlist CTA
no templates route
no template picker
no Stripe plan mapping
```

Create `docs/product/beta-template-library.md`:

```md
# Beta Template Library

Alpha does not include a template library.

Deferred to Beta:
- Template listing page
- Template detail page
- Template-driven onboarding
- Official genre templates
- Community-submitted templates
```

- [ ] **Task 3: Run verification**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- marketing-and-activation.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: landing page explains the Alpha, pricing page uses non-payment Alpha copy, no template route is required, and activation/feedback events are recorded.

### Phase 13: 可观测性、Worker 运维和生产发布闭环

**Files:**
- Create: `apps/worker/src/queue-dashboard.ts`
- Create: `apps/api/src/modules/system/worker-health.controller.ts`
- Create: `docs/operations/worker_alerts.md`
- Modify: `apps/api/src/common/observability.ts`
- Modify: `apps/worker/src/observability.ts`
- Modify: `docs/operations/production_release_checklist.md`
- Test: `apps/api/test/worker-health.integration-spec.ts`
- Test: `apps/worker/test/queue-dashboard.test.ts`

- [ ] **Task 1: Worker 队列健康快照**

Create `apps/worker/src/queue-dashboard.ts`:

```ts
export type QueueHealth = {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
};

export function classifyQueueHealth(queue: QueueHealth) {
  if (queue.paused) return "paused";
  if (queue.failed > 0) return "degraded";
  if (queue.waiting > 1000) return "backlogged";
  return "healthy";
}
```

- [ ] **Task 2: 发布 checklist 可执行化**

Modify `docs/operations/production_release_checklist.md` so each item has owner, evidence, and command:

```md
- [ ] `pnpm lint`
  - Owner: release driver
  - Evidence: CI run URL or local command output timestamp
  - Command: `pnpm lint`
```

- [ ] **Task 3: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- worker-health.integration-spec.ts
pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts
pnpm lint
pnpm test
pnpm build
```

Expected: API exposes queue health, failed queues raise Sentry events, release checklist records evidence, and production release cannot be marked ready without staging smoke.

### Phase 14: 世界包 CLI、个人访问令牌和轻量生态

**Files:**
- Create: `packages/domain/src/developer-access/index.ts`
- Create: `apps/api/src/modules/developer-access/developer-access.controller.ts`
- Create: `apps/api/src/modules/developer-access/developer-access.module.ts`
- Create: `packages/worlddock-cli/package.json`
- Create: `packages/worlddock-cli/src/main.ts`
- Create: `docs/product/api.md`
- Test: `apps/api/test/public-api.integration-spec.ts`
- Test: `packages/worlddock-cli/test/cli.test.ts`

- [ ] **Task 1: 定义个人访问令牌 scope**

Personal access token scopes:

```txt
world:read
world:write
repository:read
billing:read
```

- [ ] **Task 2: CLI 最小能力**

CLI commands:

```txt
worlddock login
worlddock worlds list
worlddock worlds export world_123
worlddock worlds import ./memory-market.worlddock.json
worlddock repositories pull ren/memory-market
```

- [ ] **Task 3: Run verification**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- public-api.integration-spec.ts
pnpm --filter @worlddock-cli test
pnpm lint
pnpm test
pnpm build
```

Expected: personal access tokens obey scopes, CLI can export/import cloud world packages, and repository pull works without any local deployment dependency.

---

## Post-Cloud Independent Local Plan

本地部署版不属于云端 Alpha 的完成条件。云端 Alpha 达到 Alpha Readiness 后，再创建独立计划：

```txt
docs/superpowers/plans/YYYY-MM-DD-local-deployment-product.md
```

独立计划再覆盖以下范围：

- Docker Compose 本地初始化和本地健康检查。
- 本地数据库、对象存储目录和离线世界草稿。
- 本地模型 provider 配置、连接测试和密钥只留本地的保证。
- 世界包 import/export 格式和兼容性测试。
- Cloud PAT 连接、权限 scope、撤销和审计。
- Local Push 公开快照预览、隐私检查和 no-secret 上传保证。
- Local/Cloud 冲突、Pull、回滚和失败恢复。

在云端 Alpha 前，不新增 Local setup 页面、Local Push API、Local 模型设置页或本地部署阻塞项。

---

## Beta Deferred Scope

以下能力明确不属于 Alpha 测试目标，进入 Beta 计划：

- 真实支付：Stripe checkout、customer portal、webhook、订阅、发票、支付失败处理。
- 邮件能力：邮箱注册验证、密码找回邮件、欢迎邮件、低余额邮件、发布成功邮件、审核通知邮件。
- 管理后台：举报队列、用户管理、仓库管理、审核动作、审计日志 UI、管理员角色管理。
- 模板库：模板列表、模板详情、模板驱动 onboarding、官方类型模板、社区提交模板。

Beta 计划应在 Alpha 测试完成后另写细化执行文档，不回填到本 Alpha 主路径。

---

## Alpha Readiness Definition

WorldDock 个人创作者产品可以进入 Alpha 测试，当且仅当以下条件全部满足：

- 用户可以注册、登录、完成 onboarding、创建第一个世界。
- 世界、档案、种子、冲突、Agent 建议全部云端持久化。
- pi runtime 可用，`AI_PROVIDER=mock` 在 production 被拒绝，`AI_PROVIDER=pi` 在 production 必须配置 `PI_MODEL_PROVIDER`、`PI_MODEL_ID` 和 `PI_PROVIDER_API_KEY`。
- Agent Run 使用真实 price book 结算，并写入可解释账本。
- 账单页显示创作点余额、用量账本和支付 UI 占位；不存在真实 Stripe checkout、webhook 或订阅状态同步。
- 用户可以发布世界、查看 release diff、Fork、回滚、同步上游。
- Explore 使用真实 API、分页搜索和完整 repository detail。
- 用户可以提交举报，团队可以通过 Alpha 人工治理 runbook 处理明显问题；不存在管理后台。
- 产品内有站内通知、活动流和 Alpha 反馈入口；不存在邮件通知或邮箱注册验证。
- 官网和定价页表达 Alpha 测试状态；不存在模板库。
- CI/CD、Docker 镜像、staging、生产 env、Sentry/OTel、Worker 告警可用。
- 生产发布 checklist 每项都有命令或外部证据。
- 数据备份和恢复演练完成，并记录 checksum、耗时和抽样校验结果。
- 本地部署版不是 Cloud Alpha 阻塞项；只需要保留清晰的后续独立计划入口。

## Execution Order

Recommended sequence:

```txt
1. Phase 1  生产工程闸门和环境基线
2. Phase 2  个人账户认证、账户和 Onboarding
3. Phase 3  云端部署版范围冻结和 Cloud-only 主路径
4. Phase 4  云端世界 CRUD 和资产编辑器
5. Phase 5  基于 pi 的 Agent Session、工具和长世界记忆
6. Phase 7  真实模型、创作点账本和支付 UI 占位
7. Phase 6  版本、发布、回滚和 Fork 同步
8. Phase 8  社区发现、创作者主页和完整 repository detail
9. Phase 9  Alpha 举报、人工治理 Runbook 和反滥用
10. Phase 10 文件、导入导出和数据权利
11. Phase 11 站内通知、活动流和 Alpha 反馈入口
12. Phase 13 可观测性、Worker 运维和生产发布闭环
13. Phase 12 产品分析、官网和 Alpha 申请/反馈
14. Phase 14 世界包 CLI、个人访问令牌和轻量生态
```

Phase 6 和 Phase 7 都属于 Alpha 的核心路径。推荐先完成 Phase 7，因为 release、Fork 和 Agent 行为需要 entitlement、余额和套餐占位边界。

## Self-Review

Spec coverage:

- 个人创作者获客和定价：Phase 12。
- 登录注册和账户生命周期：Phase 2。
- 云端部署版范围冻结和 Cloud-only 主路径：Phase 3。
- 云端创作核心：Phase 4 和 Phase 5。
- 基于 pi 的 Agent Session、工具调用、Skill、安全门和事件适配：Phase 5。
- 版本发布和 Fork：Phase 6。
- 模型、创作点账本和支付 UI 占位：Phase 7。
- 社区发现和创作者主页：Phase 8。
- Alpha 举报、人工治理 runbook 和反滥用：Phase 9。
- 文件、导入导出和数据权利：Phase 10。
- 站内通知、Alpha 反馈和活动流：Phase 11。
- 生产运维和发布闭环：Phase 1 和 Phase 13。
- 世界包 CLI、个人访问令牌和轻量生态：Phase 14。
- 真实支付、邮件通知、邮箱注册验证、管理后台、模板库：Beta Deferred Scope。
- 本地部署、Local 模型配置、PAT 连接和 Local Push：云端 Alpha 后另写独立计划，不属于本计划 Alpha Readiness。

Red-flag scan:

- 本计划没有未展开的执行标记。
- 本计划没有只描述方向、不说明文件和验收命令的执行步骤。
- 每个 Phase 都有明确文件、API、测试命令和验收结果。

Type consistency:

- Personal access token scope 在 `packages/domain/src/developer-access/index.ts` 和 `packages/domain/src/world-package/index.ts` 定义。
- Pi runtime event 和 tool call 在 `packages/domain/src/agent/pi.ts` 定义。
- Billing price book 使用 provider/model/token usage 计算成本。
- Release diff 使用 asset-level change schema。
- Notification type 与站内通知事件一一对应；邮件事件不进入 Alpha。
