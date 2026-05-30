# Phase 7 Billing Alpha Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Phase 7 收口为真实模型价格表结算、创作点账本、低余额拦截、Alpha 支付占位和可验收 Billing UI 的完整闭环。

**Architecture:** 继续沿用 Nest API + Prisma repository + `@worlddock/domain` + Next Web 的边界。模型成本由 domain price book 统一计算，API 负责账本事实、权益状态和占位支付意向，前端只读取服务端 usage 并提供 Beta 候补动作；Alpha 明确不接 Stripe checkout、customer portal、webhook、订阅状态同步或发票。

**Tech Stack:** TypeScript、NestJS、Prisma、Zod、Vitest、Playwright、Next.js、React、`@worlddock/domain`。

---

## Current Baseline

本计划基于 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 7 缺口撰写。撰写时文件核对显示 Phase 7 目标文件已经大多存在，但缺口记录尚未更新，且执行前仍需要以测试证据确认当前实现是否完整。

已存在并需要核对的文件：

- `packages/domain/src/billing/price-book.ts`
- `apps/api/src/modules/billing/entitlements.service.ts`
- `apps/api/src/modules/billing/billing.service.ts`
- `apps/api/src/modules/billing/billing.controller.ts`
- `apps/api/src/modules/billing/prisma-billing.repository.ts`
- `apps/web/src/features/billing/billing-page.tsx`
- `apps/web/src/features/billing/pricing-page.tsx`
- `apps/web/tests/e2e/billing-flow.spec.ts`
- `apps/api/test/billing-price-book.spec.ts`
- `apps/api/test/billing-alpha.integration-spec.ts`
- `packages/db/prisma/migrations/20260527211500_billing_placeholder_intents/migration.sql`

执行策略：

- 如果现有代码已经与本计划步骤中的目标代码一致，对应步骤只做核对并勾选。
- 如果测试缺少断言或文档语言不符合简体中文要求，按本计划补齐。
- Phase 7 完成后必须更新 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 7 状态和验收证据。

## Commit Identity Guard

如果执行本计划时需要提交，每次提交前先执行：

```bash
git config user.name
git config user.email
```

当输出包含真实姓名或个人邮箱时，先在当前仓库设置匿名提交身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

提交后立即核验：

```bash
git log -1 --format=fuller
```

Author 和 Committer 都不得包含真实姓名或个人邮箱。

## File Map

- Create or verify: `packages/domain/src/billing/price-book.ts`
  定义 Alpha 模型价格表和 provider/model/token usage 到 cents 的统一成本函数。

- Modify: `packages/domain/src/billing/index.ts`
  导出 price book，并让 billing usage contract 包含 `placeholderIntents`。

- Modify: `packages/db/prisma/schema.prisma`
  增加 `BillingPlaceholderIntent`，并关联 `BillingAccount`。

- Create or verify: `packages/db/prisma/migrations/20260527211500_billing_placeholder_intents/migration.sql`
  创建 `billing_placeholder_intents` 表、索引和 account 外键。

- Modify: `apps/api/src/modules/billing/billing.repository.ts`
  在 repository contract 中加入 placeholder intent record、创建和列表方法。

- Modify: `apps/api/src/modules/billing/prisma-billing.repository.ts`
  用 Prisma 实现 placeholder intent 持久化和映射。

- Create or verify: `apps/api/src/modules/billing/entitlements.service.ts`
  返回 Alpha 权益，明确 Beta payments 和 Stripe 能力关闭。

- Modify: `apps/api/src/modules/billing/billing.module.ts`
  注册并导出 `EntitlementsService`。

- Modify: `apps/api/src/modules/billing/billing.controller.ts`
  暴露 `GET /v1/billing/entitlements` 和 `POST /v1/billing/placeholder-intents`。

- Modify: `apps/api/src/modules/billing/billing.service.ts`
  使用 price book 结算 Agent Run，保留 reserve / settle / refund 幂等语义，并返回最近一次 Agent Run 成本。

- Modify: `apps/api/src/modules/agent/agent.service.ts`
  将 Agent Run 的 provider/model 传入 billing settlement，失败和取消路径继续退款。

- Modify: `apps/api/test/agent.integration-spec.ts`
  强化 Agent Run 账本断言，验证 reserve、price book settlement 和 low-balance blocking。

- Create or verify: `apps/api/test/billing-price-book.spec.ts`
  覆盖 price book 成本计算、最小 1 分和未知模型报错。

- Create or verify: `apps/api/test/billing-alpha.integration-spec.ts`
  覆盖 Alpha entitlements、placeholder intent 捕获和 usage 返回。

- Modify: `apps/web/src/features/worlddock/api.ts`
  增加 billing usage、placeholder intent 类型和 API client。

- Create or verify: `apps/web/src/features/billing/billing-page.tsx`
  展示 Alpha 余额、最近 Agent Run、账本条目和低余额说明。

- Create or verify: `apps/web/src/features/billing/pricing-page.tsx`
  展示 Beta 即将开放套餐卡、禁用支付按钮和候补动作。

- Modify: `apps/web/src/features/worlddock/view-settings.tsx`
  在设置页接入 BillingPage、usage refresh 和候补登记。

- Modify: `apps/web/src/app/(marketing)/pricing/page.tsx`
  保持公开定价页为 Alpha 免费试用 / Beta 付费占位，不出现真实 checkout。

- Create or verify: `apps/web/tests/e2e/billing-flow.spec.ts`
  覆盖设置页 billing usage、禁用付款按钮和候补 API 请求。

- Create or modify: `docs/product/beta-payments.md`
  用简体中文记录 Beta 支付延后范围。

- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  Phase 7 验证通过后改为完成状态，并写入验收证据。

## Non-Goals

- 不接 Stripe checkout。
- 不接 Stripe customer portal。
- 不接 Stripe webhook。
- 不做订阅状态同步。
- 不做发票、税务、退款策略和支付失败催缴。
- 不做真实套餐购买后权益提升。
- 不引入管理后台或人工调账 UI。

### Task 1: Domain Price Book

**Files:**
- Create or verify: `packages/domain/src/billing/price-book.ts`
- Modify: `packages/domain/src/billing/index.ts`
- Test: `apps/api/test/billing-price-book.spec.ts`

- [x] **Step 1: Write the failing price book test**

Replace or create `apps/api/test/billing-price-book.spec.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { calculateModelRunCostCents, MODEL_PRICE_BOOK } from "@worlddock/domain";

describe("billing price book", () => {
  it("prices model runs from provider/model/token usage", () => {
    expect(MODEL_PRICE_BOOK).toContainEqual(expect.objectContaining({
      provider: "openai",
      model: "gpt-5.4",
    }));

    expect(calculateModelRunCostCents({
      provider: "openai",
      model: "gpt-5.4",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })).toBe(600);
  });

  it("keeps tiny alpha runs billable at a one-cent minimum", () => {
    expect(calculateModelRunCostCents({
      provider: "openai-compatible",
      model: "qwen3-32b",
      inputTokens: 12,
      outputTokens: 30,
    })).toBe(1);
  });

  it("rejects model runs without an explicit price", () => {
    expect(() => calculateModelRunCostCents({
      provider: "openai",
      model: "missing-model",
      inputTokens: 1,
      outputTokens: 1,
    })).toThrow("Missing model price: openai/missing-model");
  });
});
```

- [x] **Step 2: Run the price book test and confirm it fails before implementation**

Run:

```bash
pnpm --filter @worlddock/api test -- billing-price-book.spec.ts
```

Expected before implementation: FAIL because `calculateModelRunCostCents` or the unknown-model behavior is missing.

- [x] **Step 3: Implement the shared price book**

Create or replace `packages/domain/src/billing/price-book.ts` with:

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

  if (input.inputTokens + input.outputTokens <= 0) return 0;

  const inputCost = input.inputTokens * price.inputCentsPerMillionTokens / 1_000_000;
  const outputCost = input.outputTokens * price.outputCentsPerMillionTokens / 1_000_000;
  return Math.max(1, Math.ceil(inputCost + outputCost));
}
```

In `packages/domain/src/billing/index.ts`, keep the export:

```ts
export * from "./price-book";
```

- [x] **Step 4: Run the price book test again**

Run:

```bash
pnpm --filter @worlddock/api test -- billing-price-book.spec.ts
```

Expected: PASS with all `billing price book` cases passing.

- [x] **Step 5: Commit the price book increment**

Run the identity guard commands from this plan, then:

```bash
git add packages/domain/src/billing/price-book.ts packages/domain/src/billing/index.ts apps/api/test/billing-price-book.spec.ts
git commit -m "feat: add alpha billing price book"
git log -1 --format=fuller
```

Expected: latest commit author and committer are anonymous-safe, and no real name or personal email appears.

### Task 2: Billing Placeholder Persistence And Alpha Entitlements

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create or verify: `packages/db/prisma/migrations/20260527211500_billing_placeholder_intents/migration.sql`
- Modify: `apps/api/src/modules/billing/billing.repository.ts`
- Modify: `apps/api/src/modules/billing/prisma-billing.repository.ts`
- Create or verify: `apps/api/src/modules/billing/entitlements.service.ts`
- Modify: `apps/api/src/modules/billing/billing.module.ts`
- Modify: `apps/api/src/modules/billing/billing.controller.ts`
- Test: `apps/api/test/billing-alpha.integration-spec.ts`

- [x] **Step 1: Write the Alpha billing endpoint test**

Ensure `apps/api/test/billing-alpha.integration-spec.ts` includes this test case:

```ts
it("returns alpha entitlements and captures waitlist-only payment intents", async () => {
  const auth = createInMemoryAuthRepository();
  const billing = createInMemoryBillingRepository();
  addSession(auth, "session_user_1", "user_1");
  app = await createTestApp(auth, billing);

  const entitlements = await request(app.getHttpServer())
    .get("/v1/billing/entitlements")
    .set("authorization", "Bearer session_user_1")
    .expect(200);
  expect(entitlements.body.entitlements).toMatchObject({
    betaPayments: false,
    stripeCheckout: false,
    stripeCustomerPortal: false,
    stripeWebhooks: false,
  });

  const intent = await request(app.getHttpServer())
    .post("/v1/billing/placeholder-intents")
    .set("authorization", "Bearer session_user_1")
    .send({ plan: "creator" })
    .expect(201);
  expect(intent.body.intent).toMatchObject({
    userId: "user_1",
    plan: "creator",
    source: "alpha_ui",
    status: "captured",
  });

  const usage = await request(app.getHttpServer())
    .get("/v1/billing/usage")
    .set("authorization", "Bearer session_user_1")
    .expect(200);
  expect(usage.body.usage.placeholderIntents).toContainEqual(expect.objectContaining({ plan: "creator" }));
});
```

The same file must keep in-memory helpers for `createInMemoryAuthRepository()`, `createInMemoryBillingRepository()`, `addSession()`, and `createTestApp()` so the test is isolated from a real database.

- [x] **Step 2: Run the Alpha billing endpoint test and confirm it fails before implementation**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- billing-alpha.integration-spec.ts
```

Expected before implementation: FAIL because `GET /v1/billing/entitlements`, `POST /v1/billing/placeholder-intents`, or placeholder persistence is missing.

- [x] **Step 3: Add the Prisma model and migration**

In `packages/db/prisma/schema.prisma`, ensure `BillingAccount` contains:

```prisma
model BillingAccount {
  id                  String             @id @default(cuid())
  userId              String             @unique
  currency            String             @default("CNY")
  freeCreditGrantedAt DateTime?
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  user                User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  entries             UsageLedgerEntry[]
  placeholderIntents  BillingPlaceholderIntent[]

  @@map("billing_accounts")
}
```

Add this model:

```prisma
model BillingPlaceholderIntent {
  id        String   @id @default(cuid())
  userId    String
  accountId String
  plan      String
  source    String   @default("alpha_ui")
  status    String   @default("captured")
  createdAt DateTime @default(now())
  account   BillingAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([accountId])
  @@map("billing_placeholder_intents")
}
```

Create or verify `packages/db/prisma/migrations/20260527211500_billing_placeholder_intents/migration.sql`:

```sql
CREATE TABLE "billing_placeholder_intents" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'alpha_ui',
  "status" TEXT NOT NULL DEFAULT 'captured',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_placeholder_intents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_placeholder_intents_userId_createdAt_idx" ON "billing_placeholder_intents"("userId", "createdAt");
CREATE INDEX "billing_placeholder_intents_accountId_idx" ON "billing_placeholder_intents"("accountId");
ALTER TABLE "billing_placeholder_intents" ADD CONSTRAINT "billing_placeholder_intents_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "billing_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [x] **Step 4: Extend the billing repository contract**

In `apps/api/src/modules/billing/billing.repository.ts`, add:

```ts
export type BillingPlaceholderIntentRecord = {
  id: string;
  userId: string;
  accountId: string;
  plan: string;
  source: string;
  status: "captured";
  createdAt: Date;
};

export type BillingRepository = {
  findAccountByUserId(userId: string): Promise<BillingAccountRecord | null>;
  createAccount(input: { userId: string; freeCreditGrantedAt?: Date | null }): Promise<BillingAccountRecord>;
  markFreeCreditGranted(accountId: string, grantedAt: Date): Promise<BillingAccountRecord | null>;
  createLedgerEntry(input: Omit<UsageLedgerEntryRecord, "id" | "createdAt">): Promise<UsageLedgerEntryRecord>;
  listLedgerEntries(userId: string): Promise<UsageLedgerEntryRecord[]>;
  listLedgerEntriesForRun(agentRunId: string): Promise<UsageLedgerEntryRecord[]>;
  createPlaceholderIntent(input: Omit<BillingPlaceholderIntentRecord, "id" | "createdAt" | "status"> & Partial<Pick<BillingPlaceholderIntentRecord, "status">>): Promise<BillingPlaceholderIntentRecord>;
  listPlaceholderIntents(userId: string): Promise<BillingPlaceholderIntentRecord[]>;
};
```

In `apps/api/src/modules/billing/prisma-billing.repository.ts`, implement:

```ts
async createPlaceholderIntent(input: Parameters<BillingRepository["createPlaceholderIntent"]>[0]) {
  const intent = await this.prisma.billingPlaceholderIntent.create({
    data: {
      ...input,
      status: input.status ?? "captured",
    },
  });
  return mapPlaceholderIntent(intent);
}

async listPlaceholderIntents(userId: string) {
  const intents = await this.prisma.billingPlaceholderIntent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return intents.map(mapPlaceholderIntent);
}

function mapPlaceholderIntent(record: {
  id: string;
  userId: string;
  accountId: string;
  plan: string;
  source: string;
  status: string;
  createdAt: Date;
}): BillingPlaceholderIntentRecord {
  return {
    ...record,
    status: parsePlaceholderStatus(record.status),
  };
}

function parsePlaceholderStatus(value: string): BillingPlaceholderIntentRecord["status"] {
  if (value === "captured") return value;
  throw new Error(`Unknown billing placeholder intent status: ${value}`);
}
```

- [x] **Step 5: Add Alpha entitlements and endpoint wiring**

Create or verify `apps/api/src/modules/billing/entitlements.service.ts`:

```ts
import { Injectable } from "@nestjs/common";

@Injectable()
export class EntitlementsService {
  getAlphaEntitlements() {
    return {
      publicPublishing: process.env.ALPHA_PUBLIC_PUBLISHING_ENABLED !== "0",
      betaPayments: false,
      stripeCheckout: false,
      stripeCustomerPortal: false,
      stripeWebhooks: false,
    };
  }
}
```

In `apps/api/src/modules/billing/billing.module.ts`, ensure `EntitlementsService` is both provided and exported:

```ts
providers: [
  BillingService,
  EntitlementsService,
  PrismaBillingRepository,
  {
    provide: BILLING_REPOSITORY,
    useExisting: PrismaBillingRepository,
  },
],
exports: [BillingService, EntitlementsService, BILLING_REPOSITORY],
```

In `apps/api/src/modules/billing/billing.controller.ts`, ensure the endpoint body schema and handlers exist:

```ts
const placeholderIntentSchema = z.object({
  plan: z.enum(["creator", "studio", "team"]),
});

@Get("entitlements")
@RequireScopes("billing:read")
async entitlementsStatus() {
  return { entitlements: this.entitlements.getAlphaEntitlements() };
}

@Post("placeholder-intents")
@RequireScopes("billing:read")
async placeholderIntent(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
  const input = placeholderIntentSchema.parse(body);
  return { intent: await this.billing.capturePlaceholderIntent(subject.user.id, input.plan) };
}
```

- [x] **Step 6: Run Prisma validation and Alpha billing integration test**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- billing-alpha.integration-spec.ts
```

Expected: Prisma schema validates, and the Alpha billing endpoint test passes.

- [x] **Step 7: Commit billing placeholder and entitlement increment**

Run the identity guard commands from this plan, then:

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260527211500_billing_placeholder_intents/migration.sql apps/api/src/modules/billing apps/api/test/billing-alpha.integration-spec.ts
git commit -m "feat: add alpha billing entitlements"
git log -1 --format=fuller
```

Expected: latest commit author and committer are anonymous-safe.

### Task 3: Agent Run Price Book Settlement

**Files:**
- Modify: `apps/api/src/modules/billing/billing.service.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `apps/api/test/agent.integration-spec.ts`

- [x] **Step 1: Strengthen the Agent Run ledger assertion**

In `apps/api/test/agent.integration-spec.ts`, replace the post-SSE ledger assertion in `creates a run, streams SSE events, and keeps suggestions pending until saved` with:

```ts
const ledgerEntries = await billing.listLedgerEntriesForRun(createRun.body.run.id);
expect(ledgerEntries).toEqual([
  expect.objectContaining({
    type: "model_run_reserved",
    amountCents: -100,
  }),
  expect.objectContaining({
    type: "model_run_settled",
    amountCents: 99,
    tokenUsage: { inputTokens: 12, outputTokens: 30, totalTokens: 42 },
  }),
]);
```

This assertion means the mock model maps to `openai-compatible/qwen3-32b`, costs 1 cent, and returns 99 cents from the 100-cent reserve.

- [x] **Step 2: Run the Agent integration test and confirm it fails if settlement still uses totalTokens / 10**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- agent.integration-spec.ts
```

Expected before implementation: FAIL if the settled entry amount does not equal `99`.

- [x] **Step 3: Use price book settlement in BillingService**

In `apps/api/src/modules/billing/billing.service.ts`, import the domain calculator and types:

```ts
import { calculateModelRunCostCents, type ModelPrice, type TokenUsage } from "@worlddock/domain";
```

Ensure `settleAgentRun()` accepts provider/model and uses `calculateAgentRunCostCents()`:

```ts
async settleAgentRun(
  userId: string,
  agentRunId: string,
  tokenUsage: TokenUsage,
  priceInput: { provider?: ModelPrice["provider"] | string | null; model?: string | null } = {},
) {
  const account = await this.ensureAccount(userId);
  const entries = await this.billing.listLedgerEntriesForRun(agentRunId);
  if (entries.some((entry) => entry.type === "model_run_settled")) return null;

  const reservedCents = this.reservedCents(entries);
  const costCents = calculateAgentRunCostCents(tokenUsage, priceInput);
  return this.billing.createLedgerEntry({
    accountId: account.id,
    userId,
    agentRunId,
    type: "model_run_settled",
    amountCents: reservedCents - costCents,
    tokenUsage,
    reason: "settle agent run",
  });
}
```

Add or verify these helpers in the same file:

```ts
export function calculateAgentRunCostCents(
  tokenUsage: TokenUsage,
  priceInput: { provider?: ModelPrice["provider"] | string | null; model?: string | null } = {},
) {
  if (tokenUsage.totalTokens <= 0) return 0;
  const modelPrice = normalizeModelPriceInput(priceInput);
  return calculateModelRunCostCents({
    provider: modelPrice.provider,
    model: modelPrice.model,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
  });
}

function normalizeModelPriceInput(input: { provider?: ModelPrice["provider"] | string | null; model?: string | null }) {
  const model = normalizeModelName(input.model ?? "qwen3-32b");
  if (input.provider === "openai" || model.startsWith("gpt-")) return { provider: "openai" as const, model };
  if (input.provider === "anthropic" || model.startsWith("claude")) return { provider: "anthropic" as const, model };
  if (input.provider === "openai-compatible") return { provider: "openai-compatible" as const, model };
  if (model === "mock") return { provider: "openai-compatible" as const, model: "qwen3-32b" };
  return { provider: "openai-compatible" as const, model };
}

function normalizeModelName(model: string) {
  if (model.startsWith("openai/")) return model.replace("openai/", "");
  if (model.startsWith("anthropic/")) return model.replace("anthropic/", "");
  return model;
}
```

- [x] **Step 4: Pass Agent provider/model into billing settlement**

In `apps/api/src/modules/agent/agent.service.ts`, settle completed runs with provider/model:

```ts
await this.billing.settleAgentRun(run.userId, run.id, tokenUsage, resolveBillingModel(run.provider, run.model));
```

Add or verify the helper:

```ts
function resolveBillingModel(provider: AgentRunRecord["provider"], model: string | null | undefined) {
  if (provider === "mock" || !model || model === "mock") return { provider: "openai-compatible", model: "qwen3-32b" };
  if (model.startsWith("openai/")) return { provider: "openai", model: model.replace("openai/", "") };
  if (model.startsWith("anthropic/")) return { provider: "anthropic", model: model.replace("anthropic/", "") };
  if (model.startsWith("gpt-")) return { provider: "openai", model };
  if (model.startsWith("claude")) return { provider: "anthropic", model };
  return { provider: "openai-compatible", model };
}
```

Keep existing failure and cancellation refund paths:

```ts
await this.billing.refundAgentRun(run.userId, run.id, failure.reason);
await this.billing.refundAgentRun(run.userId, run.id, "user_cancelled");
```

- [x] **Step 5: Run Agent and billing tests**

Run:

```bash
pnpm --filter @worlddock/api test -- billing-price-book.spec.ts
pnpm --filter @worlddock/api test:integration -- agent.integration-spec.ts billing-alpha.integration-spec.ts
```

Expected: price book tests pass, completed Agent Run settles to a 1-cent cost under the mock model, failed/cancelled runs refund reserve, and low-balance run creation returns `402` with `INSUFFICIENT_BALANCE`.

- [x] **Step 6: Commit Agent billing settlement increment**

Run the identity guard commands from this plan, then:

```bash
git add apps/api/src/modules/billing/billing.service.ts apps/api/src/modules/agent/agent.service.ts apps/api/test/agent.integration-spec.ts
git commit -m "feat: settle agent runs with price book"
git log -1 --format=fuller
```

Expected: latest commit author and committer are anonymous-safe.

### Task 4: Billing UI And Waitlist-Only Pricing

**Files:**
- Modify: `apps/web/src/features/worlddock/api.ts`
- Create or verify: `apps/web/src/features/billing/billing-page.tsx`
- Create or verify: `apps/web/src/features/billing/pricing-page.tsx`
- Modify: `apps/web/src/features/worlddock/view-settings.tsx`
- Modify: `apps/web/src/app/(marketing)/pricing/page.tsx`
- Test: `apps/web/tests/e2e/billing-flow.spec.ts`

- [x] **Step 1: Write the billing E2E flow**

Create or verify `apps/web/tests/e2e/billing-flow.spec.ts`:

```ts
import { expect, test } from "playwright/test";
import { gotoApp } from "./helpers";

test("billing page shows alpha usage and waitlist-only payment actions", async ({ page }) => {
  const placeholderRequests: any[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_billing_flow");
  });
  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds: [] }) });
  });
  await page.route("**/v1/billing/usage", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        usage: {
          balance: { userId: "user_1", currency: "CNY", balanceCents: 9876, lowBalanceThresholdCents: 500, updatedAt: new Date().toISOString() },
          lastAgentRun: {
            agentRunId: "run_1",
            tokenUsage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
            costCents: 1,
            createdAt: new Date().toISOString(),
          },
          entries: [
            { id: "ule_1", accountId: "ba_1", userId: "user_1", agentRunId: null, type: "credit_granted", amountCents: 10000, tokenUsage: null, reason: "initial free credit", createdAt: new Date().toISOString() },
            { id: "ule_2", accountId: "ba_1", userId: "user_1", agentRunId: "run_1", type: "model_run_settled", amountCents: 99, tokenUsage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 }, reason: "settle agent run", createdAt: new Date().toISOString() },
          ],
          placeholderIntents: [],
        },
      }),
    });
  });
  await page.route("**/v1/billing/placeholder-intents", async (route) => {
    placeholderRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ intent: { id: "bpi_1", userId: "user_1", accountId: "ba_1", plan: "creator", source: "alpha_ui", status: "captured", createdAt: new Date().toISOString() } }),
    });
  });

  await gotoApp(page, { installMocks: false });
  await page.getByLabel("设置").click();

  await expect(page.getByText("当前 Alpha 余额")).toBeVisible();
  await expect(page.getByText("¥98.76")).toBeVisible();
  await expect(page.getByText("200 tokens / ¥0.01")).toBeVisible();
  await expect(page.getByText("Beta 即将开放").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "支付暂未开放" }).first()).toBeDisabled();

  await page.getByRole("button", { name: "加入候补" }).first().click();
  await expect.poll(() => placeholderRequests.length).toBe(1);
  expect(placeholderRequests[0]).toEqual({ plan: "creator" });
});
```

- [x] **Step 2: Run the billing E2E and confirm it fails before UI wiring**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- billing-flow.spec.ts
```

Expected before implementation: FAIL if the Settings Billing page, usage copy, disabled payment buttons, or placeholder intent request is missing.

- [x] **Step 3: Add billing API client types**

In `apps/web/src/features/worlddock/api.ts`, ensure these types exist:

```ts
export type BillingPlaceholderIntent = {
  id: string;
  userId: string;
  accountId: string;
  plan: string;
  source: string;
  status: "captured";
  createdAt: string;
};

export type BillingUsage = {
  balance: BillingBalance;
  lastAgentRun: {
    agentRunId: string;
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
    costCents: number;
    createdAt: string;
  } | null;
  entries: UsageLedgerEntry[];
  placeholderIntents?: BillingPlaceholderIntent[];
};
```

Ensure these functions exist:

```ts
export async function getBillingUsage(options: ApiClientOptions): Promise<{ usage: BillingUsage }> {
  return requestJson("/v1/billing/usage", {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function captureBillingPlaceholderIntent(
  input: { plan: "creator" | "studio" | "team" },
  options: ApiClientOptions,
): Promise<{ intent: BillingPlaceholderIntent }> {
  return requestJson("/v1/billing/placeholder-intents", {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}
```

- [x] **Step 4: Implement the billing page**

Create or verify `apps/web/src/features/billing/billing-page.tsx`:

```tsx
import type { BillingUsage } from "../worlddock/api";
import { Icon } from "../worlddock/components";
import { PricingPage } from "./pricing-page";

type BillingPageProps = {
  balanceCents: number;
  usage: BillingUsage | null;
  busy: boolean;
  onRefresh: () => void;
  onWaitlist: (plan: "creator" | "studio" | "team") => void;
};

export function BillingPage({ balanceCents, usage, busy, onRefresh, onWaitlist }: BillingPageProps) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="card" style={{ padding: 18 }}>
        <h2 className="title-font" style={{ marginTop: 0 }}>用量与余额</h2>
        <Metric label="当前 Alpha 余额" value={formatCents(usage?.balance.balanceCents ?? balanceCents)} />
        <Metric label="最近一次 Agent Run" value={formatLastAgentRun(usage)} />
        <Metric label="最近账本条目" value={usage ? `${usage.entries.length} 条` : "未同步"} />
        <div className="badge amber" style={{ justifyContent: "flex-start", height: 24 }}>
          余额低于 ¥5.00 时会拦截新的 Agent Run
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn ghost" disabled={busy} onClick={onRefresh}>
            <Icon name="refresh" size={12} /><span>{busy ? "同步中" : "刷新用量"}</span>
          </button>
        </div>
        {usage && usage.entries.length > 0 && (
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {usage.entries.slice(0, 8).map((entry) => (
              <div key={entry.id} className="row gap-2" style={{ justifyContent: "space-between", borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
                <span className="mono">{entry.type}</span>
                <span style={{ color: "var(--fg-2)" }}>{entry.reason ?? "账本记录"}</span>
                <span className="mono">{formatSignedCents(entry.amountCents)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <PricingPage onWaitlist={onWaitlist} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="row gap-2" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function formatCents(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatSignedCents(cents: number) {
  const prefix = cents > 0 ? "+" : "";
  return `${prefix}${formatCents(cents)}`;
}

function formatLastAgentRun(usage: BillingUsage | null) {
  if (!usage?.lastAgentRun) return "暂无真实记录";
  return `${usage.lastAgentRun.tokenUsage.totalTokens} tokens / ${formatCents(usage.lastAgentRun.costCents)}`;
}
```

- [x] **Step 5: Implement the waitlist-only pricing cards**

Create or verify `apps/web/src/features/billing/pricing-page.tsx`:

```tsx
import { Icon } from "../worlddock/components";

const PLANS = [
  { id: "creator", name: "Creator", price: "¥39 / 月", points: "轻量创作点包" },
  { id: "studio", name: "Studio", price: "¥99 / 月", points: "团队前的高频创作点包" },
  { id: "team", name: "Team", price: "联系开通", points: "多人协作与治理能力" },
] as const;

type PricingPageProps = {
  onWaitlist: (plan: typeof PLANS[number]["id"]) => void;
};

export function PricingPage({ onWaitlist }: PricingPageProps) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="badge amber" style={{ justifyContent: "flex-start", height: 24 }}>
        Beta 即将开放 · Alpha 不处理真实付款
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {PLANS.map((plan) => (
          <section key={plan.id} className="card" style={{ padding: 14 }}>
            <div className="row gap-2" style={{ justifyContent: "space-between" }}>
              <h3 className="title-font" style={{ margin: 0, fontSize: "var(--t-16)" }}>{plan.name}</h3>
              <span className="badge slate">Beta 即将开放</span>
            </div>
            <div className="mono" style={{ marginTop: 10, fontSize: 18 }}>{plan.price}</div>
            <p className="prose" style={{ fontSize: 13 }}>{plan.points}</p>
            <button className="btn primary" disabled style={{ width: "100%" }}>
              <Icon name="bolt" size={12} />
              <span>支付暂未开放</span>
            </button>
            <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => onWaitlist(plan.id)}>
              <Icon name="bell" size={12} />
              <span>加入候补</span>
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
```

- [x] **Step 6: Wire BillingPage into SettingsView**

In `apps/web/src/features/worlddock/view-settings.tsx`, ensure imports include:

```ts
import { BillingPage } from "../billing/billing-page";
import {
  captureBillingPlaceholderIntent,
  getBillingUsage,
  readStoredSessionToken,
  type BillingUsage,
} from "./api";
```

Ensure the billing state and refresh action exist:

```ts
const [billingUsage, setBillingUsage] = useState<BillingUsage | null>(null);
const [billingBusy, setBillingBusy] = useState(false);

const refreshBilling = useCallback(async () => {
  const session = sessionToken();
  if (!session) return;

  setBillingBusy(true);
  try {
    const result = await getBillingUsage({ sessionToken: session });
    setBillingUsage(result.usage);
  } catch {
    onToast({ kind: "warn", text: "云端用量同步失败" });
  } finally {
    setBillingBusy(false);
  }
}, [onToast, sessionToken]);

const joinBillingWaitlist = async (plan: "creator" | "studio" | "team") => {
  const session = sessionToken();
  if (!session) {
    onToast({ kind: "info", text: "已记录本地候补意向 · 登录后可同步" });
    return;
  }

  try {
    await captureBillingPlaceholderIntent({ plan }, { sessionToken: session });
    onToast({ kind: "save", text: "已加入 Beta 支付候补" });
    await refreshBilling();
  } catch {
    onToast({ kind: "warn", text: "候补登记失败 · 请稍后重试" });
  }
};
```

Ensure the billing tab renders:

```tsx
{tab === "billing" && (
  <BillingPage
    balanceCents={Math.round(balance * 100)}
    usage={billingUsage}
    busy={billingBusy}
    onRefresh={refreshBilling}
    onWaitlist={joinBillingWaitlist}
  />
)}
```

- [x] **Step 7: Keep the marketing pricing route waitlist-only**

In `apps/web/src/app/(marketing)/pricing/page.tsx`, keep public copy aligned with Alpha:

```tsx
<h1 className="title-font" style={{ fontSize: 44, margin: "0 0 12px", letterSpacing: 0 }}>
  Alpha 免费试用 / Beta 后开放付费
</h1>
<p className="prose" style={{ fontSize: 17 }}>
  Alpha 阶段不提供 Stripe 结账、客户门户或付费套餐映射。Beta 会在稳定后开放付费计划。
</p>
```

The page may track waitlist interest with product analytics, but it must not navigate to a checkout URL or customer portal.

- [x] **Step 8: Run Web verification**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- billing-flow.spec.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
```

Expected: Billing E2E passes; API/runtime tests still pass.

- [x] **Step 9: Commit Billing UI increment**

Run the identity guard commands from this plan, then:

```bash
git add apps/web/src/features/worlddock/api.ts apps/web/src/features/billing apps/web/src/features/worlddock/view-settings.tsx "apps/web/src/app/(marketing)/pricing/page.tsx" apps/web/tests/e2e/billing-flow.spec.ts
git commit -m "feat: add alpha billing UI"
git log -1 --format=fuller
```

Expected: latest commit author and committer are anonymous-safe.

### Task 5: Product Documentation And Phase Status

**Files:**
- Create or modify: `docs/product/beta-payments.md`
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [x] **Step 1: Rewrite Beta payments documentation in Simplified Chinese**

Replace `docs/product/beta-payments.md` with:

```md
# Beta 支付计划

Alpha 阶段不处理真实付款，也不把任何用户操作跳转到支付渠道。

Alpha 明确不包含：

- Stripe checkout。
- Stripe customer portal。
- Stripe webhook。
- 订阅状态同步。
- 发票和收据。
- 支付失败催缴。
- 生产税务、退款和争议处理策略。

Alpha 阶段已经保留的边界：

- 创作点余额由 WorldDock 内部 usage ledger 负责。
- Agent Run 成本由 provider、model、input tokens 和 output tokens 通过 price book 计算。
- 低余额时 API 会阻断新的 Agent Run。
- 支付相关按钮只用于 Beta 候补或反馈，不创建真实支付会话。

Beta 启动真实支付前，必须先补充独立执行计划，覆盖支付 provider、checkout session、customer portal、webhook 验签、订阅状态映射、发票、退款和失败重试。
```

- [x] **Step 2: Verify no real payment integration exists in runtime code**

Run:

```bash
rg -n "stripe|checkout|customer portal|webhook|createCheckout|billingPortal" apps packages
```

Expected: matches are either user-facing Alpha/Beta explanatory copy or none; there must be no Stripe SDK import, checkout route, webhook route, customer portal route, or server-side payment session creation.

- [x] **Step 3: Update Phase 7 status after verification commands pass**

After Task 6 verification succeeds, replace the Phase 7 section in `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` with:

```md
## Phase 7: 真实模型、创作点账本和支付 UI 占位

完成状态：已完成。

完成依据：

- `packages/domain/src/billing/price-book.ts` 已定义 Alpha 模型 price book，并按 provider、model、input tokens 和 output tokens 计算 Agent Run 成本。
- `apps/api/src/modules/billing/billing.service.ts` 已用 price book 替代 `totalTokens / 10` 简化计价，并保留 reserve、settle、refund 和低余额拦截语义。
- `apps/api/src/modules/agent/agent.service.ts` 已把 Agent Run 的 provider/model 传入 billing settlement；失败和取消路径会退回 reserve。
- `packages/db/prisma/schema.prisma` 与 `packages/db/prisma/migrations/20260527211500_billing_placeholder_intents/migration.sql` 已包含 `BillingPlaceholderIntent`。
- `apps/api/src/modules/billing/entitlements.service.ts`、`billing.controller.ts` 和 `prisma-billing.repository.ts` 已提供 Alpha entitlement、支付占位意向捕获和 usage 返回。
- `apps/web/src/features/billing/billing-page.tsx` 与 `pricing-page.tsx` 已展示 Alpha 余额、最近 Agent Run、账本条目、Beta 即将开放套餐和禁用支付按钮。
- `apps/web/src/features/worlddock/view-settings.tsx` 已在设置页接入 billing usage 刷新和 Beta 候补登记。
- `apps/web/src/app/(marketing)/pricing/page.tsx` 与 `docs/product/beta-payments.md` 已明确 Alpha 不处理真实付款，Stripe checkout、customer portal、webhook、订阅和发票推迟到 Beta。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test -- billing-price-book.spec.ts`：通过。
- `pnpm --filter @worlddock/api test:integration -- billing-alpha.integration-spec.ts agent.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- billing-flow.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 7 不包含真实 Stripe checkout、customer portal、webhook、订阅状态同步、发票、收据、税务、退款或支付失败催缴。
- 当前套餐按钮只用于 Beta 候补或产品反馈，不能创建真实支付会话。
```

- [x] **Step 4: Commit docs and status increment**

Run the identity guard commands from this plan, then:

```bash
git add docs/product/beta-payments.md docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
git commit -m "docs: mark phase 7 billing complete"
git log -1 --format=fuller
```

Expected: latest commit author and committer are anonymous-safe.

### Task 6: Full Phase 7 Verification

**Files:**
- Verify: all Phase 7 files listed in this plan.

- [x] **Step 1: Run targeted verification**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test -- billing-price-book.spec.ts
pnpm --filter @worlddock/api test:integration -- billing-alpha.integration-spec.ts agent.integration-spec.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- billing-flow.spec.ts
```

Expected:

- Prisma validates `BillingPlaceholderIntent`.
- Price book tests pass.
- Billing Alpha endpoints return closed Stripe/Beta payment entitlements and persist placeholder intents.
- Agent Run completion writes reserve and price-book settlement entries.
- Agent Run failure and cancellation refund reserve.
- Low balance returns `402` and `INSUFFICIENT_BALANCE`.
- Web Billing page shows Alpha balance, last run usage, ledger rows, disabled payment buttons, and posts a placeholder intent.

- [x] **Step 2: Run repo-wide verification**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: all repo lint, unit/integration test scripts under `pnpm test`, and builds pass.

- [x] **Step 3: Record exact command results**

Append the actual command results to the Phase 7 section of `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`. Use this wording only after the command has passed in the current execution run:

```md
- `<command>`：通过。
```

For any command that fails, keep Phase 7 as incomplete and add the failing command, failing test name, and error summary under a new “仍未完成” bullet in the Phase 7 section.

- [x] **Step 4: Final no-real-payment audit**

Run:

```bash
rg -n "Stripe|stripe|checkout|customer portal|webhook|subscription|invoice|billingPortal|createCheckout" apps packages docs/product/beta-payments.md
```

Expected:

- Runtime code under `apps` and `packages` has no server-side payment provider integration, checkout session creation, customer portal route, or webhook handler.
- User-facing copy may mention that Stripe checkout, customer portal, webhook, subscription, and invoices are deferred.
- `docs/product/beta-payments.md` may mention deferred payment scope.

- [x] **Step 5: Commit final verification status if it changed docs**

Run the identity guard commands from this plan, then:

```bash
git add docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
git commit -m "docs: record phase 7 verification"
git log -1 --format=fuller
```

Expected: latest commit author and committer are anonymous-safe.

## Self-Review Checklist

- Phase 7 price book has a shared domain source of truth and explicit unknown-model failure.
- Agent Run no longer uses `totalTokens / 10` as the source of billing truth.
- Reserve, settle and refund remain append-only usage ledger entries.
- Placeholder payment intents are persisted as Alpha waitlist signals only.
- Entitlements explicitly disable Beta payments and Stripe capabilities.
- Billing UI shows balance, latest run usage, ledger entries, disabled payment buttons and waitlist action.
- Product documentation is Simplified Chinese and says Alpha does not process real payments.
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` is updated only after verification commands pass.
- Commit steps include identity guard and post-commit author/committer verification.
