# Phase 11 站内通知活动流与反馈入口收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Phase 11，让 Alpha 用户在产品内看到站内通知、活动流和反馈入口，并保证发布、Fork、Agent 失败、低余额、举报、反馈和 Beta 支付候补事件不会依赖邮件投递。

**Architecture:** 继续复用现有 `NotificationsModule` 作为站内通知、活动事件和 Alpha 反馈的 API 边界；Prisma 新增 `activity_events` 表，通知表保持 unread/read 语义，活动流保持只读时间线语义。跨模块事件由应用服务在业务成功后同步调用 `NotificationsService.emitUserEvent()` 记录通知和活动，Alpha 不引入邮件 worker、邮箱验证或外部客服系统。Web 在设置页新增通知反馈 tab，集中挂载通知中心、活动流和反馈表单。

**Tech Stack:** TypeScript、Zod、NestJS、Prisma、React、Next.js App Router、Vitest、Playwright、pnpm workspace。

---

## 来源和当前基线

来源记录：

- `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md` 的 Phase 11。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 11 未完成清单。

当前工作区已经出现 Phase 11 的一部分文件，执行时不要按旧清单盲目新增同名文件：

- `packages/domain/src/notifications/index.ts`
- `packages/db/prisma/migrations/20260527225000_notifications_support/migration.sql`
- `apps/api/src/modules/notifications/notifications.controller.ts`
- `apps/api/src/modules/notifications/notifications.service.ts`
- `apps/api/src/modules/notifications/notifications.module.ts`
- `apps/api/test/notifications.integration-spec.ts`
- `apps/web/src/features/notifications/notification-center.tsx`
- `apps/web/src/features/support/support-entry.tsx`
- `docs/product/beta-email.md`

当前缺口：

- 站内通知 API 已有最小 list、mark read、support feedback，但还没有 `GET /v1/activity` 活动流。
- `NotificationCenter` 和 `SupportEntry` 还没有接入主 app 页面。
- 发布成功、Fork、Agent 失败、低余额、举报收到、Beta 支付候补登记等业务事件还没有统一投递通知和活动。
- `notifications.integration-spec.ts` 只覆盖欢迎通知、mark read 和反馈 context，还没有覆盖活动流与跨模块事件。
- 缺少前端 E2E 覆盖通知中心未读数、mark read、活动流和反馈入口。

执行原则：

- 站内通知和活动流是 Alpha 产品内能力；不要新增邮件发送、邮箱验证、密码找回邮件或邮件队列。
- 通知用于需要用户处理或知晓的事件，支持 unread/read；活动流用于只读历史时间线，不需要 read state。
- 所有投递必须有 `dedupeKey`，重复业务事件不能刷屏。
- 支持反馈必须保存用户输入、页面上下文和当前世界上下文；Alpha 成功反馈只说明团队会人工处理。
- 文档内容使用简体中文。

## 文件结构

- 修改：`packages/domain/src/notifications/index.ts`
  - 增加 activity target、activity event schema 和导出类型。
- 修改：`packages/db/prisma/schema.prisma`
  - 新增 `ActivityEvent` model，并在 `User` 上增加 `activityEvents` relation。
- 创建：`packages/db/prisma/migrations/20260601090000_phase11_activity_events/migration.sql`
  - 创建 `activity_events` 表、唯一键和查询索引。
- 修改：`apps/api/src/modules/notifications/notifications.service.ts`
  - 扩展 repository contract、Prisma repository、`emitUserEvent()`、`listActivity()` 和 support feedback 投递逻辑。
- 修改：`apps/api/src/modules/notifications/notifications.controller.ts`
  - 增加 `GET /v1/activity`。
- 修改：`apps/api/src/modules/notifications/notifications.module.ts`
  - 保持 service 和 repository export，供 Billing、Agent、Repository、Moderation 注入。
- 修改：`apps/api/src/modules/billing/billing.module.ts`
- 修改：`apps/api/src/modules/billing/billing.service.ts`
  - Beta 支付候补和低余额事件投递。
- 修改：`apps/api/src/modules/agent/agent.module.ts`
- 修改：`apps/api/src/modules/agent/agent.service.ts`
  - Agent Run 失败后投递事件。
- 修改：`apps/api/src/modules/repositories/repository.module.ts`
- 修改：`apps/api/src/modules/repositories/repository.service.ts`
  - Cloud 发布、Release 发布和 Fork 事件投递。
- 修改：`apps/api/src/modules/moderation/moderation.module.ts`
- 修改：`apps/api/src/modules/moderation/moderation.service.ts`
  - 举报收到事件投递。
- 修改：`apps/web/src/features/worlddock/api.ts`
  - 增加 `ActivityEvent` 类型导入、`listActivity()` client 和 notification/support 返回类型。
- 修改：`apps/web/src/features/notifications/notification-center.tsx`
  - 增加通知/活动分段视图、loading/error/empty 状态和可访问 mark read。
- 修改：`apps/web/src/features/support/support-entry.tsx`
  - 增加提交成功状态、最小长度提示和 context 保留。
- 修改：`apps/web/src/features/worlddock/view-settings.tsx`
  - 新增 `通知反馈` tab，挂载通知中心和反馈入口。
- 测试：`apps/api/test/notifications.integration-spec.ts`
  - 扩展活动流、幂等事件、跨模块投递和无邮件边界断言。
- 创建：`apps/web/tests/e2e/notifications-support.spec.ts`
  - 覆盖通知中心、活动流、mark read 和反馈 context。
- 修改：`docs/product/beta-email.md`
  - 用简体中文明确 Alpha 不发送邮件，Beta 再做邮件能力。
- 修改：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  - 验收通过后把 Phase 11 标记为完成并记录命令证据。

## 任务 1：运行 Phase 11 基线调查

**文件：**
- 读取：`docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- 读取：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- 读取：Phase 11 当前代码文件

- [x] **步骤 1：确认 Phase 11 主计划验收点**

运行：

```bash
sed -n '2381,2470p' docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md
sed -n '306,328p' docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

预期：主计划要求通知类型、站内通知、活动流、Alpha 反馈入口、未读数、mark as read、无邮件投递和 `notifications.integration-spec.ts`。

- [x] **步骤 2：确认当前已存在文件**

运行：

```bash
test -f packages/domain/src/notifications/index.ts
test -f apps/api/src/modules/notifications/notifications.controller.ts
test -f apps/api/src/modules/notifications/notifications.service.ts
test -f apps/api/src/modules/notifications/notifications.module.ts
test -f apps/api/test/notifications.integration-spec.ts
test -f apps/web/src/features/notifications/notification-center.tsx
test -f apps/web/src/features/support/support-entry.tsx
test -f docs/product/beta-email.md
```

预期：所有命令退出码为 0。若缺失，先从当前计划对应任务创建，不使用旧静态结论覆盖已有实现。

- [x] **步骤 3：运行当前后端通知验收**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- notifications.integration-spec.ts
```

预期：记录当前通过或失败状态。即使通过，也继续后续任务，因为现有测试还没有覆盖活动流和跨模块事件。

- [x] **步骤 4：确认前端尚未接入通知反馈主路径**

运行：

```bash
rg -n "NotificationCenter|SupportEntry|listActivity|/v1/activity" apps/web/src apps/api/src
```

预期：执行前只能看到组件定义和通知 API；若 `SettingsView` 已经挂载通知反馈 tab，则执行任务 5 时只补缺失状态和测试。

## 任务 2：补齐 domain schema 和活动流数据表

**文件：**
- 修改：`packages/domain/src/notifications/index.ts`
- 修改：`packages/db/prisma/schema.prisma`
- 创建：`packages/db/prisma/migrations/20260601090000_phase11_activity_events/migration.sql`
- 验证：`pnpm --filter @worlddock/db prisma:validate`
- 验证：`pnpm --filter @worlddock/domain lint`

- [x] **步骤 1：扩展 notification domain contract**

将 `packages/domain/src/notifications/index.ts` 更新为包含以下 schema 和类型：

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
  "report_received",
  "support_feedback_submitted",
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

export const activityTargetTypeSchema = z.enum([
  "account",
  "agent_run",
  "billing",
  "fork",
  "release",
  "repository",
  "report",
  "support",
  "world",
]);

export const activityEventSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: notificationTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  targetType: activityTargetTypeSchema,
  targetId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type ActivityTargetType = z.infer<typeof activityTargetTypeSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;
```

- [x] **步骤 2：在 Prisma User 上增加活动流 relation**

在 `packages/db/prisma/schema.prisma` 的 `User` model 中加入：

```prisma
  activityEvents ActivityEvent[]
```

预期：`User` 已有 `notifications` 和 `supportFeedback`，新的 relation 与它们相邻。

- [x] **步骤 3：新增 ActivityEvent model**

在 `packages/db/prisma/schema.prisma` 中 `Notification` model 后加入：

```prisma
model ActivityEvent {
  id         String   @id @default(cuid())
  userId     String
  type       String
  title      String
  body       String
  targetType String
  targetId   String?
  metadata   Json
  dedupeKey  String?
  createdAt  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, dedupeKey])
  @@index([userId, createdAt])
  @@index([type, createdAt])
  @@index([targetType, targetId])
  @@map("activity_events")
}
```

- [x] **步骤 4：创建 migration SQL**

创建 `packages/db/prisma/migrations/20260601090000_phase11_activity_events/migration.sql`：

```sql
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activity_events_userId_dedupeKey_key" ON "activity_events"("userId", "dedupeKey");
CREATE INDEX "activity_events_userId_createdAt_idx" ON "activity_events"("userId", "createdAt");
CREATE INDEX "activity_events_type_createdAt_idx" ON "activity_events"("type", "createdAt");
CREATE INDEX "activity_events_targetType_targetId_idx" ON "activity_events"("targetType", "targetId");

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [x] **步骤 5：验证 Prisma 和 domain 类型**

运行：

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/domain lint
```

预期：两条命令 PASS。

## 任务 3：扩展 NotificationsService 和 Activity API

**文件：**
- 修改：`apps/api/src/modules/notifications/notifications.service.ts`
- 修改：`apps/api/src/modules/notifications/notifications.controller.ts`
- 修改：`apps/api/src/modules/notifications/notifications.module.ts`
- 测试：`apps/api/test/notifications.integration-spec.ts`

- [x] **步骤 1：扩展 service imports 和类型**

在 `apps/api/src/modules/notifications/notifications.service.ts` 顶部使用以下 import：

```ts
import { Inject, Injectable, NotFoundException, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import {
  activityTargetTypeSchema,
  notificationTypeSchema,
  type ActivityTargetType,
  type NotificationType,
} from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
```

在 `SupportFeedbackRecord` 后加入：

```ts
export type ActivityEventRecord = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetType: ActivityTargetType;
  targetId: string | null;
  metadata: Record<string, unknown>;
  dedupeKey: string | null;
  createdAt: Date;
};

export type UserEventInput = {
  type: NotificationType;
  title: string;
  body: string;
  targetType: ActivityTargetType;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey: string;
  notify?: boolean;
};
```

- [x] **步骤 2：扩展 repository contract**

将 `NotificationsRepository` 扩展为：

```ts
export type NotificationsRepository = {
  upsertNotification(input: Omit<NotificationRecord, "id" | "readAt" | "createdAt">): Promise<NotificationRecord>;
  listNotifications(userId: string): Promise<NotificationRecord[]>;
  markNotificationRead(userId: string, notificationId: string, readAt: Date): Promise<NotificationRecord | null>;
  createSupportFeedback(input: Omit<SupportFeedbackRecord, "id" | "status" | "createdAt">): Promise<SupportFeedbackRecord>;
  upsertActivityEvent(input: Omit<ActivityEventRecord, "id" | "createdAt">): Promise<ActivityEventRecord>;
  listActivityEvents(userId: string, limit: number): Promise<ActivityEventRecord[]>;
};
```

- [x] **步骤 3：增加 service 方法**

在 `NotificationsService` 中加入并调整现有方法：

```ts
async listActivity(subject: AuthSubject) {
  await this.ensureWelcome(subject);
  const activity = await this.repository.listActivityEvents(subject.user.id, 50);
  return { activity: activity.map(toActivityResponse) };
}

async submitFeedback(subject: AuthSubject, input: { message: string; context: Record<string, unknown> }) {
  const feedback = await this.repository.createSupportFeedback({
    userId: subject.user.id,
    message: input.message,
    context: input.context,
  });
  const event = await this.emitUserEvent(subject.user.id, {
    type: "support_feedback_submitted",
    title: "反馈已收到",
    body: "Alpha 团队会在产品节奏中处理这条反馈。",
    targetType: "support",
    targetId: feedback.id,
    metadata: { feedbackId: feedback.id, context: input.context },
    dedupeKey: `support-feedback:${feedback.id}`,
  });
  return { feedback: toFeedbackResponse(feedback), notification: event.notification };
}

async emitUserEvent(userId: string, input: UserEventInput) {
  const activity = await this.repository.upsertActivityEvent({
    userId,
    type: input.type,
    title: input.title,
    body: input.body,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
    dedupeKey: input.dedupeKey,
  });
  const notification = input.notify === false
    ? null
    : await this.createNotification(userId, {
        type: input.type,
        title: input.title,
        body: input.body,
        dedupeKey: input.dedupeKey,
      });
  return { activity: toActivityResponse(activity), notification: notification ? toNotificationResponse(notification) : null };
}

private async ensureWelcome(subject: AuthSubject) {
  await this.emitUserEvent(subject.user.id, {
    type: "welcome",
    title: "欢迎来到 WorldDock Alpha",
    body: "你的站内通知会显示发布、余额、反馈和协作事件。",
    targetType: "account",
    targetId: subject.user.id,
    metadata: {},
    dedupeKey: `welcome:${subject.user.id}`,
  });
}
```

保留现有 `list()`、`markRead()` 和 `createNotification()` 行为。

- [x] **步骤 4：实现 Prisma activity repository**

在 `PrismaNotificationsRepository` 中加入：

```ts
async upsertActivityEvent(input: Parameters<NotificationsRepository["upsertActivityEvent"]>[0]) {
  const activity = input.dedupeKey
    ? await this.prisma.activityEvent.upsert({
        where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
        create: input,
        update: {
          type: input.type,
          title: input.title,
          body: input.body,
          targetType: input.targetType,
          targetId: input.targetId,
          metadata: input.metadata,
        },
      })
    : await this.prisma.activityEvent.create({ data: input });
  return mapActivity(activity);
}

async listActivityEvents(userId: string, limit: number) {
  const events = await this.prisma.activityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return events.map(mapActivity);
}
```

在文件底部加入 mapper：

```ts
function mapActivity(record: {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  dedupeKey: string | null;
  createdAt: Date;
}): ActivityEventRecord {
  return {
    ...record,
    type: notificationTypeSchema.parse(record.type),
    targetType: activityTargetTypeSchema.parse(record.targetType),
    metadata: record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata as Record<string, unknown>
      : {},
  };
}

function toActivityResponse(activity: ActivityEventRecord) {
  return {
    id: activity.id,
    userId: activity.userId,
    type: activity.type,
    title: activity.title,
    body: activity.body,
    targetType: activity.targetType,
    targetId: activity.targetId,
    metadata: activity.metadata,
    createdAt: activity.createdAt.toISOString(),
  };
}
```

- [x] **步骤 5：增加 Activity controller endpoint**

在 `apps/api/src/modules/notifications/notifications.controller.ts` 的 controller 中加入：

```ts
@Get("activity")
@RequireScopes("world:read")
listActivity(@CurrentSubject() subject: AuthSubject) {
  return this.notifications.listActivity(subject);
}
```

同时将 `feedbackSchema` 的 context 类型固定为对象：

```ts
const feedbackSchema = z.object({
  message: z.string().trim().min(6).max(2000),
  context: z.record(z.string(), z.unknown()).default({}),
});
```

- [x] **步骤 6：运行通知 API 定向验收**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- notifications.integration-spec.ts
```

预期：若测试尚未更新会失败，继续任务 6；若已经更新则 PASS。

## 任务 4：接入业务事件投递

**文件：**
- 修改：`apps/api/src/modules/billing/billing.module.ts`
- 修改：`apps/api/src/modules/billing/billing.service.ts`
- 修改：`apps/api/src/modules/agent/agent.module.ts`
- 修改：`apps/api/src/modules/agent/agent.service.ts`
- 修改：`apps/api/src/modules/repositories/repository.module.ts`
- 修改：`apps/api/src/modules/repositories/repository.service.ts`
- 修改：`apps/api/src/modules/moderation/moderation.module.ts`
- 修改：`apps/api/src/modules/moderation/moderation.service.ts`

- [x] **步骤 1：让 BillingModule 可投递通知**

在 `apps/api/src/modules/billing/billing.module.ts` 中加入 `NotificationsModule`：

```ts
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BillingController],
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
})
export class BillingModule {}
```

- [x] **步骤 2：在 BillingService 投递低余额和 Beta 支付候补事件**

在 `apps/api/src/modules/billing/billing.service.ts` 顶部加入：

```ts
import { NotificationsService } from "../notifications/notifications.service";
```

构造函数改为：

```ts
constructor(
  @Inject(BILLING_REPOSITORY) private readonly billing: BillingRepository,
  private readonly notifications: NotificationsService,
) {}
```

在 `settleAgentRunAndUpdateStatus()` 成功创建 terminal entry 后加入：

```ts
if (terminalEntry?.type === "model_run_settled") {
  await this.emitLowBalanceIfNeeded(userId, agentRunId);
}
```

在 `capturePlaceholderIntent()` 中改为：

```ts
async capturePlaceholderIntent(userId: string, plan: string) {
  const account = await this.ensureAccount(userId);
  const intent = await this.billing.createPlaceholderIntent({
    accountId: account.id,
    userId,
    plan,
    source: "alpha_ui",
  });
  await this.notifications.emitUserEvent(userId, {
    type: "billing_placeholder_clicked",
    title: "Beta 支付候补已记录",
    body: `你已登记 ${plan} 方案，Alpha 阶段不会发起真实扣款。`,
    targetType: "billing",
    targetId: intent.id,
    metadata: { plan, intentId: intent.id },
    dedupeKey: `billing-placeholder:${intent.id}`,
  });
  return intent;
}
```

在 class 内加入：

```ts
private async emitLowBalanceIfNeeded(userId: string, agentRunId: string) {
  const balance = await this.getBalance(userId);
  if (balance.balanceCents > balance.lowBalanceThresholdCents) return;
  await this.notifications.emitUserEvent(userId, {
    type: "low_balance",
    title: "创作点余额偏低",
    body: `当前余额为 ¥${(balance.balanceCents / 100).toFixed(2)}，Alpha 阶段不会自动扣款。`,
    targetType: "billing",
    targetId: agentRunId,
    metadata: { balanceCents: balance.balanceCents, lowBalanceThresholdCents: balance.lowBalanceThresholdCents },
    dedupeKey: `low-balance:${userId}`,
  });
}
```

- [x] **步骤 3：让 AgentModule 可投递通知**

在 `apps/api/src/modules/agent/agent.module.ts` 中加入：

```ts
import { NotificationsModule } from "../notifications/notifications.module";
```

并把 module imports 改为：

```ts
imports: [AuthModule, BillingModule, NotificationsModule, WorldsModule],
```

- [x] **步骤 4：在 AgentService 失败路径投递事件**

在 `apps/api/src/modules/agent/agent.service.ts` 顶部加入：

```ts
import { NotificationsService } from "../notifications/notifications.service";
```

构造函数加入：

```ts
private readonly notifications: NotificationsService,
```

在 catch 分支成功退款后、append `run.failed` 前加入：

```ts
await this.notifications.emitUserEvent(run.userId, {
  type: "agent_run_failed",
  title: "Agent Run 失败",
  body: failure.message,
  targetType: "agent_run",
  targetId: run.id,
  metadata: { code: failure.code, reason: failure.reason, worldId: run.worldId },
  dedupeKey: `agent-run-failed:${run.id}`,
});
```

- [x] **步骤 5：让 RepositoryModule 可投递通知**

在 `apps/api/src/modules/repositories/repository.module.ts` 中加入：

```ts
import { NotificationsModule } from "../notifications/notifications.module";
```

并把 module imports 改为：

```ts
imports: [AuthModule, BillingModule, NotificationsModule, OutboxModule, WorldsModule],
```

- [x] **步骤 6：在 RepositoryService 投递发布和 Fork 事件**

在 `apps/api/src/modules/repositories/repository.service.ts` 顶部加入：

```ts
import { NotificationsService } from "../notifications/notifications.service";
```

构造函数加入：

```ts
private readonly notifications: NotificationsService,
```

在 `publishWorld()` 创建 snapshot、更新 world、写 outbox 后加入：

```ts
await this.notifications.emitUserEvent(subject.user.id, {
  type: "world_published",
  title: "世界已发布",
  body: `${world.name} 已发布到界仓。`,
  targetType: "world",
  targetId: world.id,
  metadata: { repositoryId: repository.id, releaseId: release.id },
  dedupeKey: `world-published:${release.id}`,
});
await this.notifications.emitUserEvent(subject.user.id, {
  type: "release_published",
  title: "Release 已生成",
  body: `${repository.name} ${release.version} 已生成公开快照。`,
  targetType: "release",
  targetId: release.id,
  metadata: { repositoryId: repository.id, version: release.version },
  dedupeKey: `release-published:${release.id}`,
});
```

在 `forkRepository()` 完成 fork 后加入：

```ts
await this.notifications.emitUserEvent(subject.user.id, {
  type: "repository_forked",
  title: "Fork 已创建",
  body: `${repository.name} 已复制到你的世界列表。`,
  targetType: "fork",
  targetId: fork.id,
  metadata: { repositoryId: repository.id, worldId: world.id, sourceReleaseId: latestRelease.id },
  dedupeKey: `repository-forked:${fork.id}:actor`,
});
if (repository.ownerId !== subject.user.id) {
  await this.notifications.emitUserEvent(repository.ownerId, {
    type: "repository_forked",
    title: "你的仓库被 Fork",
    body: `${repository.name} 被一位 Alpha 用户 Fork。`,
    targetType: "repository",
    targetId: repository.id,
    metadata: { forkId: fork.id, actorUserId: subject.user.id, sourceReleaseId: latestRelease.id },
    dedupeKey: `repository-forked:${fork.id}:owner`,
  });
}
```

- [x] **步骤 7：让 ModerationModule 可投递通知**

在 `apps/api/src/modules/moderation/moderation.module.ts` 中加入：

```ts
import { NotificationsModule } from "../notifications/notifications.module";
```

并把 module imports 改为：

```ts
imports: [AuthModule, NotificationsModule, OutboxModule, RepositoryModule],
```

- [x] **步骤 8：在 ModerationService 举报成功后投递 report_received**

在 `apps/api/src/modules/moderation/moderation.service.ts` 顶部加入：

```ts
import { NotificationsService } from "../notifications/notifications.service";
```

构造函数加入：

```ts
private readonly notifications: NotificationsService,
```

在 `reportRepository()` 和 `reportCreator()` 拿到 `report` 后、返回前加入：

```ts
await this.notifications.emitUserEvent(subject.user.id, {
  type: "report_received",
  title: "举报已收到",
  body: "Alpha 团队会按人工治理 runbook 处理这条举报。",
  targetType: "report",
  targetId: report.record.id,
  metadata: { targetType: report.record.targetType, targetId: report.record.targetId, duplicate: report.duplicate },
  dedupeKey: `report-received:${report.record.id}`,
});
```

- [x] **步骤 9：运行受影响后端类型检查**

运行：

```bash
pnpm --filter @worlddock/api lint
```

预期：PASS。若出现 Nest module 循环，确认 `NotificationsModule` 没有 import Billing、Agent、Repository 或 Moderation。

## 任务 5：接入 Web 通知中心、活动流和反馈入口

**文件：**
- 修改：`apps/web/src/features/worlddock/api.ts`
- 修改：`apps/web/src/features/notifications/notification-center.tsx`
- 修改：`apps/web/src/features/support/support-entry.tsx`
- 修改：`apps/web/src/features/worlddock/view-settings.tsx`
- 验证：`pnpm --filter @worlddock/web lint`

- [x] **步骤 1：扩展 Web API client**

在 `apps/web/src/features/worlddock/api.ts` 的 domain import 中加入：

```ts
import type { ActivityEvent, Notification } from "@worlddock/domain";
```

在 `NotificationList` 后加入：

```ts
export type ActivityList = {
  activity: ActivityEvent[];
};
```

在 notification API 函数后加入：

```ts
export async function listActivity(options: ApiClientOptions): Promise<ActivityList> {
  return requestJson("/v1/activity", {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}
```

将 `submitSupportFeedback()` 返回类型改为：

```ts
): Promise<{ feedback: { id: string; message: string; context: Record<string, unknown>; status: "open" | "closed"; createdAt: string }; notification: Notification | null }> {
```

- [x] **步骤 2：把 NotificationCenter 改成通知和活动双视图**

用以下结构更新 `apps/web/src/features/notifications/notification-center.tsx`：

```tsx
import { useEffect, useState } from "react";
import type { ActivityEvent, Notification } from "@worlddock/domain";
import { listActivity, listNotifications, markNotificationRead } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type NotificationCenterProps = {
  sessionToken: string;
};

export function NotificationCenter({ sessionToken }: NotificationCenterProps) {
  const [tab, setTab] = useState<"notifications" | "activity">("notifications");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!sessionToken) {
      setNotifications([]);
      setActivity([]);
      setUnreadCount(0);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    Promise.all([
      listNotifications({ sessionToken }),
      listActivity({ sessionToken }),
    ])
      .then(([notificationResult, activityResult]) => {
        if (cancelled) return;
        setNotifications(notificationResult.notifications);
        setUnreadCount(notificationResult.unreadCount);
        setActivity(activityResult.activity);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  async function markRead(notification: Notification) {
    if (notification.readAt || !sessionToken) return;
    const result = await markNotificationRead(notification.id, { sessionToken });
    setNotifications((items) => items.map((item) => item.id === notification.id ? result.notification : item));
    setUnreadCount((count) => Math.max(0, count - 1));
  }

  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <div className="row gap-2">
          <Icon name="bell" size={13} />
          <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>通知与活动</span>
          <span className="badge slate" aria-label="未读通知数">{unreadCount}</span>
        </div>
        <div className="row gap-1">
          <button className={"sb-btn " + (tab === "notifications" ? "primary" : "")} onClick={() => setTab("notifications")}>通知</button>
          <button className={"sb-btn " + (tab === "activity" ? "primary" : "")} onClick={() => setTab("activity")}>活动</button>
        </div>
      </div>

      {status === "loading" ? <p className="prose" style={{ margin: "12px 0 0" }}>同步中...</p> : null}
      {status === "error" ? <p className="prose" style={{ margin: "12px 0 0", color: "var(--danger)" }}>通知同步失败。</p> : null}

      {tab === "notifications" ? (
        <div className="col" style={{ gap: 8, marginTop: 12 }}>
          {notifications.map((notification) => (
            <button
              key={notification.id}
              className="sb-btn"
              style={{ justifyContent: "flex-start", height: "auto", padding: 10, textAlign: "left" }}
              onClick={() => markRead(notification)}
            >
              <span className={"dot " + (notification.readAt ? "" : "sage")} />
              <span className="col" style={{ gap: 2 }}>
                <span>{notification.title}</span>
                <span style={{ color: "var(--fg-2)", fontSize: "var(--t-12)" }}>{notification.body}</span>
              </span>
            </button>
          ))}
          {notifications.length === 0 && status !== "loading" ? <p className="prose" style={{ margin: 0 }}>暂无通知。</p> : null}
        </div>
      ) : (
        <div className="col" style={{ gap: 8, marginTop: 12 }}>
          {activity.map((item) => (
            <div key={item.id} className="row gap-2" style={{ alignItems: "flex-start", borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
              <Icon name="history" size={13} />
              <span className="col" style={{ gap: 2 }}>
                <span>{item.title}</span>
                <span style={{ color: "var(--fg-2)", fontSize: "var(--t-12)" }}>{item.body}</span>
              </span>
            </div>
          ))}
          {activity.length === 0 && status !== "loading" ? <p className="prose" style={{ margin: 0 }}>暂无活动。</p> : null}
        </div>
      )}
    </section>
  );
}
```

- [x] **步骤 3：增强 SupportEntry 提交状态**

在 `apps/web/src/features/support/support-entry.tsx` 中加入成功状态：

```tsx
const [submitted, setSubmitted] = useState(false);
```

提交成功分支改为：

```tsx
await submitSupportFeedback({ message: message.trim(), context }, { sessionToken });
setMessage("");
setSubmitted(true);
onToast({ kind: "save", text: "反馈已提交" });
```

textarea 下方加入：

```tsx
{submitted ? <p className="prose" style={{ margin: "8px 0 0" }}>Alpha 团队会人工处理这条反馈。</p> : null}
```

- [x] **步骤 4：在设置页新增通知反馈 tab**

在 `apps/web/src/features/worlddock/view-settings.tsx` 顶部加入：

```ts
import { NotificationCenter } from "../notifications/notification-center";
import { SupportEntry } from "../support/support-entry";
```

tab 列表加入：

```ts
["notifications", "通知反馈"],
```

在内容区加入：

```tsx
{tab === "notifications" && (
  <section style={{ display: "grid", gap: 18 }}>
    <NotificationCenter sessionToken={sessionToken()} />
    <SupportEntry
      sessionToken={sessionToken()}
      context={{
        route: "/app/settings",
        mode,
        currentWorldId: currentWorld?.id ?? null,
        currentWorldName: currentWorld?.name ?? null,
      }}
      onToast={onToast}
    />
  </section>
)}
```

- [x] **步骤 5：运行 Web 类型和 lint 验收**

运行：

```bash
pnpm --filter @worlddock/web lint
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
```

预期：两条命令 PASS。

## 任务 6：扩展后端通知集成测试

**文件：**
- 修改：`apps/api/test/notifications.integration-spec.ts`

- [x] **步骤 1：扩展 in-memory repository**

在 `createInMemoryNotificationsRepository()` 中加入 `activity` 数组和两个方法：

```ts
const activity: ActivityEventRecord[] = [];
```

返回对象中加入：

```ts
activity,
async upsertActivityEvent(input: Omit<ActivityEventRecord, "id" | "createdAt">) {
  const existing = input.dedupeKey
    ? activity.find((event) => event.userId === input.userId && event.dedupeKey === input.dedupeKey)
    : null;
  if (existing) {
    existing.type = input.type;
    existing.title = input.title;
    existing.body = input.body;
    existing.targetType = input.targetType;
    existing.targetId = input.targetId;
    existing.metadata = input.metadata;
    return existing;
  }
  const record = { id: `activity_${activity.length + 1}`, createdAt: new Date(), ...input };
  activity.unshift(record);
  return record;
},
async listActivityEvents(userId: string, limit: number) {
  return activity.filter((event) => event.userId === userId).slice(0, limit);
},
```

并在 import 中加入：

```ts
type ActivityEventRecord,
```

- [x] **步骤 2：断言 activity endpoint 和欢迎事件幂等**

在现有测试的第二次通知列表断言后加入：

```ts
const activity = await request(app.getHttpServer())
  .get("/v1/activity")
  .set("authorization", "Bearer session_user_1")
  .expect(200);
expect(activity.body.activity).toHaveLength(1);
expect(activity.body.activity[0]).toMatchObject({
  type: "welcome",
  targetType: "account",
  targetId: "user_1",
});
```

- [x] **步骤 3：断言 support feedback 同时写入通知和活动**

在 feedback 断言后加入：

```ts
expect(notifications.activity.some((event) => {
  const context = event.metadata.context;
  return event.type === "support_feedback_submitted" &&
    event.targetType === "support" &&
    typeof context === "object" &&
    context !== null &&
    !Array.isArray(context) &&
    (context as Record<string, unknown>).route === "/settings";
})).toBe(true);
```

- [x] **步骤 4：增加 service 事件幂等测试**

新增测试：

```ts
it("records user events idempotently for notifications and activity", async () => {
  const auth = createInMemoryAuthRepository();
  const notifications = createInMemoryNotificationsRepository();
  addSession(auth, "session_user_1", "user_1", "ren");
  app = await createTestApp(auth, notifications);
  const service = app.get(NotificationsService);

  await service.emitUserEvent("user_1", {
    type: "world_published",
    title: "世界已发布",
    body: "潮汐之书 已发布到界仓。",
    targetType: "world",
    targetId: "world_1",
    metadata: { repositoryId: "repo_1", releaseId: "release_1" },
    dedupeKey: "world-published:release_1",
  });
  await service.emitUserEvent("user_1", {
    type: "world_published",
    title: "世界已发布",
    body: "潮汐之书 已发布到界仓。",
    targetType: "world",
    targetId: "world_1",
    metadata: { repositoryId: "repo_1", releaseId: "release_1" },
    dedupeKey: "world-published:release_1",
  });

  expect(notifications.notifications.filter((item) => item.dedupeKey === "world-published:release_1")).toHaveLength(1);
  expect(notifications.activity.filter((item) => item.dedupeKey === "world-published:release_1")).toHaveLength(1);
});
```

- [x] **步骤 5：运行后端通知集成测试**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- notifications.integration-spec.ts
```

预期：PASS。

## 任务 7：新增前端通知反馈 E2E

**文件：**
- 创建：`apps/web/tests/e2e/notifications-support.spec.ts`

- [x] **步骤 1：创建 E2E 文件**

创建 `apps/web/tests/e2e/notifications-support.spec.ts`：

```ts
import { expect, test, type Page } from "playwright/test";
import { gotoApp } from "./helpers";

test("creator reads notifications, sees activity, and submits alpha feedback with context", async ({ page }) => {
  const readRequests: string[] = [];
  const feedbackRequests: any[] = [];
  await setupNotificationsApi(page, readRequests, feedbackRequests);

  await gotoApp(page, { installMocks: false });
  await page.getByLabel("设置").click();
  await page.getByRole("button", { name: "通知反馈" }).click();

  await expect(page.getByLabel("未读通知数")).toHaveText("2");
  await expect(page.getByText("世界已发布")).toBeVisible();
  await page.getByText("世界已发布").click();
  await expect.poll(() => readRequests).toEqual(["notification_1"]);
  await expect(page.getByLabel("未读通知数")).toHaveText("1");

  await page.getByRole("button", { name: "活动" }).click();
  await expect(page.getByText("Release 已生成")).toBeVisible();
  await expect(page.getByText("Beta 支付候补已记录")).toBeVisible();

  await page.getByLabel("Alpha 反馈").fill("希望通知中心支持按世界筛选。");
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect.poll(() => feedbackRequests.length).toBe(1);
  expect(feedbackRequests[0]).toMatchObject({
    message: "希望通知中心支持按世界筛选。",
    context: {
      route: "/app/settings",
    },
  });
  await expect(page.getByText("Alpha 团队会人工处理这条反馈。")).toBeVisible();
});

async function setupNotificationsApi(page: Page, readRequests: string[], feedbackRequests: any[]) {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_notifications");
  });

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        worlds: [{
          id: "world_1",
          name: "通知之城",
          type: "城市奇幻",
          summary: "用于通知反馈测试的世界。",
          tags: ["通知"],
          maturity: 62,
          status: "published",
          visibility: "public",
          archive: 1,
          seeds: 0,
          conflicts: 0,
          updated: "2026-06-01T00:00:00.000Z",
          mode: "cloud",
        }],
      }),
    });
  });

  await page.route("**/v1/notifications", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        unreadCount: 2,
        notifications: [
          {
            id: "notification_1",
            userId: "user_1",
            type: "world_published",
            title: "世界已发布",
            body: "通知之城 已发布到界仓。",
            readAt: null,
            createdAt: "2026-06-01T00:00:00.000Z",
          },
          {
            id: "notification_2",
            userId: "user_1",
            type: "low_balance",
            title: "创作点余额偏低",
            body: "当前余额为 ¥4.20，Alpha 阶段不会自动扣款。",
            readAt: null,
            createdAt: "2026-06-01T00:01:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route("**/v1/activity", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        activity: [
          {
            id: "activity_1",
            userId: "user_1",
            type: "release_published",
            title: "Release 已生成",
            body: "通知之城 v1.0.0 已生成公开快照。",
            targetType: "release",
            targetId: "release_1",
            metadata: { repositoryId: "repo_1" },
            createdAt: "2026-06-01T00:00:00.000Z",
          },
          {
            id: "activity_2",
            userId: "user_1",
            type: "billing_placeholder_clicked",
            title: "Beta 支付候补已记录",
            body: "你已登记 creator 方案，Alpha 阶段不会发起真实扣款。",
            targetType: "billing",
            targetId: "intent_1",
            metadata: { plan: "creator" },
            createdAt: "2026-06-01T00:02:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route("**/v1/notifications/*/read", async (route) => {
    const id = route.request().url().split("/v1/notifications/")[1].split("/read")[0];
    readRequests.push(id);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        notification: {
          id,
          userId: "user_1",
          type: "world_published",
          title: "世界已发布",
          body: "通知之城 已发布到界仓。",
          readAt: "2026-06-01T00:03:00.000Z",
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      }),
    });
  });

  await page.route("**/v1/support/feedback", async (route) => {
    feedbackRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        feedback: {
          id: "feedback_1",
          userId: "user_1",
          message: feedbackRequests[0].message,
          context: feedbackRequests[0].context,
          status: "open",
          createdAt: "2026-06-01T00:04:00.000Z",
        },
        notification: {
          id: "notification_feedback",
          userId: "user_1",
          type: "support_feedback_submitted",
          title: "反馈已收到",
          body: "Alpha 团队会在产品节奏中处理这条反馈。",
          readAt: null,
          createdAt: "2026-06-01T00:04:00.000Z",
        },
      }),
    });
  });
}
```

- [x] **步骤 2：运行新增 E2E**

运行：

```bash
pnpm --filter @worlddock/web test:e2e -- notifications-support.spec.ts
```

预期：PASS。

## 任务 8：文档和完成记录收口

**文件：**
- 修改：`docs/product/beta-email.md`
- 修改：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [x] **步骤 1：把 Beta Email 文档改为简体中文**

将 `docs/product/beta-email.md` 更新为：

```md
# Beta 邮件能力

Cloud Alpha 不发送事务邮件或营销邮件。产品内只提供站内通知、活动流和 Alpha 反馈入口。

推迟到 Beta 的邮件能力：

- 邮箱注册验证
- 密码找回邮件
- 欢迎邮件
- 低余额邮件
- 支付失败邮件
- 发布成功邮件
- 审核动作邮件

Alpha 验收边界：

- 不新增 email worker。
- 不新增邮箱验证流程。
- 不新增邮件投递服务配置。
- 低余额、发布成功、举报收到和反馈收到都通过站内通知呈现。
```

- [x] **步骤 2：确认没有 Alpha 禁止的邮件实现**

运行：

```bash
rg -n "sendEmail|email worker|password reset|verify email|verification email|welcome email|mailgun|postmark|resend|smtp|nodemailer" apps packages docs/product/beta-email.md
```

预期：只允许命中 `docs/product/beta-email.md` 的 Beta 边界说明，不能命中产品邮件投递代码。

- [x] **步骤 3：更新 Phase 11 完成记录**

把 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 中 `## Phase 11: 站内通知、活动流和 Alpha 反馈入口` 到 `## Phase 12` 前的内容替换为：

```md
## Phase 11: 站内通知、活动流和 Alpha 反馈入口

完成状态：已完成。

完成依据：

- `packages/domain/src/notifications/index.ts` 已定义通知类型、活动目标类型、站内通知 schema 和活动事件 schema。
- `packages/db/prisma/schema.prisma` 与 `packages/db/prisma/migrations/20260601090000_phase11_activity_events/migration.sql` 已支持通知、活动流和 Alpha 反馈持久化。
- `apps/api/src/modules/notifications/*` 已提供 `GET /v1/notifications`、`POST /v1/notifications/:notificationId/read`、`GET /v1/activity` 和 `POST /v1/support/feedback`。
- `NotificationsService.emitUserEvent()` 已统一处理通知和活动幂等投递。
- Billing、Agent、Repository 和 Moderation 主路径已投递低余额、Agent Run 失败、世界发布、Release 发布、Repository Fork、举报收到和 Beta 支付候补登记事件。
- `apps/web/src/features/notifications/notification-center.tsx` 已提供未读数、mark as read、通知列表和活动流。
- `apps/web/src/features/support/support-entry.tsx` 已提供 Alpha 反馈入口，并保留 route、mode 和当前世界上下文。
- `apps/web/src/features/worlddock/view-settings.tsx` 已把通知中心、活动流和反馈入口接入设置页 `通知反馈` tab。
- `docs/product/beta-email.md` 已明确 Alpha 不发送事务邮件或营销邮件，邮箱验证、密码找回和邮件通知推迟到 Beta。
- `apps/api/test/notifications.integration-spec.ts` 与 `apps/web/tests/e2e/notifications-support.spec.ts` 已覆盖 Phase 11 主路径。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/domain lint`：通过。
- `pnpm --filter @worlddock/api test:integration -- notifications.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- notifications-support.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。
- `rg -n "sendEmail|email worker|password reset|verify email|verification email|welcome email|mailgun|postmark|resend|smtp|nodemailer" apps packages docs/product/beta-email.md`：通过，仅命中 Beta 邮件边界说明。

剩余说明：

- Phase 11 不实现邮件通知、邮箱注册验证、密码找回邮件、客服工单系统、通知偏好设置或实时 WebSocket 推送。
- Alpha 活动流为站内只读时间线，后续版本再引入筛选、聚合、通知偏好和外部投递渠道。
```

## 任务 9：最终验收

**文件：**
- 全仓验证

- [x] **步骤 1：运行 Phase 11 定向验收**

运行：

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/domain lint
pnpm --filter @worlddock/api test:integration -- notifications.integration-spec.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- notifications-support.spec.ts
```

预期：全部 PASS。

- [x] **步骤 2：运行全量回归门禁**

运行：

```bash
pnpm lint
pnpm test
pnpm build
```

预期：全部 PASS。

- [x] **步骤 3：执行邮件边界静态搜索**

运行：

```bash
rg -n "sendEmail|email worker|password reset|verify email|verification email|welcome email|mailgun|postmark|resend|smtp|nodemailer" apps packages docs/product/beta-email.md
```

预期：仅命中 `docs/product/beta-email.md` 的 Beta 边界说明；若命中产品代码，移除邮件能力或改为站内通知。

- [x] **步骤 4：检查 Phase11 完成记录**

运行：

```bash
sed -n '/## Phase 11:/,/## Phase 12:/p' docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

预期：Phase 11 显示完成状态、完成依据、验收证据和剩余说明。

- [x] **步骤 5：处理最终代码审查反馈**

完成：

- `POST /v1/support/feedback` 以反馈保存成功为主成功路径；通知/活动投递失败时记录异常并返回 `notification: null`，避免用户重试导致重复反馈。
- 设置页反馈提交成功后刷新通知中心和活动流，确保新反馈通知与活动不需要刷新页面才可见。
- `apps/api/test/notifications.integration-spec.ts` 覆盖反馈保存成功但通知投递失败的场景。
- `apps/web/tests/e2e/notifications-support.spec.ts` 覆盖反馈提交后通知与活动即时刷新。

验证：

```bash
pnpm --filter @worlddock/api test:integration -- notifications.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- notifications-support.spec.ts
pnpm lint
pnpm test
pnpm build
```

预期：全部 PASS。

## 自检清单

- [x] Phase 11 主计划中的 welcome、low balance、agent run failed、publish success、release published、report received、support feedback submitted、unread count、mark as read 均有实现和测试。
- [x] 活动流由 `activity_events` 表持久化，并通过 `GET /v1/activity` 返回当前用户自己的事件。
- [x] 所有业务投递都有 `dedupeKey`。
- [x] Web 主路径可以从设置页进入通知反馈，不依赖隐藏组件。
- [x] Alpha 反馈请求体保存 `message` 和 `context`。
- [x] 没有新增邮件发送、邮箱验证、密码找回邮件或邮件 worker。
- [x] `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 11 在验收通过后更新为完成。
