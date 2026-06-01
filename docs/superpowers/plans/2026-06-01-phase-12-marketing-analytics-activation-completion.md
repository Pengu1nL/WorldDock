# Phase 12 产品分析、官网和 Alpha 申请/反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 WorldDock Cloud Alpha 的公开官网、非支付定价、产品事件采集、Alpha 申请/反馈入口和产品政策文档，让 Phase 12 可以用测试和文档证据验收。

**Architecture:** 前端保留 Next App Router 的 `(marketing)` 路由，并把产品事件客户端收敛到 `apps/web/src/features/analytics/product-events.ts`。后端把 `/v1/analytics/events` 从内存数组升级为 Prisma 持久化仓储，事件名称由 `@worlddock/domain` 统一定义。Alpha 反馈继续复用 Phase 11 的站内反馈 API，公开营销页只做申请和反馈引导，不引入邮件、Stripe、模板库或管理后台。

**Tech Stack:** Next.js App Router、React、TypeScript、NestJS、Prisma/PostgreSQL、Zod、Vitest、Playwright、pnpm。

---

## 现状与缺口

- `apps/web/src/app/(marketing)/page.tsx`、`apps/web/src/app/(marketing)/pricing/page.tsx`、`apps/web/src/features/analytics/product-events.ts`、`apps/api/src/modules/analytics/*` 和 `apps/web/tests/e2e/marketing-and-activation.spec.ts` 已存在。
- 当前 analytics API 使用进程内数组，服务重启会丢失事件，且没有 API integration spec。
- 产品事件枚举只在 Web 包内定义，API 仍接受任意字符串，前后端事件名可能漂移。
- `SupportEntry` 已存在但没有接入任何页面；`alpha_feedback_submitted` 事件没有在真实反馈成功后记录。
- `docs/product/positioning.md`、`pricing.md`、`permissions.md`、`data-and-ip-policy.md` 和 `beta-template-library.md` 已存在但内容过薄，不能作为 Alpha 对外口径。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 仍把 Phase 12 标为未完成，最终执行完需要补验收证据。

## 文件结构

- Create: `packages/domain/src/analytics/index.ts`
  统一产品事件名称、事件输入 schema 和事件响应 schema。
- Modify: `packages/domain/src/index.ts`
  导出 analytics contract。
- Modify: `packages/db/prisma/schema.prisma`
  增加 `ProductAnalyticsEvent`，并在 `User` 上挂可选关系。
- Create: `packages/db/prisma/migrations/20260601090000_product_analytics_events/migration.sql`
  创建产品事件表和索引。
- Modify: `apps/api/src/modules/analytics/analytics.controller.ts`
  使用 domain schema 校验请求，记录 user agent。
- Modify: `apps/api/src/modules/analytics/analytics.service.ts`
  增加仓储接口、Prisma 仓储和响应 mapper。
- Modify: `apps/api/src/modules/analytics/analytics.module.ts`
  绑定 Prisma 仓储 provider。
- Create: `apps/api/test/analytics.integration-spec.ts`
  覆盖合法事件、上下文保留、未知事件拒绝。
- Modify: `apps/web/src/features/analytics/product-events.ts`
  复用 domain contract，生成匿名 ID，暴露可测试的 `sendProductEvent`。
- Modify: `apps/web/src/app/(marketing)/page.tsx`
  明确 Alpha 申请和反馈引导，不增加邮件或模板入口。
- Modify: `apps/web/src/app/(marketing)/pricing/page.tsx`
  强化非支付定价文案和候补事件。
- Modify: `apps/web/src/features/support/support-entry.tsx`
  反馈提交成功后记录 `alpha_feedback_submitted`。
- Modify: `apps/web/src/features/worlddock/view-settings.tsx`
  在设置页接入 `SupportEntry`，让已登录创作者可以提交 Alpha 反馈。
- Modify: `apps/web/tests/e2e/helpers.ts`
  让 App E2E mock 支持 support feedback 和 analytics events。
- Modify: `apps/web/tests/e2e/marketing-and-activation.spec.ts`
  覆盖营销页、定价页、无模板路由、候补事件和站内反馈事件。
- Modify: `docs/product/beta-template-library.md`
- Modify: `docs/product/positioning.md`
- Modify: `docs/product/pricing.md`
- Modify: `docs/product/permissions.md`
- Modify: `docs/product/data-and-ip-policy.md`
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  执行完成并通过验收后再把 Phase 12 标为完成。

## 提交身份检查

每个 commit step 前先运行：

```bash
git config user.name
git config user.email
```

如果输出包含真实姓名或个人邮箱，先在当前仓库设置通用身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

每个 commit step 后运行：

```bash
git log -1 --format=fuller
```

Expected: Author 和 Committer 都不包含真实姓名或个人邮箱。

### Task 1: 产品事件契约、持久化和 API 验证

**Files:**
- Create: `packages/domain/src/analytics/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260601090000_product_analytics_events/migration.sql`
- Modify: `apps/api/src/modules/analytics/analytics.controller.ts`
- Modify: `apps/api/src/modules/analytics/analytics.service.ts`
- Modify: `apps/api/src/modules/analytics/analytics.module.ts`
- Test: `apps/api/test/analytics.integration-spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/test/analytics.integration-spec.ts`:

```ts
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { configureApiApp } from "../src/configure-api-app";
import { AnalyticsModule } from "../src/modules/analytics/analytics.module";
import {
  ANALYTICS_REPOSITORY,
  type AnalyticsRepository,
  type ProductEventRecord,
} from "../src/modules/analytics/analytics.service";

describe("analytics endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("records allowlisted product events with context and request metadata", async () => {
    const analytics = createInMemoryAnalyticsRepository();
    app = await createTestApp(analytics);

    const response = await request(app.getHttpServer())
      .post("/v1/analytics/events")
      .set("user-agent", "phase12-test")
      .send({
        name: "billing_placeholder_clicked",
        context: { plan: "creator", source: "marketing_pricing" },
        anonymousId: "anon_phase12",
        route: "/pricing",
        occurredAt: "2026-06-01T01:00:00.000Z",
      })
      .expect(201);

    expect(response.body.event).toMatchObject({
      id: "event_1",
      name: "billing_placeholder_clicked",
      context: { plan: "creator", source: "marketing_pricing" },
      anonymousId: "anon_phase12",
      route: "/pricing",
      userAgent: "phase12-test",
      occurredAt: "2026-06-01T01:00:00.000Z",
    });
    expect(analytics.events[0].context).toEqual({ plan: "creator", source: "marketing_pricing" });
  });

  it("rejects unknown product event names", async () => {
    const analytics = createInMemoryAnalyticsRepository();
    app = await createTestApp(analytics);

    const response = await request(app.getHttpServer())
      .post("/v1/analytics/events")
      .send({ name: "stripe_checkout_started", context: {} })
      .expect(400);

    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(analytics.events).toHaveLength(0);
  });
});

async function createTestApp(analyticsRepository: AnalyticsRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [AnalyticsModule],
  })
    .overrideProvider(ANALYTICS_REPOSITORY)
    .useValue(analyticsRepository)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function createInMemoryAnalyticsRepository() {
  const events: ProductEventRecord[] = [];
  return {
    events,
    async createEvent(input) {
      const event: ProductEventRecord = {
        id: `event_${events.length + 1}`,
        createdAt: new Date("2026-06-01T01:00:01.000Z"),
        ...input,
      };
      events.push(event);
      return event;
    },
  } satisfies AnalyticsRepository & { events: ProductEventRecord[] };
}
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- analytics.integration-spec.ts
```

Expected: FAIL because `ANALYTICS_REPOSITORY` does not exist and API still accepts non-allowlisted names.

- [ ] **Step 3: Add shared product event contract**

Create `packages/domain/src/analytics/index.ts`:

```ts
import { z } from "zod";

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

export const productEventNameSchema = z.enum([
  PRODUCT_EVENTS.signedUp,
  PRODUCT_EVENTS.onboardingCompleted,
  PRODUCT_EVENTS.worldCreated,
  PRODUCT_EVENTS.agentRunStarted,
  PRODUCT_EVENTS.suggestionSaved,
  PRODUCT_EVENTS.worldPublished,
  PRODUCT_EVENTS.repositoryForked,
  PRODUCT_EVENTS.alphaFeedbackSubmitted,
  PRODUCT_EVENTS.billingPlaceholderClicked,
]);

export const productEventInputSchema = z.object({
  name: productEventNameSchema,
  context: z.record(z.string(), z.unknown()).default({}),
  anonymousId: z.string().min(8).max(128).optional(),
  route: z.string().min(1).max(240).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const productEventSchema = z.object({
  id: z.string().min(1),
  name: productEventNameSchema,
  context: z.record(z.string(), z.unknown()),
  anonymousId: z.string().nullable(),
  route: z.string().nullable(),
  userAgent: z.string().nullable(),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type ProductEventName = z.infer<typeof productEventNameSchema>;
export type ProductEventInput = z.infer<typeof productEventInputSchema>;
export type ProductEvent = z.infer<typeof productEventSchema>;
```

Modify `packages/domain/src/index.ts`:

```ts
export * from "./analytics";
export * from "./assets";
export * from "./agent";
export * from "./api";
export * from "./billing";
export * from "./developer-access";
export * from "./moderation";
export * from "./notifications";
export * from "./repository";
export * from "./releases";
export * from "./storage";
export * from "./world";
export * from "./worlds/world-package";
```

- [ ] **Step 4: Add Prisma model and migration**

Modify the `User` model in `packages/db/prisma/schema.prisma` by adding this relation:

```prisma
  productAnalyticsEvents ProductAnalyticsEvent[]
```

Add this model near `SupportFeedback`:

```prisma
model ProductAnalyticsEvent {
  id          String   @id @default(cuid())
  userId      String?
  name        String
  context     Json     @default("{}")
  anonymousId String?
  route       String?
  userAgent   String?
  occurredAt  DateTime @default(now())
  createdAt   DateTime @default(now())
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([name, occurredAt])
  @@index([anonymousId, occurredAt])
  @@index([userId, occurredAt])
  @@map("product_analytics_events")
}
```

Create `packages/db/prisma/migrations/20260601090000_product_analytics_events/migration.sql`:

```sql
CREATE TABLE "product_analytics_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "anonymousId" TEXT,
    "route" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_analytics_events_name_occurredAt_idx" ON "product_analytics_events"("name", "occurredAt");
CREATE INDEX "product_analytics_events_anonymousId_occurredAt_idx" ON "product_analytics_events"("anonymousId", "occurredAt");
CREATE INDEX "product_analytics_events_userId_occurredAt_idx" ON "product_analytics_events"("userId", "occurredAt");

ALTER TABLE "product_analytics_events"
ADD CONSTRAINT "product_analytics_events_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Implement analytics API repository and controller**

Replace `apps/api/src/modules/analytics/analytics.service.ts`:

```ts
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import {
  productEventNameSchema,
  type ProductEventInput,
  type ProductEventName,
} from "@worlddock/domain";

export const ANALYTICS_REPOSITORY = Symbol("ANALYTICS_REPOSITORY");

export type ProductEventRecord = {
  id: string;
  name: ProductEventName;
  context: Record<string, unknown>;
  anonymousId: string | null;
  route: string | null;
  userAgent: string | null;
  occurredAt: Date;
  createdAt: Date;
};

type ProductEventCreateInput = Omit<ProductEventRecord, "id" | "createdAt">;

export type AnalyticsRepository = {
  createEvent(input: ProductEventCreateInput): Promise<ProductEventRecord>;
};

@Injectable()
export class AnalyticsService {
  constructor(@Inject(ANALYTICS_REPOSITORY) private readonly repository: AnalyticsRepository) {}

  async record(input: ProductEventInput, metadata: { userAgent?: string | null } = {}) {
    const event = await this.repository.createEvent({
      name: input.name,
      context: input.context,
      anonymousId: input.anonymousId ?? null,
      route: input.route ?? null,
      userAgent: metadata.userAgent ?? null,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    });
    return toProductEventResponse(event);
  }
}

@Injectable()
export class PrismaAnalyticsRepository implements AnalyticsRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createEvent(input: ProductEventCreateInput) {
    const event = await this.prisma.productAnalyticsEvent.create({
      data: {
        name: input.name,
        context: input.context as never,
        anonymousId: input.anonymousId,
        route: input.route,
        userAgent: input.userAgent,
        occurredAt: input.occurredAt,
      },
    });
    return mapProductEvent(event);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapProductEvent(record: {
  id: string;
  name: string;
  context: unknown;
  anonymousId: string | null;
  route: string | null;
  userAgent: string | null;
  occurredAt: Date;
  createdAt: Date;
}): ProductEventRecord {
  return {
    id: record.id,
    name: productEventNameSchema.parse(record.name),
    context: normalizeContext(record.context),
    anonymousId: record.anonymousId,
    route: record.route,
    userAgent: record.userAgent,
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
  };
}

function normalizeContext(context: unknown): Record<string, unknown> {
  if (!context || typeof context !== "object" || Array.isArray(context)) return {};
  return context as Record<string, unknown>;
}

function toProductEventResponse(event: ProductEventRecord) {
  return {
    ...event,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}
```

Replace `apps/api/src/modules/analytics/analytics.controller.ts`:

```ts
import { Body, Controller, Headers, Post } from "@nestjs/common";
import { productEventInputSchema } from "@worlddock/domain";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post("events")
  async record(@Body() body: unknown, @Headers("user-agent") userAgent?: string) {
    const event = await this.analytics.record(productEventInputSchema.parse(body), {
      userAgent: userAgent ?? null,
    });
    return { event };
  }
}
```

Replace `apps/api/src/modules/analytics/analytics.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import {
  ANALYTICS_REPOSITORY,
  AnalyticsService,
  PrismaAnalyticsRepository,
} from "./analytics.service";

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    PrismaAnalyticsRepository,
    {
      provide: ANALYTICS_REPOSITORY,
      useExisting: PrismaAnalyticsRepository,
    },
  ],
})
export class AnalyticsModule {}
```

- [ ] **Step 6: Run API and DB verification**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- analytics.integration-spec.ts
```

Expected: both commands PASS. Unknown product event names return `400 VALIDATION_FAILED`.

- [ ] **Step 7: Commit**

Run:

```bash
git config user.name
git config user.email
git add packages/domain/src/analytics/index.ts packages/domain/src/index.ts packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260601090000_product_analytics_events/migration.sql apps/api/src/modules/analytics/analytics.controller.ts apps/api/src/modules/analytics/analytics.service.ts apps/api/src/modules/analytics/analytics.module.ts apps/api/test/analytics.integration-spec.ts
git commit -m "feat: persist product analytics events"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not expose a personal identity.

### Task 2: Web 产品事件客户端和公开营销 CTA

**Files:**
- Modify: `apps/web/src/features/analytics/product-events.ts`
- Modify: `apps/web/src/app/(marketing)/page.tsx`
- Modify: `apps/web/src/app/(marketing)/pricing/page.tsx`
- Test: `apps/web/src/features/analytics/product-events.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `apps/web/src/features/analytics/product-events.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_EVENTS, sendProductEvent } from "./product-events";

const originalFetch = globalThis.fetch;

describe("product event client", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts product events with route and anonymous id", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ event: { id: "event_1" } }), { status: 201 }));

    await sendProductEvent(
      PRODUCT_EVENTS.billingPlaceholderClicked,
      { plan: "creator" },
      {
        fetcher: fetcher as unknown as typeof fetch,
        baseUrl: "https://api.worlddock.test",
        anonymousId: "anon_test_123",
        route: "/pricing",
      },
    );

    expect(fetcher).toHaveBeenCalledWith("https://api.worlddock.test/v1/analytics/events", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "billing_placeholder_clicked",
        context: { plan: "creator" },
        anonymousId: "anon_test_123",
        route: "/pricing",
        occurredAt: expect.any(String),
      }),
    }));
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
pnpm --filter @worlddock/web test -- product-events.test.ts
```

Expected: FAIL because `sendProductEvent` and domain-exported `PRODUCT_EVENTS` are not wired.

- [ ] **Step 3: Replace the Web analytics client**

Replace `apps/web/src/features/analytics/product-events.ts`:

```ts
import { PRODUCT_EVENTS, type ProductEventName } from "@worlddock/domain";

export { PRODUCT_EVENTS };

const ANONYMOUS_ID_KEY = "worlddock.anonymousId";

type TrackOptions = {
  fetcher?: typeof fetch;
  baseUrl?: string;
  anonymousId?: string;
  route?: string;
};

export function trackProductEvent(
  name: ProductEventName,
  context: Record<string, unknown> = {},
  options: TrackOptions = {},
) {
  if (typeof window === "undefined" && !options.fetcher) return;
  void sendProductEvent(name, context, {
    anonymousId: options.anonymousId ?? readOrCreateAnonymousId(),
    route: options.route ?? readCurrentRoute(),
    baseUrl: options.baseUrl,
    fetcher: options.fetcher,
  });
}

export async function sendProductEvent(
  name: ProductEventName,
  context: Record<string, unknown> = {},
  options: TrackOptions = {},
) {
  const fetcher = options.fetcher ?? fetch;
  await fetcher(`${options.baseUrl ?? getApiBaseUrl()}/v1/analytics/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      context,
      anonymousId: options.anonymousId,
      route: options.route,
      occurredAt: new Date().toISOString(),
    }),
  });
}

function readOrCreateAnonymousId() {
  if (typeof window === "undefined") return undefined;
  const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
  if (existing) return existing;
  const created = createAnonymousId();
  window.localStorage.setItem(ANONYMOUS_ID_KEY, created);
  return created;
}

function readCurrentRoute() {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname;
}

function createAnonymousId() {
  if (globalThis.crypto?.randomUUID) return `anon_${globalThis.crypto.randomUUID()}`;
  return `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getApiBaseUrl() {
  return firstConfigured(
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL,
  ) ?? "http://localhost:4000";
}

function firstConfigured(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0);
}
```

- [ ] **Step 4: Update the public marketing pages**

Replace `apps/web/src/app/(marketing)/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { PRODUCT_EVENTS, trackProductEvent } from "@/features/analytics/product-events";

export default function MarketingHomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)" }}>
      <section
        style={{
          minHeight: "82vh",
          display: "grid",
          alignItems: "end",
          padding: "min(8vw, 72px)",
          backgroundImage: "linear-gradient(180deg, rgba(17,24,39,0.18), rgba(17,24,39,0.74)), url('https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1800&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div style={{ maxWidth: 760, color: "white" }}>
          <p className="mono" style={{ fontSize: 13, margin: "0 0 12px" }}>WorldDock Cloud Alpha</p>
          <h1 className="title-font" style={{ fontSize: 56, lineHeight: 1.02, margin: 0, letterSpacing: 0 }}>WorldDock Cloud Alpha</h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, maxWidth: 620 }}>
            为世界观创作者提供云端资产库、AI 推演、公开仓库、版本发布和世界包导入导出。
          </p>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <Link
              className="btn primary"
              href="/register"
              onClick={() => trackProductEvent(PRODUCT_EVENTS.signedUp, { source: "marketing_home", intent: "apply_alpha" })}
            >
              申请 Alpha
            </Link>
            <Link
              className="btn"
              href="/register?intent=feedback"
              onClick={() => trackProductEvent(PRODUCT_EVENTS.signedUp, { source: "marketing_home", intent: "feedback" })}
            >
              反馈 Alpha 方向
            </Link>
            <Link className="btn ghost" href="/pricing">查看定价</Link>
          </div>
        </div>
      </section>
      <section style={{ padding: "36px min(8vw, 72px)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {[
          ["云端世界资产", "统一管理设定、故事种子、冲突和发布快照。"],
          ["AI 推演闭环", "Agent 使用上下文引用生成建议，并把高价值内容保存回世界。"],
          ["创作者仓库", "发布、fork、收藏、举报和同步公开世界。"],
        ].map(([title, body]) => (
          <article key={title} className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0, fontSize: "var(--t-18)" }}>{title}</h2>
            <p className="prose" style={{ marginBottom: 0 }}>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
```

Replace `apps/web/src/app/(marketing)/pricing/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { PRODUCT_EVENTS, trackProductEvent } from "@/features/analytics/product-events";

const PLANS = [
  { id: "creator", name: "Creator Alpha", price: "免费试用", body: "包含云端工作台、公开仓库和 Alpha 免费额度。" },
  { id: "studio", name: "Studio Beta", price: "Beta 后开放", body: "团队协作、模板库和高级治理进入 Beta 计划。" },
  { id: "team", name: "Team Beta", price: "Beta 后开放", body: "组织权限、发票和审计能力进入 Beta 计划。" },
] as const;

export default function PricingPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", padding: "56px min(8vw, 72px)" }}>
      <div style={{ maxWidth: 760 }}>
        <p className="mono" style={{ color: "var(--slate)" }}>Pricing</p>
        <h1 className="title-font" style={{ fontSize: 44, margin: "0 0 12px", letterSpacing: 0 }}>Alpha 免费试用 / Beta 后开放付费</h1>
        <p className="prose" style={{ fontSize: 17 }}>Alpha 阶段不提供 Stripe 结账、客户门户或付费套餐映射。Beta 会在稳定后开放付费计划。</p>
      </div>
      <section style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {PLANS.map((plan) => (
          <article key={plan.id} className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0, fontSize: "var(--t-18)" }}>{plan.name}</h2>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{plan.price}</div>
            <p className="prose">{plan.body}</p>
            <button
              className="btn primary"
              onClick={() => trackProductEvent(PRODUCT_EVENTS.billingPlaceholderClicked, { plan: plan.id, source: "marketing_pricing" })}
            >
              加入候补
            </button>
          </article>
        ))}
      </section>
      <div style={{ marginTop: 24 }}>
        <Link className="btn ghost" href="/">返回首页</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run Web unit test**

Run:

```bash
pnpm --filter @worlddock/web test -- product-events.test.ts
```

Expected: PASS and request body contains the allowlisted event name, route and anonymous id.

- [ ] **Step 6: Commit**

Run:

```bash
git config user.name
git config user.email
git add apps/web/src/features/analytics/product-events.ts apps/web/src/features/analytics/product-events.test.ts apps/web/src/app/'(marketing)'/page.tsx apps/web/src/app/'(marketing)'/pricing/page.tsx
git commit -m "feat: track marketing activation events"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not expose a personal identity.

### Task 3: Alpha 反馈入口和 App 内激活事件

**Files:**
- Modify: `apps/web/src/features/support/support-entry.tsx`
- Modify: `apps/web/src/features/worlddock/view-settings.tsx`
- Modify: `apps/web/tests/e2e/helpers.ts`

- [ ] **Step 1: Update support feedback tracking**

Replace `apps/web/src/features/support/support-entry.tsx`:

```tsx
import { useState } from "react";
import { PRODUCT_EVENTS, trackProductEvent } from "../analytics/product-events";
import { submitSupportFeedback } from "../worlddock/api";

type SupportEntryProps = {
  sessionToken: string;
  context: Record<string, unknown>;
  onToast: (toast: { kind: "save" | "warn" | "info"; text: string }) => void;
};

export function SupportEntry({ sessionToken, context, onToast }: SupportEntryProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (message.trim().length < 6) return;
    setBusy(true);
    try {
      await submitSupportFeedback({ message: message.trim(), context }, { sessionToken });
      trackProductEvent(PRODUCT_EVENTS.alphaFeedbackSubmitted, {
        source: "support_entry",
        messageLength: message.trim().length,
        ...context,
      });
      setMessage("");
      onToast({ kind: "save", text: "反馈已提交" });
    } catch {
      onToast({ kind: "warn", text: "反馈提交失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ padding: 14 }}>
      <h3 className="title-font" style={{ marginTop: 0, fontSize: "var(--t-16)" }}>Alpha 反馈</h3>
      <textarea
        className="input"
        aria-label="Alpha 反馈"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
        style={{ width: "100%", resize: "vertical" }}
      />
      <button className="btn primary" style={{ marginTop: 10 }} disabled={!sessionToken || message.trim().length < 6 || busy} onClick={submit}>
        提交反馈
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Render SupportEntry in settings**

Modify `apps/web/src/features/worlddock/view-settings.tsx` imports:

```ts
import { SupportEntry } from "../support/support-entry";
```

Replace the billing tab body in `SettingsView` with:

```tsx
        {tab === "billing" && (
          <div style={{ display: "grid", gap: 14 }}>
            <BillingPage
              balanceCents={Math.round(balance * 100)}
              usage={billingUsage}
              busy={billingBusy}
              waitlistPendingPlan={billingWaitlistPendingPlan}
              onRefresh={refreshBilling}
              onWaitlist={joinBillingWaitlist}
            />
            <SupportEntry
              sessionToken={sessionToken()}
              context={{
                route: "/app/settings",
                tab: "billing",
                worldId: currentWorld?.id ?? null,
              }}
              onToast={onToast}
            />
          </div>
        )}
```

- [ ] **Step 3: Extend E2E mocks for support feedback and analytics**

In `apps/web/tests/e2e/helpers.ts`, replace the `gotoApp` signature and the `installApiMocks` signature:

```ts
export async function gotoApp(page: Page, options: { installMocks?: boolean; onAnalyticsEvent?: (event: Record<string, any>) => void } = {}) {
  if (options.installMocks ?? true) {
    await installApiMocks(page, { onAnalyticsEvent: options.onAnalyticsEvent });
    await page.addInitScript((token) => {
      window.localStorage.setItem("worlddock.sessionToken", token);
    }, sessionToken);
  }
  await page.goto("/app");
  await page.getByRole("heading", { name: "我的世界" }).waitFor();
}

async function installApiMocks(page: Page, options: { onAnalyticsEvent?: (event: Record<string, any>) => void } = {}) {
```

Then add these handlers inside `installApiMocks`, before the final unhandled route response:

```ts
    if (method === "POST" && path === "/v1/support/feedback") {
      const input = postData(request);
      return json(route, {
        feedback: {
          id: "feedback_e2e",
          userId: "user_e2e",
          message: input.message,
          context: input.context ?? {},
          status: "open",
          createdAt: "2026-06-01T10:00:00.000Z",
        },
        notification: {
          id: "notification_feedback_e2e",
          userId: "user_e2e",
          type: "support_feedback_submitted",
          title: "反馈已收到",
          body: "Alpha 团队会在产品节奏中处理这条反馈。",
          readAt: null,
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      }, 201);
    }

    if (method === "POST" && path === "/v1/analytics/events") {
      const input = postData(request);
      options.onAnalyticsEvent?.(input);
      return json(route, { event: { id: "event_e2e", ...input, createdAt: "2026-06-01T10:00:00.000Z" } }, 201);
    }
```

- [ ] **Step 4: Run focused Web checks**

Run:

```bash
pnpm --filter @worlddock/web test -- product-events.test.ts
pnpm --filter @worlddock/web test:e2e -- marketing-and-activation.spec.ts
```

Expected: product event unit test PASS; E2E can submit Alpha feedback from settings and does not hit unhandled mock routes.

- [ ] **Step 5: Commit**

Run:

```bash
git config user.name
git config user.email
git add apps/web/src/features/support/support-entry.tsx apps/web/src/features/worlddock/view-settings.tsx apps/web/tests/e2e/helpers.ts
git commit -m "feat: connect alpha feedback activation"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not expose a personal identity.

### Task 4: 产品政策文档收口

**Files:**
- Modify: `docs/product/beta-template-library.md`
- Modify: `docs/product/positioning.md`
- Modify: `docs/product/pricing.md`
- Modify: `docs/product/permissions.md`
- Modify: `docs/product/data-and-ip-policy.md`

- [ ] **Step 1: Replace product docs with Alpha-ready copy**

Replace `docs/product/beta-template-library.md`:

```md
# Beta Template Library

WorldDock Cloud Alpha 不包含模板库。Alpha 只验证个人创作者的云端世界资产、AI 推演、发布、Fork、反馈和数据可携带性闭环。

## Alpha 不提供

- 模板列表页
- 模板详情页
- 模板驱动 onboarding
- 官方题材模板
- 社区投稿模板
- 模板市场、模板授权和收入分成

## Beta 再评估

Beta 模板库必须先定义模板授权、作者署名、派生世界关系、模板质量审核和下架流程。任何模板入口上线前，都必须确保 Alpha 创作者不会误以为当前产品已经提供官方模板或付费模板。
```

Replace `docs/product/positioning.md`:

```md
# Positioning

WorldDock Cloud Alpha 面向个人世界观创作者。它帮助创作者把设定、故事种子、冲突、版本发布和公开仓库放进一个云端工作台，并用 AI Agent 辅助推演和整理。

## 目标用户

- 正在构建长篇小说、游戏设定、TRPG 世界或互动叙事项目的个人创作者。
- 已经积累大量设定材料，但缺少结构化整理、版本管理和公开分享方式的创作者。
- 希望 AI 参与推演，但仍要求所有保存、发布、Fork 和数据导出动作由本人确认的创作者。

## Alpha 主张

- 云端优先：Alpha 只承诺托管式 Cloud 路径。
- 结构化世界资产：Archive、Seeds、Conflicts 和关系网络是核心产品面。
- 可解释 AI 协作：Agent 必须展示上下文引用，建议保存前需要创作者确认。
- 可携带数据：世界包导入导出和账户数据导出是 Alpha 验收面。
- 社区轻闭环：公开仓库、Star、Fork、举报和创作者主页进入 Alpha。

## Alpha 不承诺

- 本地部署版
- 模板库
- 真实支付
- 邮件投递
- 管理后台
- 团队权限
```

Replace `docs/product/pricing.md`:

```md
# Pricing

WorldDock Cloud Alpha 免费试用。Alpha 阶段不处理真实付款，不创建 Stripe checkout，不提供 customer portal，不同步订阅、发票、税务或退款状态。

## Alpha 页面口径

- 官网定价页显示「Alpha 免费试用 / Beta 后开放付费」。
- App 内用量页可以展示 Beta 套餐候补，但支付按钮必须禁用。
- 候补按钮只能记录产品兴趣或 `BillingPlaceholderIntent`，不能跳转到支付页。

## Beta 候选套餐

- Creator：个人创作者创作点和公开仓库能力。
- Studio：更高创作点额度和项目组织能力。
- Team：团队协作、组织权限、发票和审计能力。

## 禁止事项

- 不在 Alpha 代码中接入 Stripe secret、checkout session、customer portal、webhook、subscription 或 invoice 主路径。
- 不在 Alpha 文案中承诺已开放付费套餐。
- 不把候补登记描述为购买、订阅或支付成功。
```

Replace `docs/product/permissions.md`:

```md
# Permissions

WorldDock Cloud Alpha 使用个人账户权限模型。Alpha 用户只能管理自己的世界、资产、发布、Fork、用量、通知、反馈和个人访问令牌。

## Alpha 权限边界

- Session 用户可以读取和编辑自己的世界。
- Session 用户可以发布自己的世界到公开仓库。
- Session 用户可以 Fork 公开仓库到自己的世界。
- Session 用户可以读取自己的用量和候补登记。
- Personal Access Token 只覆盖公开 API 所需的最小 scope。
- 举报和反馈由登录用户提交，Alpha 不提供审核后台角色。

## Beta Deferred

- 组织和团队成员
- 项目级角色
- 管理员角色
- 审核员工作台
- 付费账户角色
- 细粒度共享链接权限

## 验收口径

Alpha 页面和 API 文档不能暗示团队权限、管理员权限或付费角色已经可用。任何需要管理员身份的操作只能存在于人工 runbook，不暴露为产品 UI 或公开 HTTP API。
```

Replace `docs/product/data-and-ip-policy.md`:

```md
# Data And IP Policy

WorldDock Cloud Alpha 的默认原则是：创作者保留自己的世界观 IP，WorldDock 提供结构化存储、AI 辅助推演、公开发布和可携带导出能力。

## 创作者数据

- 私有世界只对世界 owner 可见。
- 公开仓库只暴露创作者主动发布的 release snapshot。
- Fork 会复制公开 release snapshot，不读取源创作者的私有草稿。
- 世界包导出包含世界 metadata、资产列表和 release 摘要。
- 账户数据导出用于 Alpha 阶段的数据权利验证。

## AI 使用边界

- Agent 只能使用 WorldDock API 提供的上下文引用和工具结果。
- Agent 建议默认是 pending，保存前必须由创作者显式确认。
- Alpha 不允许 Agent 直接发布、删除、收费或读取本地文件。

## Alpha 不包含

- 模板授权
- 模板市场收入分成
- 付费资产库
- 硬删除执行器
- 长期对象存储下载页
- 法务申诉工作流

## 公开发布提示

创作者发布公开仓库前，需要确认 release note、授权方式和公开内容。公开仓库被 Fork 后，Fork 用户会获得该 release snapshot 的副本；源仓库后续更新需要通过同步流程进入 Fork。
```

- [ ] **Step 2: Verify docs contain required policy language**

Run:

```bash
rg -n "Alpha 不包含|Alpha 免费试用|不处理真实付款|模板库|创作者保留|个人账户权限" docs/product/beta-template-library.md docs/product/positioning.md docs/product/pricing.md docs/product/permissions.md docs/product/data-and-ip-policy.md
```

Expected: output includes all five product docs and the Alpha no-payment/no-template/IP/permission language.

- [ ] **Step 3: Commit**

Run:

```bash
git config user.name
git config user.email
git add docs/product/beta-template-library.md docs/product/positioning.md docs/product/pricing.md docs/product/permissions.md docs/product/data-and-ip-policy.md
git commit -m "docs: define alpha marketing policy"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not expose a personal identity.

### Task 5: Phase 12 E2E 验收和完成记录

**Files:**
- Modify: `apps/web/tests/e2e/marketing-and-activation.spec.ts`
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [ ] **Step 1: Replace marketing and activation E2E spec**

Replace `apps/web/tests/e2e/marketing-and-activation.spec.ts`:

```ts
import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("marketing pages explain alpha pricing and record waitlist activation", async ({ page }) => {
  const events: any[] = [];
  await page.route("**/v1/analytics/events", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ event: { id: `event_${events.length}` } }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WorldDock Cloud Alpha" })).toBeVisible();
  await expect(page.getByText("公开仓库")).toBeVisible();
  await expect(page.getByRole("link", { name: "申请 Alpha" })).toHaveAttribute("href", "/register");
  await expect(page.getByRole("link", { name: "反馈 Alpha 方向" })).toHaveAttribute("href", "/register?intent=feedback");

  await page.getByRole("link", { name: "查看定价" }).click();
  await expect(page.getByRole("heading", { name: "Alpha 免费试用 / Beta 后开放付费" })).toBeVisible();
  await expect(page.getByText("Alpha 阶段不提供 Stripe")).toBeVisible();

  await page.getByRole("button", { name: "加入候补" }).first().click();
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toMatchObject({
    name: "billing_placeholder_clicked",
    context: { plan: "creator", source: "marketing_pricing" },
    route: "/pricing",
  });

  const response = await page.goto("/templates");
  expect(response?.status()).toBe(404);
});

test("authenticated settings page submits alpha feedback and records feedback event", async ({ page }) => {
  const events: any[] = [];

  await gotoApp(page, { onAnalyticsEvent: (event) => events.push(event) });
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByLabel("Alpha 反馈").fill("希望 Alpha 增加更清晰的发布前检查。");
  await page.getByRole("button", { name: "提交反馈" }).click();

  await expect(page.getByText("反馈已提交")).toBeVisible();
  await expect.poll(() => events.some((event) => event.name === "alpha_feedback_submitted")).toBe(true);
  expect(events.find((event) => event.name === "alpha_feedback_submitted")).toMatchObject({
    context: {
      source: "support_entry",
      route: "/app/settings",
      tab: "billing",
    },
  });
});
```

- [ ] **Step 2: Run focused acceptance**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- analytics.integration-spec.ts
pnpm --filter @worlddock/web test -- product-events.test.ts
pnpm --filter @worlddock/web test:e2e -- marketing-and-activation.spec.ts
```

Expected: all commands PASS.

- [ ] **Step 3: Run full regression gate**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: all commands PASS.

- [ ] **Step 4: Update incomplete-tasks completion record**

Modify the `## Phase 12: 产品分析、官网和 Alpha 申请/反馈` section in `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` to:

```md
## Phase 12: 产品分析、官网和 Alpha 申请/反馈

完成状态：已完成。

完成依据：

- `packages/domain/src/analytics/index.ts` 已统一产品事件名称、事件输入 schema 和事件响应 schema。
- `packages/db/prisma/schema.prisma` 与 `packages/db/prisma/migrations/20260601090000_product_analytics_events/migration.sql` 已包含持久化 `ProductAnalyticsEvent`。
- `apps/api/src/modules/analytics/*` 已提供 `/v1/analytics/events`，只接受 allowlisted product event，并保留 context、anonymous id、route、user agent 和 occurredAt。
- `apps/web/src/features/analytics/product-events.ts` 已提供可测试的产品事件客户端，并在浏览器生成匿名 ID。
- `apps/web/src/app/(marketing)/page.tsx` 和 `apps/web/src/app/(marketing)/pricing/page.tsx` 已提供 Alpha 官网、申请 CTA、反馈引导、非支付定价页和候补事件。
- `apps/web/src/features/support/support-entry.tsx` 与 `apps/web/src/features/worlddock/view-settings.tsx` 已在登录后的设置页接入 Alpha 反馈入口，并在提交成功后记录 `alpha_feedback_submitted`。
- `docs/product/beta-template-library.md`、`positioning.md`、`pricing.md`、`permissions.md` 和 `data-and-ip-policy.md` 已固定 Alpha 不做模板库、真实支付、团队权限和邮件投递的产品口径。
- `apps/api/test/analytics.integration-spec.ts` 和 `apps/web/tests/e2e/marketing-and-activation.spec.ts` 已覆盖 Phase 12 主路径。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test:integration -- analytics.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- product-events.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- marketing-and-activation.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 12 不实现真实 Stripe checkout、customer portal、webhook、订阅、发票或税务流程。
- Phase 12 不实现模板库、邮件营销、邮箱验证、管理后台、团队权限或产品分析后台 UI。
- 产品事件当前只作为 Alpha 激活分析采集面；聚合报表和增长运营工作台进入后续计划。
```

- [ ] **Step 5: Commit**

Run:

```bash
git config user.name
git config user.email
git add apps/web/tests/e2e/marketing-and-activation.spec.ts docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
git commit -m "test: verify phase 12 activation flow"
git log -1 --format=fuller
```

Expected: commit succeeds and Author/Committer do not expose a personal identity.

## Final Verification

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- analytics.integration-spec.ts
pnpm --filter @worlddock/web test -- product-events.test.ts
pnpm --filter @worlddock/web test:e2e -- marketing-and-activation.spec.ts
pnpm lint
pnpm test
pnpm build
rg -n "Stripe|stripe|checkout|customer portal|webhook|subscription|invoice|template library|模板库" apps packages docs/product docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected:

- Product analytics events are persisted and reject unknown event names.
- Landing page explains WorldDock Cloud Alpha and links to Alpha application/feedback paths.
- Pricing page says Alpha is free to try and Beta payment opens later.
- Authenticated settings page accepts Alpha feedback and records `alpha_feedback_submitted`.
- `/templates` is still 404.
- Search output only contains Alpha/Beta policy language, docs, tests or explicit non-payment/no-template assertions; there is no real Stripe checkout, customer portal, webhook, subscription, invoice or template product route.
- Full lint, test and build gates pass.

## Self-Review Notes

- Spec coverage: 原始 Phase 12 的 marketing page、pricing page、product events、analytics API、product docs、waitlist/feedback CTA 和 E2E 都有对应任务。
- Placeholder scan: 本计划不使用常见占位标记、延后实现语句或无代码的泛化实现步骤。
- Type consistency: `PRODUCT_EVENTS.billingPlaceholderClicked` 对应 `billing_placeholder_clicked`；`PRODUCT_EVENTS.alphaFeedbackSubmitted` 对应 `alpha_feedback_submitted`；API、Web 和测试都引用同一 domain contract。
