# Phase 1: 生产工程闸门和环境基线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 WorldDock Cloud Alpha 的生产工程闸门、生产环境强校验、容器镜像入口和基础事故响应文档。

**Architecture:** Phase 1 只建立可验证的工程基线，不改业务产品流。CI 使用 monorepo 根命令串联 Prisma、lint、unit、build、API integration 和 Web e2e；生产配置门禁收敛在 `@worlddock/config`；容器入口分别落在 API、Web、Worker 三个 app 内，保持现有包边界。

**Tech Stack:** GitHub Actions、pnpm 10.33.0、Node.js 24、Next.js、NestJS、Prisma、Vitest、Playwright、Docker、Zod、Sentry。

---

## Source

- 主计划：`docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- 缺口记录：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

## Scope

- 增加根级 CI 工作流和可复用验证脚本。
- 移除 Web 生产环境的静态导出假设，让后续认证路由和服务端能力可用。
- 强化 `@worlddock/config` 的生产环境校验：强 auth secret、`BETTER_AUTH_URL`、Sentry、真实模型配置。
- 增加 API、Web、Worker 的 Dockerfile。
- 增加事故响应和队列运维 runbook。
- 将生产发布 checklist 改为 owner、command、evidence、status 结构。
- 留下可复跑的 Phase 1 验收命令和提交证据要求。

## Non-Goals

- 不接入真实云厂商部署。
- 不重构 Agent provider 架构；当前仓库仍以 `AI_PROVIDER=openai` 作为真实 provider，Phase 5 再切换 pi session 架构。
- 不新增业务 API、不改认证产品 UI、不做 Worker 队列可视化页面。
- 不改 Prisma schema。

## Current Baseline

- `.github/workflows/ci.yml` 不存在。
- `apps/api/Dockerfile`、`apps/web/Dockerfile`、`apps/worker/Dockerfile` 不存在。
- `apps/web/next.config.ts` 在非开发环境设置 `output: "export"` 和 `assetPrefix: "."`。
- `packages/config/src/env.ts` 只要求 `BETTER_AUTH_SECRET` 至少 16 位，缺少 `BETTER_AUTH_URL` schema 和 production-only gates。
- `docs/operations/production_release_checklist.md` 是普通 checklist，缺少 owner、command、evidence 字段。
- `apps/api/test/system.integration-spec.ts` 已覆盖 health/readiness/metrics，可作为最终 API integration 验收的一部分。

## Files

- Create: `.github/workflows/ci.yml`
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/worker/Dockerfile`
- Create: `.dockerignore`
- Create: `docs/operations/incident_runbook.md`
- Create: `docs/operations/queue_runbook.md`
- Create: `apps/web/src/config/next-config.test.ts`
- Modify: `package.json`
- Modify: `apps/web/next.config.ts`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/test/env.test.ts`
- Modify: `docs/operations/production_release_checklist.md`
- Modify after all checks pass: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- Test: `apps/api/test/system.integration-spec.ts`

## Execution Rules

- 每个 Task 的提交步骤前运行：

```bash
git config user.name
git config user.email
```

- 如果输出包含真实姓名或个人邮箱，先在当前仓库设置匿名提交身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

- 每次提交后立即检查最近一次提交身份：

```bash
git log -1 --format=fuller
```

- 只有 Author 和 Committer 都不包含真实姓名或个人邮箱时，才把该 Task 视为已提交完成。

---

## Task 1: 增加根级 CI 工作流和验证脚本

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] **Step 1: Run failing CI contract check**

Run:

```bash
node -e 'const fs = require("node:fs"); const pkg = require("./package.json"); if (!pkg.scripts?.verify) throw new Error("missing package script: verify"); if (!pkg.scripts?.["verify:ci"]) throw new Error("missing package script: verify:ci"); if (!fs.existsSync(".github/workflows/ci.yml")) throw new Error("missing .github/workflows/ci.yml");'
```

Expected: FAIL with `missing package script: verify` or `missing .github/workflows/ci.yml`.

- [ ] **Step 2: Add root verification scripts**

Modify `package.json` so the `scripts` object contains these entries while preserving the existing scripts:

```json
{
  "scripts": {
    "dev": "pnpm --filter @worlddock/web dev",
    "build": "pnpm -r --if-present build",
    "start": "pnpm --filter @worlddock/web start",
    "lint": "pnpm -r --if-present lint",
    "test": "pnpm -r --if-present test",
    "test:e2e": "pnpm --filter @worlddock/web test:e2e",
    "verify": "pnpm --filter @worlddock/db prisma:validate && pnpm lint && pnpm test && pnpm build",
    "verify:ci": "pnpm --filter @worlddock/db prisma:generate && pnpm --filter @worlddock/db prisma:validate && pnpm lint && pnpm test && pnpm build && pnpm --filter @worlddock/api test:integration && pnpm --filter @worlddock/web test:e2e",
    "web:dev": "pnpm --filter @worlddock/web dev",
    "web:build": "pnpm --filter @worlddock/web build",
    "web:test": "pnpm --filter @worlddock/web test",
    "web:lint": "pnpm --filter @worlddock/web lint"
  }
}
```

- [ ] **Step 3: Create GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  pull_request:
  push:
    branches:
      - main

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 35
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.33.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright Chromium
        run: pnpm --filter @worlddock/web exec playwright install --with-deps chromium

      - name: Verify monorepo
        run: pnpm verify:ci
```

- [ ] **Step 4: Re-run CI contract check**

Run:

```bash
node -e 'const fs = require("node:fs"); const pkg = require("./package.json"); if (!pkg.scripts?.verify) throw new Error("missing package script: verify"); if (!pkg.scripts?.["verify:ci"]) throw new Error("missing package script: verify:ci"); const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8"); for (const token of ["pnpm install --frozen-lockfile", "playwright install --with-deps chromium", "pnpm verify:ci"]) { if (!workflow.includes(token)) throw new Error(`missing CI token: ${token}`); }'
```

Expected: PASS with no output.

- [ ] **Step 5: Run fast local script validation**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
```

Expected: PASS; Prisma schema validates without a database connection.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add package.json .github/workflows/ci.yml
git commit -m "ci: add production verification workflow"
git log -1 --format=fuller
```

Expected: commit succeeds, and Author/Committer do not contain real personal identity.

---

## Task 2: 移除 Web 生产静态导出假设

**Files:**
- Create: `apps/web/src/config/next-config.test.ts`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Write failing test for production Next config**

Create `apps/web/src/config/next-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next production config", () => {
  it("does not force static export in production builds", () => {
    expect(nextConfig).not.toHaveProperty("output", "export");
  });

  it("does not rewrite asset paths for file-system static export", () => {
    expect(nextConfig).not.toHaveProperty("assetPrefix", ".");
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
pnpm --filter @worlddock/web test -- src/config/next-config.test.ts
```

Expected: FAIL because current `next.config.ts` sets `output: "export"` and `assetPrefix: "."` outside development.

- [ ] **Step 3: Replace Next config**

Replace `apps/web/next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@worlddock/domain"],
};

export default nextConfig;
```

- [ ] **Step 4: Run test and confirm pass**

Run:

```bash
pnpm --filter @worlddock/web test -- src/config/next-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify Web build still works in server mode**

Run:

```bash
pnpm --filter @worlddock/web build
```

Expected: PASS; `.next` build output is produced without static export mode.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add apps/web/next.config.ts apps/web/src/config/next-config.test.ts
git commit -m "fix(web): use server-capable production build"
git log -1 --format=fuller
```

Expected: commit succeeds, and Author/Committer do not contain real personal identity.

---

## Task 3: 强化生产环境校验

**Files:**
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/test/env.test.ts`

- [ ] **Step 1: Replace env tests with production gate coverage**

Replace `packages/config/test/env.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { parseWorldDockEnv, runtimeEnvironmentSchema } from "../src";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    APP_ENV: "development",
    API_PORT: "4000",
    WEB_APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://worlddock:worlddock@localhost:5432/worlddock",
    REDIS_URL: "redis://localhost:6379",
    MEILISEARCH_HOST: "http://localhost:7700",
    S3_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "worlddock-local",
    BETTER_AUTH_SECRET: "test_secret_at_least_32_characters",
    BETTER_AUTH_URL: "http://localhost:4000",
    ...overrides,
  };
}

describe("@worlddock/config env", () => {
  it("accepts supported runtime environments", () => {
    expect(runtimeEnvironmentSchema.parse("development")).toBe("development");
    expect(runtimeEnvironmentSchema.parse("staging")).toBe("staging");
    expect(runtimeEnvironmentSchema.parse("production")).toBe("production");
  });

  it("parses the minimal backend environment shared by API and worker", () => {
    expect(parseWorldDockEnv(baseEnv()).API_PORT).toBe(4000);
  });

  it("requires a 32 character Better Auth secret", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({ BETTER_AUTH_SECRET: "short_secret_16" })),
    ).toThrow();
  });

  it("requires a Better Auth base URL", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({ BETTER_AUTH_URL: undefined })),
    ).toThrow();
  });

  it("defaults the agent provider to the real OpenAI provider", () => {
    expect(parseWorldDockEnv(baseEnv()).AI_PROVIDER).toBe("openai");
  });

  it("rejects the disabled mock agent provider", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({ AI_PROVIDER: "mock" })),
    ).toThrow();
  });

  it("normalizes blank optional AI secrets so non-agent workers can parse copied env files", () => {
    const parsed = parseWorldDockEnv(
      baseEnv({
        AI_MODEL: "",
        OPENAI_API_KEY: "",
        OPENAI_BASE_URL: "",
      }),
    );

    expect(parsed.AI_MODEL).toBeUndefined();
    expect(parsed.OPENAI_API_KEY).toBeUndefined();
    expect(parsed.OPENAI_BASE_URL).toBeUndefined();
  });

  it("rejects malformed dependency URLs", () => {
    expect(() =>
      parseWorldDockEnv(baseEnv({ WEB_APP_URL: "not-a-url" })),
    ).toThrow();
  });

  it("rejects production without Sentry", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          AI_MODEL: "gpt-5-mini",
          OPENAI_API_KEY: "sk-test",
        }),
      ),
    ).toThrow(/SENTRY_DSN/);
  });

  it("rejects production without OpenAI model configuration", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
          OPENAI_API_KEY: "sk-test",
        }),
      ),
    ).toThrow(/AI_MODEL/);
  });

  it("rejects production without OpenAI API credentials", () => {
    expect(() =>
      parseWorldDockEnv(
        baseEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
          AI_MODEL: "gpt-5-mini",
        }),
      ),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("accepts production with release-critical secrets and real model configuration", () => {
    const parsed = parseWorldDockEnv(
      baseEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
        AI_MODEL: "gpt-5-mini",
        OPENAI_API_KEY: "sk-test",
      }),
    );

    expect(parsed.APP_ENV).toBe("production");
    expect(parsed.BETTER_AUTH_URL).toBe("http://localhost:4000");
    expect(parsed.AI_PROVIDER).toBe("openai");
  });
});
```

- [ ] **Step 2: Run env tests and confirm failure**

Run:

```bash
pnpm --filter @worlddock/config test -- env.test.ts
```

Expected: FAIL because `BETTER_AUTH_SECRET` still allows 16 characters, `BETTER_AUTH_URL` is not in the schema, and production-only checks are missing.

- [ ] **Step 3: Replace env schema implementation**

Replace `packages/config/src/env.ts` with:

```ts
import { z } from "zod";

export const runtimeEnvironmentSchema = z.enum([
  "development",
  "test",
  "staging",
  "production",
]);

export const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);

const optionalNonEmptyString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);
const optionalUrlString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().url().optional(),
);

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
  AI_PROVIDER: z.enum(["openai"]).default("openai"),
  AI_MODEL: optionalNonEmptyString,
  OPENAI_BASE_URL: optionalUrlString,
  OPENAI_API_KEY: optionalNonEmptyString,
});

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WorldDockEnv = z.infer<typeof worldDockEnvSchema>;

export function parseWorldDockEnv(env: Record<string, string | undefined>): WorldDockEnv {
  const parsed = worldDockEnvSchema.parse(env);

  if (parsed.APP_ENV !== "production") {
    return parsed;
  }

  if (!parsed.SENTRY_DSN) {
    throw new Error("SENTRY_DSN is required in production.");
  }

  if (!parsed.AI_MODEL) {
    throw new Error("AI_MODEL is required when AI_PROVIDER=openai in production.");
  }

  if (!parsed.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai in production.");
  }

  return parsed;
}
```

- [ ] **Step 4: Run env tests and confirm pass**

Run:

```bash
pnpm --filter @worlddock/config test -- env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run API and Worker type checks that consume config**

Run:

```bash
pnpm --filter @worlddock/api lint
pnpm --filter @worlddock/worker lint
```

Expected: PASS; added `BETTER_AUTH_URL` type is exported through `@worlddock/config` without breaking consumers.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add packages/config/src/env.ts packages/config/test/env.test.ts
git commit -m "fix(config): enforce production environment gates"
git log -1 --format=fuller
```

Expected: commit succeeds, and Author/Committer do not contain real personal identity.

---

## Task 4: 增加 Docker 镜像入口

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/worker/Dockerfile`

- [ ] **Step 1: Run failing Dockerfile presence check**

Run:

```bash
node -e 'const fs = require("node:fs"); for (const file of ["apps/api/Dockerfile", "apps/web/Dockerfile", "apps/worker/Dockerfile"]) { if (!fs.existsSync(file)) throw new Error(`missing ${file}`); }'
```

Expected: FAIL with `missing apps/api/Dockerfile`.

- [ ] **Step 2: Create API Dockerfile**

Create `apps/api/Dockerfile`:

```dockerfile
FROM node:24-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @worlddock/db prisma:generate
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 4000
CMD ["pnpm", "--filter", "@worlddock/api", "exec", "tsx", "src/main.ts"]
```

- [ ] **Step 3: Create Web Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:24-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @worlddock/db prisma:generate
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@worlddock/web", "exec", "next", "start"]
```

- [ ] **Step 4: Create Worker Dockerfile**

Create `apps/worker/Dockerfile`:

```dockerfile
FROM node:24-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @worlddock/db prisma:generate
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["pnpm", "--filter", "@worlddock/worker", "exec", "tsx", "src/main.ts"]
```

- [ ] **Step 5: Run Dockerfile content check**

Run:

```bash
node -e 'const fs = require("node:fs"); const expectations = new Map([["apps/api/Dockerfile", ["@worlddock/api", "corepack prepare pnpm@10.33.0 --activate", "tsx", "CMD"]], ["apps/web/Dockerfile", ["@worlddock/web", "corepack prepare pnpm@10.33.0 --activate", "next", "CMD"]], ["apps/worker/Dockerfile", ["@worlddock/worker", "corepack prepare pnpm@10.33.0 --activate", "tsx", "CMD"]]]); for (const [file, tokens] of expectations) { const text = fs.readFileSync(file, "utf8"); for (const token of ["node:24-alpine", "pnpm install --frozen-lockfile", "pnpm build", ...tokens]) { if (!text.includes(token)) throw new Error(`${file} missing ${token}`); } } if (!fs.existsSync(".dockerignore")) throw new Error("missing .dockerignore"); const ignore = fs.readFileSync(".dockerignore", "utf8"); for (const token of ["node_modules", "**/node_modules", "**/.next", "**/dist", "!.env.example"]) { if (!ignore.includes(token)) throw new Error(`.dockerignore missing ${token}`); }'
```

Expected: PASS with no output.

- [ ] **Step 6: Build images locally**

Run:

```bash
docker build -f apps/api/Dockerfile -t worlddock-api:phase1 .
docker build -f apps/web/Dockerfile -t worlddock-web:phase1 .
docker build -f apps/worker/Dockerfile -t worlddock-worker:phase1 .
```

Expected: all three Docker builds succeed.

- [ ] **Step 7: Commit**

Run:

```bash
git status --short
git add apps/api/Dockerfile apps/web/Dockerfile apps/worker/Dockerfile .dockerignore docs/superpowers/plans/2026-05-28-phase-1-production-engineering.md
git commit -m "build: add production Docker entrypoints"
git log -1 --format=fuller
```

Expected: commit succeeds, and Author/Committer do not contain real personal identity.

---

## Task 5: 增加运维 Runbook 和可执行发布 Checklist

**Files:**
- Create: `docs/operations/incident_runbook.md`
- Create: `docs/operations/queue_runbook.md`
- Modify: `docs/operations/production_release_checklist.md`

- [ ] **Step 1: Run failing operations docs contract check**

Run:

```bash
node -e 'const fs = require("node:fs"); for (const file of ["docs/operations/incident_runbook.md", "docs/operations/queue_runbook.md"]) { if (!fs.existsSync(file)) throw new Error(`missing ${file}`); } const checklist = fs.readFileSync("docs/operations/production_release_checklist.md", "utf8"); for (const token of ["Owner", "Command", "Evidence"]) { if (!checklist.includes(token)) throw new Error(`release checklist missing ${token}`); }'
```

Expected: FAIL with missing runbook or missing checklist structure.

- [ ] **Step 2: Create incident runbook**

Create `docs/operations/incident_runbook.md`:

```md
# Alpha 事故响应 Runbook

## 目标

为 WorldDock Cloud Alpha 提供统一事故分级、响应角色、沟通节奏和恢复确认流程。生产事故处理优先级高于功能开发。

## 事故分级

| Severity | 用户影响 | 示例 | 首次响应目标 |
| --- | --- | --- | --- |
| SEV1 | 多数用户无法登录、创作、发布或访问社区 | API 全站 5xx、数据库不可用、认证全面失败 | 10 分钟内确认负责人 |
| SEV2 | 核心功能部分不可用或数据写入延迟 | Agent Run 大量失败、发布队列积压、对象存储签名失败 | 30 分钟内确认负责人 |
| SEV3 | 非核心功能退化或少量用户受影响 | Explore 搜索延迟、单个 Worker job 重试、指标缺口 | 1 个工作日内确认负责人 |

## 角色

| Role | Responsibility |
| --- | --- |
| Incident Commander | 定级、分派、决定回滚或降级 |
| API Owner | 检查 API health、readiness、error logs 和最近部署 |
| Web Owner | 检查 Web build、路由、认证入口和浏览器报错 |
| Worker Owner | 检查队列积压、失败 job、重试和死信 |
| Comms Owner | 记录时间线、用户影响、恢复时间和后续行动 |

## 首次 15 分钟流程

1. 确认影响面：API、Web、Worker、数据库、Redis、Meilisearch、S3-compatible storage。
2. 打开最新部署、CI run、Sentry issue、日志查询和队列状态。
3. 运行只读健康检查：

```bash
curl -fsS "$API_BASE_URL/v1/system/health"
curl -fsS "$API_BASE_URL/v1/system/readiness"
curl -fsS "$API_BASE_URL/v1/system/metrics"
```

4. 如果新版本引入核心功能不可用，Incident Commander 决定回滚到最近健康版本。
5. Comms Owner 记录事故开始时间、影响功能、当前处置人和下一次更新时间。

## 恢复确认

恢复前必须完成：

- `GET /v1/system/health` 返回 200。
- `GET /v1/system/readiness` 返回 200，关键依赖状态为 `ok`。
- 最新 Web 版本可打开创作首页。
- Worker 没有持续增长的失败 job。
- Sentry 没有同类错误继续快速增长。

## 事后复盘

事故结束后 2 个工作日内补齐：

- 用户影响窗口。
- 根因。
- 检测方式。
- 恢复动作。
- 防复发行动项和负责人。
```

- [ ] **Step 3: Create queue runbook**

Create `docs/operations/queue_runbook.md`:

```md
# Worker 队列 Runbook

## 目标

定义 WorldDock Alpha Worker 队列的日常检查、积压处理、失败 job 处理和发布前确认流程。

## 队列范围

| Queue | Producer | Worker Responsibility | 用户影响 |
| --- | --- | --- | --- |
| search-indexing | API repository publish/update | 同步公开仓库到搜索索引 | Explore 搜索结果延迟或缺失 |
| moderation-scan | API publish/report/storage flows | 扫描公开内容和对象元数据 | 发布审核延迟或误放行 |
| storage-cleanup | API object lifecycle | 清理废弃对象 | 存储成本增长 |

## 发布前检查

```bash
pnpm --filter @worlddock/worker lint
pnpm --filter @worlddock/worker test
pnpm --filter @worlddock/worker build
```

Expected:

- TypeScript 编译通过。
- Worker 单元测试通过。
- `pnpm --filter @worlddock/worker exec tsx src/main.ts` 是 Docker CMD 使用的运行入口。

## 积压处理

1. 查看队列等待数、活跃数、失败数和最老 job 创建时间。
2. 如果等待数持续增长，先确认 Redis 连接和 Worker 实例数量。
3. 如果活跃数不下降，检查 Worker 日志中的同一 job 是否长时间运行。
4. 如果失败数增长，按失败 reason 分组，先处理数量最大的错误。
5. 修复后优先重试幂等 job；对非幂等 job 先确认不会重复写入用户可见状态。

## 失败 job 处理

| Failure | First Check | Recovery |
| --- | --- | --- |
| Redis connection refused | `REDIS_URL`、网络、Redis 实例状态 | 恢复 Redis 后重启 Worker |
| Meilisearch unavailable | `MEILISEARCH_HOST`、API key、健康检查 | 恢复 search 后重试 search-indexing job |
| S3 signer/storage error | `S3_ENDPOINT`、bucket、credentials | 恢复 storage 后重试 storage-cleanup job |
| moderation rule error | 最近规则变更和输入 payload | 修正规则后重试 moderation-scan job |

## 升级条件

- 队列最老 job 超过 30 分钟仍未处理。
- 同类失败 job 在 10 分钟内超过 20 个。
- 发布、搜索或举报流程出现用户可见数据延迟。
- Worker 重启后 5 分钟内失败数继续增长。

升级后按 `docs/operations/incident_runbook.md` 定级处理。
```

- [ ] **Step 4: Replace production release checklist**

Replace `docs/operations/production_release_checklist.md` with:

```md
# 生产发布 Checklist

每次生产发布复制本表，填写 Evidence 后再执行发布。Evidence 必须是 CI run URL、命令输出摘要、监控截图路径或工单链接中的一种。

| Gate | Owner | Command | Evidence | Status |
| --- | --- | --- | --- | --- |
| Prisma schema validate | Release owner | `pnpm --filter @worlddock/db prisma:validate` | 记录命令输出或 CI step URL | [ ] |
| Lint | Release owner | `pnpm lint` | 记录命令输出或 CI step URL | [ ] |
| Unit tests | Release owner | `pnpm test` | 记录命令输出或 CI step URL | [ ] |
| Build | Release owner | `pnpm build` | 记录命令输出或 CI step URL | [ ] |
| API integration | API owner | `pnpm --filter @worlddock/api test:integration` | 记录命令输出或 CI step URL | [ ] |
| Web e2e | Web owner | `pnpm --filter @worlddock/web test:e2e` | 记录命令输出或 CI step URL | [ ] |
| API Docker image | API owner | `docker build -f apps/api/Dockerfile -t worlddock-api:release .` | 记录镜像 tag 或 registry digest | [ ] |
| Web Docker image | Web owner | `docker build -f apps/web/Dockerfile -t worlddock-web:release .` | 记录镜像 tag 或 registry digest | [ ] |
| Worker Docker image | Worker owner | `docker build -f apps/worker/Dockerfile -t worlddock-worker:release .` | 记录镜像 tag 或 registry digest | [ ] |
| Database backup | Release owner | `docs/operations/database_backup_restore.md` | 记录 backup id 和 checksum | [ ] |
| Migration staging deploy | API owner | `pnpm --filter @worlddock/db prisma:migrate:deploy` | 记录 staging migration 输出 | [ ] |
| Staging smoke | Release owner | 创作、Agent、发布、搜索、Fork、举报、对象存储 signed URL | 记录 smoke 账号、时间和结果 | [ ] |
| Production env secrets | Release owner | 检查 `SENTRY_DSN`、`BETTER_AUTH_URL`、`BETTER_AUTH_SECRET`、`TRUSTED_ORIGINS`、`AI_PROVIDER`、`AI_MODEL`、`OPENAI_API_KEY` | 记录 secret manager 版本号 | [ ] |
| Worker queue visibility | Worker owner | 按 `docs/operations/queue_runbook.md` 检查等待数、活跃数、失败数 | 记录队列截图或查询结果 | [ ] |
| Incident coverage | Incident Commander | 按 `docs/operations/incident_runbook.md` 确认值守人和升级渠道 | 记录值守人和观察窗口 | [ ] |
| Post-release observation | Release owner | 发布后 30 分钟观察 API、Web、Worker、Sentry | 记录观察开始和结束时间 | [ ] |
```

- [ ] **Step 5: Re-run operations docs contract check**

Run:

```bash
node -e 'const fs = require("node:fs"); for (const file of ["docs/operations/incident_runbook.md", "docs/operations/queue_runbook.md"]) { const text = fs.readFileSync(file, "utf8"); if (!text.includes("# ")) throw new Error(`${file} missing title`); } const checklist = fs.readFileSync("docs/operations/production_release_checklist.md", "utf8"); for (const token of ["Owner", "Command", "Evidence", "docker build -f apps/api/Dockerfile", "docs/operations/incident_runbook.md", "docs/operations/queue_runbook.md"]) { if (!checklist.includes(token)) throw new Error(`release checklist missing ${token}`); }'
```

Expected: PASS with no output.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git add docs/operations/incident_runbook.md docs/operations/queue_runbook.md docs/operations/production_release_checklist.md
git commit -m "docs: add alpha production operations runbooks"
git log -1 --format=fuller
```

Expected: commit succeeds, and Author/Committer do not contain real personal identity.

---

## Task 6: Phase 1 完整验收和主计划更新

**Files:**
- Modify: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- Read: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [ ] **Step 1: Run full local verification**

Run:

```bash
pnpm verify
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/web test:e2e
```

Expected: all commands pass.

- [ ] **Step 2: Rebuild Docker images after final code state**

Run:

```bash
docker build -f apps/api/Dockerfile -t worlddock-api:phase1-final .
docker build -f apps/web/Dockerfile -t worlddock-web:phase1-final .
docker build -f apps/worker/Dockerfile -t worlddock-worker:phase1-final .
```

Expected: all three Docker builds pass from a clean monorepo root context.

- [ ] **Step 3: Verify Phase 1 missing-task list is closed**

Run:

```bash
node -e 'const fs = require("node:fs"); const requiredFiles = [".github/workflows/ci.yml", "apps/api/Dockerfile", "apps/web/Dockerfile", "apps/worker/Dockerfile", "docs/operations/incident_runbook.md", "docs/operations/queue_runbook.md"]; for (const file of requiredFiles) { if (!fs.existsSync(file)) throw new Error(`missing ${file}`); } const nextConfig = fs.readFileSync("apps/web/next.config.ts", "utf8"); if (nextConfig.includes("output: \"export\"") || nextConfig.includes("assetPrefix: \".\"")) throw new Error("next config still assumes static export"); const env = fs.readFileSync("packages/config/src/env.ts", "utf8"); for (const token of ["BETTER_AUTH_SECRET: z.string().min(32)", "BETTER_AUTH_URL: z.string().url()", "SENTRY_DSN is required in production", "OPENAI_API_KEY is required when AI_PROVIDER=openai in production"]) { if (!env.includes(token)) throw new Error(`env gate missing ${token}`); } const checklist = fs.readFileSync("docs/operations/production_release_checklist.md", "utf8"); for (const token of ["Owner", "Evidence", "Command"]) { if (!checklist.includes(token)) throw new Error(`checklist missing ${token}`); }'
```

Expected: PASS with no output.

- [ ] **Step 4: Update main plan Phase 1 checkboxes**

After Steps 1-3 pass, modify only the Phase 1 task checkbox lines in `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`:

```md
- [x] **Task 1: 增加 CI 工作流**
- [x] **Task 2: 移除生产静态导出假设**
- [x] **Task 3: 强化环境校验**
- [x] **Task 4: 增加 Docker 镜像入口**
- [x] **Task 5: Run verification**
```

- [ ] **Step 5: Record final status**

Run:

```bash
git status --short
git diff -- docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md
```

Expected: diff only changes Phase 1 task checkboxes from `[ ]` to `[x]`.

- [ ] **Step 6: Commit final Phase 1 evidence**

Run:

```bash
git add docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md
git commit -m "docs: mark phase 1 production baseline complete"
git log -1 --format=fuller
```

Expected: commit succeeds, and Author/Committer do not contain real personal identity.

---

## Phase 1 Completion Criteria

Phase 1 is complete only when all of these are true:

- `.github/workflows/ci.yml` exists and runs `pnpm verify:ci`.
- Root `package.json` has `verify` and `verify:ci`.
- `apps/web/next.config.ts` no longer sets static export output or file asset prefix.
- `packages/config/src/env.ts` requires `BETTER_AUTH_SECRET` length 32, `BETTER_AUTH_URL`, production `SENTRY_DSN`, production `AI_MODEL`, and production `OPENAI_API_KEY`.
- API, Web, and Worker Dockerfiles build successfully.
- Incident and queue runbooks exist.
- Production release checklist has Owner, Command, Evidence, and Status fields.
- `pnpm verify`, `pnpm --filter @worlddock/api test:integration`, `pnpm --filter @worlddock/web test:e2e`, and all three Docker builds pass.
- Main Alpha plan Phase 1 checkboxes are marked complete after evidence exists.

## Staging Smoke

Run this after Phase 1 is merged into a staging deployment:

```bash
curl -fsS "$API_BASE_URL/v1/system/health"
curl -fsS "$API_BASE_URL/v1/system/readiness"
curl -fsS "$API_BASE_URL/v1/system/metrics"
```

Expected:

- Health returns `status: "ok"`.
- Readiness returns `status: "ready"`.
- Metrics returns process memory data and `service: "worlddock-api"`.

Then open the staging Web URL and confirm:

- Login or current auth entry route is reachable.
- WorldDock main app shell loads.
- No asset path starts with `./_next/` because static export mode is gone.

## Self-Review

- Spec coverage: Phase 1 missing items from the incomplete-task document are covered by Tasks 1-6.
- Placeholder scan: the plan uses concrete file paths, commands, code blocks, expected failures, expected passes, and commit messages.
- Type consistency: `BETTER_AUTH_URL`, `AI_PROVIDER`, `AI_MODEL`, `OPENAI_API_KEY`, and `SENTRY_DSN` names match current config and API provider code.
- Scope consistency: pi session config is intentionally left to Phase 5; Phase 1 enforces the current real OpenAI provider path.
