# Phase 9 Alpha 举报治理收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 完成 Phase 9，让 Alpha 用户可以举报公开仓库和创作者主页，系统具备最小反滥用限流、人工治理 runbook、无管理后台承诺和可复跑验收证据。

**Architecture:** 举报主路径由 Web 的共享 `ReportDialog` 发起，通过 `apps/web/src/features/worlddock/api.ts` 调用 Nest API 的两个用户向 POST endpoint；`ModerationService` 负责目标校验、按 reporter + target + UTC day 幂等去重和重复举报阈值扫描 outbox。限流集中在 `apps/api/src/common/security.ts`，IP 在全局请求钩子限流，认证主体在 `WorldDockAuthGuard` 中按 user/access-token + route family 限流，生产优先使用 Redis 共享计数，未配置 Redis 时保持本地开发可用的内存 fallback。

**Tech Stack:** TypeScript、React、Next.js App Router、Radix Dialog、NestJS、Fastify、Prisma、Redis/ioredis、BullMQ、Vitest、Playwright、pnpm workspace。

---

## 来源和当前基线

来源记录：

- `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md` 的 Phase 9。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 9 未完成清单。

当前工作区已出现 Phase 9 相关文件，执行时先验收，不要按旧清单盲目新增同名文件：

- `docs/operations/alpha_moderation_runbook.md`
- `docs/product/beta-admin-dashboard.md`
- `apps/web/src/features/community/report-dialog.tsx`
- `apps/api/test/alpha-moderation.integration-spec.ts`
- `apps/web/tests/e2e/report-flow.spec.ts`
- `apps/api/src/modules/moderation/moderation.controller.ts`
- `apps/api/src/modules/moderation/moderation.service.ts`
- `apps/api/src/common/security.ts`
- `apps/worker/src/moderation-scan.ts`

执行原则：

- 先跑 Phase 9 定向验收；若已经通过，进入文档语言收口和完成记录更新。
- 若定向验收失败，按下面任务逐项修复，不重构 Phase 8 社区页面或 Phase 6 Fork 同步逻辑。
- Alpha 只允许用户举报和人工治理 runbook，不新增 `/v1/admin/*` HTTP route、Web 管理页面或审核工作台。
- 文档内容使用简体中文。

## 文件结构

- 修改：`packages/domain/src/moderation/index.ts`
  - 固定举报 reason、target type、detail 最小长度和审核动作 schema。
- 修改：`packages/db/prisma/schema.prisma`
  - 确保 `Report` 支持 `targetType`、`targetId`、nullable `repositoryId` 和 reporter + target + createdAt 查询索引。
- 修改：`apps/api/src/modules/moderation/moderation.repository.ts`
  - 暴露创建举报、按 reporter + target + day 查询、按 target 统计 open reports 的 repository contract。
- 修改：`apps/api/src/modules/moderation/prisma-moderation.repository.ts`
  - 用 Prisma 实现举报幂等查询和 target 统计。
- 修改：`apps/api/src/modules/moderation/moderation.controller.ts`
  - 只提供仓库举报和创作者主页举报两个认证 POST endpoint。
- 修改：`apps/api/src/modules/moderation/moderation.service.ts`
  - 集中实现目标可见性校验、UTC day 幂等、重复举报阈值 outbox 和 scan flag 支持。
- 修改：`apps/api/src/common/security.ts`
  - 使用 Redis-backed rate limit store、route family key、IP/user/access-token 组合键和内存 fallback。
- 修改：`apps/api/src/modules/auth/auth.guard.ts`
  - 在认证成功和 scope 校验后执行 subject rate limit。
- 修改：`apps/worker/src/moderation-scan.ts`
  - 让重复举报阈值进入 moderation scan findings，并通过 outbox 进入 BullMQ。
- 修改：`apps/web/src/features/worlddock/api.ts`
  - 增加 repository report 和 creator profile report API client。
- 修改：`apps/web/src/features/worlddock/api.test.ts`
  - 覆盖举报 API client 请求路径、method、body 和 bearer token。
- 修改：`apps/web/src/features/community/report-dialog.tsx`
  - 提供 reason 选择、detail 最小长度、提交中/成功/失败状态和 Alpha 人工处理反馈。
- 修改：`apps/web/src/features/community/repository-detail-page.tsx`
  - 在 Repository Detail 中接入仓库举报弹窗。
- 修改：`apps/web/src/features/community/creator-profile-page.tsx`
  - 在 Creator Profile 中接入创作者举报弹窗。
- 修改：`apps/web/src/features/worlddock/view-community.tsx`
  - 从社区主视图向 Repository Detail 传入 `reportRepository` 行为。
- 修改：`docs/operations/alpha_moderation_runbook.md`
  - 写成简体中文 Alpha 人工治理 runbook。
- 修改：`docs/product/beta-admin-dashboard.md`
  - 写成简体中文 Beta 管理后台边界说明。
- 修改：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  - 验收通过后把 Phase 9 标记为完成并记录命令证据。
- 测试：`apps/api/test/alpha-moderation.integration-spec.ts`
- 测试：`apps/web/tests/e2e/report-flow.spec.ts`
- 测试：`apps/worker/test/moderation-scan.test.ts`

## 任务 1：运行 Phase 9 基线验收

**文件：**
- 读取：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- 读取：`docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- 运行：Phase 9 定向测试和静态搜索命令

- [x] **步骤 1：确认 Phase 9 主计划验收点**

运行：

```bash
sed -n '2216,2310p' docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md
sed -n '244,270p' docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

预期：主计划要求 repository report、creator profile report、reason categories、detail 最小长度、reporter + target + day 幂等、成功状态、无 admin route、无 admin dashboard、Redis-backed rate limit。

- [x] **步骤 2：运行后端举报与限流验收**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- alpha-moderation.integration-spec.ts
```

预期：PASS。若失败，继续任务 2 和任务 4。

- [x] **步骤 3：运行前端举报流程验收**

运行：

```bash
pnpm --filter @worlddock/web test:e2e -- report-flow.spec.ts
```

预期：PASS。若失败，继续任务 3。

- [x] **步骤 4：运行 Worker 审核扫描验收**

运行：

```bash
pnpm --filter @worlddock/worker test -- moderation-scan.test.ts
```

预期：PASS。若失败，继续任务 5。

- [x] **步骤 5：确认没有 Alpha 禁止的 HTTP 管理路由**

运行：

```bash
rg -n "admin/reports|@Get\\(\"admin|@Post\\(\"admin|/v1/admin/reports" apps/api/src apps/web/src
```

预期：无命中。若命中 controller 或 Web route，移除 HTTP route 和 UI 入口；纯历史文档或测试断言不算产品 route。

## 任务 2：收口后端举报 API、幂等和 schema

**文件：**
- 修改：`packages/domain/src/moderation/index.ts`
- 修改：`packages/db/prisma/schema.prisma`
- 修改：`apps/api/src/modules/moderation/moderation.repository.ts`
- 修改：`apps/api/src/modules/moderation/prisma-moderation.repository.ts`
- 修改：`apps/api/src/modules/moderation/moderation.controller.ts`
- 修改：`apps/api/src/modules/moderation/moderation.service.ts`
- 测试：`apps/api/test/alpha-moderation.integration-spec.ts`

- [x] **步骤 1：确认领域 schema 包含 Alpha 举报约束**

`packages/domain/src/moderation/index.ts` 应包含：

```ts
import { z } from "zod";

export const moderationStatusSchema = z.enum(["visible", "limited", "removed"]);
export const moderationActionSchema = z.enum(["keep", "limit", "remove", "scan_flagged"]);
export const reportStatusSchema = z.enum(["open", "resolved"]);
export const reportReasonSchema = z.enum(["spam", "sensitive_content", "abuse", "copyright", "other"]);
export const reportTargetTypeSchema = z.enum(["repository", "creator"]);

export const createReportSchema = z.object({
  reason: reportReasonSchema.default("other"),
  detail: z.string().trim().min(6).max(2000),
});

export const moderateReportSchema = z.object({
  action: z.enum(["keep", "limit", "remove"]),
  reason: z.string().min(1).max(2000),
});

export type ModerationStatus = z.infer<typeof moderationStatusSchema>;
export type ModerationAction = z.infer<typeof moderationActionSchema>;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type ReportReason = z.infer<typeof reportReasonSchema>;
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ModerateReportInput = z.infer<typeof moderateReportSchema>;
```

- [x] **步骤 2：确认 Prisma Report 支持 creator target 和幂等查询**

`packages/db/prisma/schema.prisma` 的 `Report` model 应包含：

```prisma
model Report {
  id           String           @id @default(cuid())
  repositoryId String?
  reporterId   String
  targetType   String           @default("repository")
  targetId     String
  reason       String
  detail       String?
  status       String           @default("open")
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  repository   PublicRepository? @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  reporter     User             @relation(fields: [reporterId], references: [id], onDelete: Cascade)
  actions      ModerationAction[]

  @@index([repositoryId, status])
  @@index([reporterId])
  @@index([targetType, targetId, status])
  @@index([reporterId, targetType, targetId, createdAt])
  @@index([status, createdAt])
  @@map("reports")
}
```

- [x] **步骤 3：确认 controller 只暴露两个用户举报 endpoint**

`apps/api/src/modules/moderation/moderation.controller.ts` 应保留：

```ts
@Controller()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post("repositories/:repositoryId/reports")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async report(
    @CurrentSubject() subject: AuthSubject,
    @Param("repositoryId") repositoryId: string,
    @Body() body: unknown,
  ) {
    return { report: await this.moderationService.reportRepository(subject, repositoryId, parseCreateReport(body)) };
  }

  @Post("community/creators/:handle/reports")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async reportCreator(
    @CurrentSubject() subject: AuthSubject,
    @Param("handle") handle: string,
    @Body() body: unknown,
  ) {
    return { report: await this.moderationService.reportCreator(subject, handle, parseCreateReport(body)) };
  }
}
```

同文件不得添加 `@Get("admin/reports")`、`@Post("admin/reports/:reportId/actions")` 或任何 `/v1/admin` route。

- [x] **步骤 4：确认 Service 使用 reporter + target + UTC day 幂等**

`apps/api/src/modules/moderation/moderation.service.ts` 的创建逻辑应包含：

```ts
private async createIdempotentReport(subject: AuthSubject, input: {
  repositoryId: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reason: CreateReportInput["reason"];
  detail: string;
}) {
  const { dayStart, dayEnd } = reportDayWindow(new Date());
  const existing = await this.moderation.findReportByReporterTargetOnDay({
    reporterId: subject.user.id,
    targetType: input.targetType,
    targetId: input.targetId,
    dayStart,
    dayEnd,
  });
  if (existing) return { record: existing, duplicate: true };

  const record = await this.moderation.createReport({
    repositoryId: input.repositoryId,
    reporterId: subject.user.id,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    detail: input.detail,
  });
  return { record, duplicate: false };
}
```

同文件的 UTC day window 应为：

```ts
function reportDayWindow(now: Date) {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  return { dayStart, dayEnd };
}
```

- [x] **步骤 5：确认重复举报阈值只为新举报创建 outbox**

`reportRepository` 中应包含：

```ts
const duplicateReportThreshold = 3;

async reportRepository(subject: AuthSubject, repositoryId: string, input: CreateReportInput) {
  const repository = await this.requireVisibleRepository(repositoryId);
  const report = await this.createIdempotentReport(subject, {
    repositoryId: repository.id,
    targetType: "repository",
    targetId: repository.id,
    reason: input.reason,
    detail: input.detail,
  });
  const openReportCount = await this.moderation.countOpenReportsForTarget("repository", repository.id);
  if (!report.duplicate && openReportCount >= duplicateReportThreshold) {
    await this.outbox.createEvent({
      type: "repository.moderation_scan_requested",
      aggregateId: repository.id,
      payload: {
        repositoryId: repository.id,
        reportId: report.record.id,
        source: "duplicate-report-threshold",
        openReportCount,
      },
    });
  }
  return this.toReportResponse(report.record);
}
```

- [x] **步骤 6：运行后端定向测试**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- alpha-moderation.integration-spec.ts
```

预期：PASS，覆盖 detail 过短 400、仓库举报 201、创作者举报 201、同日重复举报返回同一 report id、`/v1/admin/reports` 和 action route 为 404、rate limit key 行为。

## 任务 3：收口前端举报弹窗和社区入口

**文件：**
- 修改：`apps/web/src/features/worlddock/api.ts`
- 修改：`apps/web/src/features/worlddock/api.test.ts`
- 修改：`apps/web/src/features/community/report-dialog.tsx`
- 修改：`apps/web/src/features/community/repository-detail-page.tsx`
- 修改：`apps/web/src/features/community/creator-profile-page.tsx`
- 修改：`apps/web/src/features/worlddock/view-community.tsx`
- 测试：`apps/web/tests/e2e/report-flow.spec.ts`

- [x] **步骤 1：确认 API client 暴露两个举报函数**

`apps/web/src/features/worlddock/api.ts` 应包含：

```ts
export type ReportRepositoryInput = {
  reason: "spam" | "sensitive_content" | "abuse" | "copyright" | "other";
  detail: string;
};

export async function reportRepository(repositoryId: string, input: ReportRepositoryInput, options: ApiClientOptions) {
  return requestJson(`/v1/repositories/${repositoryId}/reports`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function reportCreatorProfile(handle: string, input: ReportRepositoryInput, options: ApiClientOptions) {
  return requestJson(`/v1/community/creators/${handle}/reports`, {
    method: "POST",
    sessionToken: options.sessionToken,
    body: input,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}
```

- [x] **步骤 2：确认 API client 单测覆盖请求 contract**

在 `apps/web/src/features/worlddock/api.test.ts` 中应包含 repository report 断言：

```ts
await reportRepository("repo_1", { reason: "other", detail: "复核这个世界。" }, { sessionToken: "session_valid", fetcher });

expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/v1/repositories/repo_1/reports", {
  method: "POST",
  headers: {
    authorization: "Bearer session_valid",
    "content-type": "application/json",
  },
  body: JSON.stringify({ reason: "other", detail: "复核这个世界。" }),
});
```

若缺少 creator report 单测，在同一个 describe 中追加：

```ts
it("reports creator profiles through the backend API", async () => {
  const fetcher = vi.fn(async () => jsonResponse({ report: { id: "report_creator", targetType: "creator", targetId: "ren" } }));

  await reportCreatorProfile("ren", { reason: "abuse", detail: "创作者主页需要人工复核。" }, { sessionToken: "session_valid", fetcher });

  expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/v1/community/creators/ren/reports", {
    method: "POST",
    headers: {
      authorization: "Bearer session_valid",
      "content-type": "application/json",
    },
    body: JSON.stringify({ reason: "abuse", detail: "创作者主页需要人工复核。" }),
  });
});
```

- [x] **步骤 3：确认 ReportDialog 有原因选择、最小长度和成功状态**

`apps/web/src/features/community/report-dialog.tsx` 应包含：

```tsx
const REASONS: Array<{ id: ReportRepositoryInput["reason"]; label: string }> = [
  { id: "spam", label: "垃圾内容" },
  { id: "sensitive_content", label: "敏感内容" },
  { id: "abuse", label: "骚扰或滥用" },
  { id: "copyright", label: "版权问题" },
  { id: "other", label: "其他" },
];

const detailTooShort = detail.trim().length < 6;
```

提交按钮应使用：

```tsx
<button className="btn primary" type="submit" disabled={detailTooShort || status === "submitting"}>
  提交举报
</button>
```

成功状态应显示：

```tsx
<span>Alpha 团队会人工处理</span>
```

- [x] **步骤 4：确认 Repository Detail 接入仓库举报**

`apps/web/src/features/community/repository-detail-page.tsx` 应包含：

```tsx
<ReportDialog
  targetLabel={`${repository.owner}/${repository.slug}`}
  onSubmit={onReport}
  trigger={<button className="sb-btn" type="button"><Icon name="flag" size={11} /><span>举报</span></button>}
/>
```

- [x] **步骤 5：确认 Creator Profile 接入创作者举报**

`apps/web/src/features/community/creator-profile-page.tsx` 应包含：

```tsx
<ReportDialog
  targetLabel={`@${handle}`}
  onSubmit={async (input) => {
    await reportCreatorProfile(handle, input, { sessionToken });
  }}
  trigger={<button className="btn" type="button"><Icon name="flag" size={12} /><span>举报</span></button>}
/>
```

- [x] **步骤 6：运行前端单测和举报 E2E**

运行：

```bash
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- report-flow.spec.ts
```

预期：PASS。E2E 应验证仓库举报和创作者主页举报都会提交正确路径和 body，并展示 `Alpha 团队会人工处理`。

## 任务 4：收口 Redis-backed rate limit 和认证主体组合键

**文件：**
- 修改：`apps/api/src/common/security.ts`
- 修改：`apps/api/src/modules/auth/auth.guard.ts`
- 测试：`apps/api/test/alpha-moderation.integration-spec.ts`

- [x] **步骤 1：确认 rate limit decision 类型和 store contract**

`apps/api/src/common/security.ts` 应包含：

```ts
export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitCounterStore = {
  increment(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
};
```

- [x] **步骤 2：确认 Redis store 以共享 key 自增并设置 TTL**

同文件应包含：

```ts
export function createRedisRateLimitStore(redisUrl = process.env.API_RATE_LIMIT_REDIS_URL ?? process.env.REDIS_URL): RateLimitCounterStore {
  if (!redisUrl) return createMemoryRateLimitStore();
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  return {
    async increment(key, windowMs, now) {
      const namespacedKey = `worlddock:rate-limit:${key}`;
      const count = await redis.incr(namespacedKey);
      if (count === 1) await redis.pexpire(namespacedKey, windowMs);
      const ttl = await redis.pttl(namespacedKey);
      return { count, resetAt: now + (ttl > 0 ? ttl : windowMs) };
    },
  };
}
```

- [x] **步骤 3：确认 IP、user、access-token 使用 route family key**

同文件应包含：

```ts
export function subjectRateLimitKeys(subject: AuthSubject, request: SecurityRequest) {
  const family = routeFamily(request);
  const keys = [`user:${subject.user.id}:route:${family}`];
  if (subject.kind === "access-token") keys.push(`access-token:${subject.accessTokenId}:route:${family}`);
  return keys;
}

function ipRateLimitKeys(request: SecurityRequest) {
  return [`ip:${clientIp(request)}:route:${routeFamily(request)}`];
}

function routeFamily(request: SecurityRequest) {
  const path = (request.raw?.url ?? request.url ?? "/").split("?")[0] ?? "/";
  if (path.includes("/reports")) return "reports";
  if (path.includes("/agent-runs")) return "agent-runs";
  if (path.startsWith("/v1/community")) return "community";
  if (path.startsWith("/v1/billing")) return "billing";
  if (path.startsWith("/v1/repositories")) return "repositories";
  if (path.startsWith("/v1/worlds")) return "worlds";
  return `${request.method ?? "GET"}:${path.split("/").slice(0, 4).join("/")}`;
}
```

- [x] **步骤 4：确认认证 guard 调用 subject rate limit**

`apps/api/src/modules/auth/auth.guard.ts` 应在 `assertScopes` 之后包含：

```ts
this.authService.assertScopes(subject, requiredScopes);
request.authSubject = subject;
await assertSubjectRateLimit(subject, request);
return true;
```

- [x] **步骤 5：运行限流相关验收**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- alpha-moderation.integration-spec.ts
```

预期：PASS，`subjectRateLimitKeys` 对 session 返回 `["user:user_1:route:reports"]`，对 access token 返回 user key 和 access-token key，`decideRateLimit` 在共享 store 内超过阈值后返回 `allowed: false`。

## 任务 5：收口 Worker 审核扫描和重复举报阈值

**文件：**
- 修改：`apps/worker/src/moderation-scan.ts`
- 测试：`apps/worker/test/moderation-scan.test.ts`

- [x] **步骤 1：确认重复举报阈值常量**

`apps/worker/src/moderation-scan.ts` 应包含：

```ts
export const DUPLICATE_REPORT_THRESHOLD = 3;
```

- [x] **步骤 2：确认 scan findings 包含重复举报阈值**

同文件的 `scanRepositoryForModeration` 应包含：

```ts
if (openReportCount >= DUPLICATE_REPORT_THRESHOLD) {
  findings.push("duplicate_report_threshold");
}
```

- [x] **步骤 3：确认 outbox 只入队 moderation scan event**

同文件的 `enqueuePendingModerationScanEvents` 应包含：

```ts
const events = (await outbox.listPending(limit))
  .filter((event) => event.type === "repository.moderation_scan_requested");
```

- [x] **步骤 4：运行 Worker 测试**

运行：

```bash
pnpm --filter @worlddock/worker test -- moderation-scan.test.ts
```

预期：PASS，覆盖敏感词、重复举报阈值和 moderation scan outbox 入队。

## 任务 6：收口 Alpha/Beta 治理文档语言和边界

**文件：**
- 修改：`docs/operations/alpha_moderation_runbook.md`
- 修改：`docs/product/beta-admin-dashboard.md`

- [x] **步骤 1：把 Alpha runbook 改为简体中文**

将 `docs/operations/alpha_moderation_runbook.md` 内容改为：

```md
# Alpha 人工治理 Runbook

Alpha 不包含管理后台、审核工作台或管理员 HTTP API。

运营人员通过数据库记录、服务日志和发布证据手动处理举报。所有人工处理都必须留下可追溯证据，不能直接在产品 UI 中进行隐式操作。

## 最小日常流程

- 每个工作日查看 `reports` 表中 `status = "open"` 的记录。
- 按 `targetType`、`targetId`、`reason`、`detail`、`createdAt` 聚合同一目标的举报。
- 对明显垃圾、仇恨、敏感泄露或侵权内容，使用受控数据库 migration 或一次性运营脚本更新公开仓库的 `moderationStatus`。
- 每次人工处理都记录操作者、时间、报告 id、目标 id、处理动作、原因和证据链接。
- 法务、隐私、支付或现实安全相关举报升级给产品负责人。

## Alpha 可用动作

- `keep`：内容保留可见，并在证据记录中说明原因。
- `limit`：将公开仓库设为 `limited`，用于需要临时限制传播但仍需复核的内容。
- `remove`：将公开仓库设为 `removed`，公开发现页和详情页不再展示。

## 明确不做

- 不提供 `/v1/admin/reports`。
- 不提供 Web 管理后台。
- 不提供审核队列 UI。
- 不提供管理员角色管理。

Beta 会用正式管理后台、审核队列、审计日志和权限模型替代这份人工 runbook。
```

- [x] **步骤 2：把 Beta admin dashboard 文档改为简体中文**

将 `docs/product/beta-admin-dashboard.md` 内容改为：

```md
# Beta 管理后台

Alpha 不实现管理后台。以下能力推迟到 Beta：

- 管理员举报队列。
- 用户和公开仓库管理页面。
- 审核动作：保留、限制、移除、恢复。
- 审核证据附件和审计日志 UI。
- 管理员角色、权限和访问审计。
- 举报处理通知和申诉工作流。

Alpha 期间只能通过 `docs/operations/alpha_moderation_runbook.md` 描述的人工流程处理明显问题。
```

- [x] **步骤 3：确认文档没有宣传 Alpha 管理后台**

运行：

```bash
rg -n "Alpha.*管理后台|/v1/admin/reports|moderation workbench|审核工作台" docs/product docs/operations apps/web/src
```

预期：只允许命中本计划、Alpha runbook 的“不提供”说明、Beta 延后说明或历史调查文档；不得命中产品 UI 文案。

## 任务 7：更新 Phase 9 完成记录

**文件：**
- 修改：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- 可选修改：`docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

- [x] **步骤 1：准备完成证据**

记录以下命令的通过结果：

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- alpha-moderation.integration-spec.ts
pnpm --filter @worlddock/worker test -- moderation-scan.test.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- report-flow.spec.ts
pnpm lint
pnpm test
pnpm build
rg -n "admin/reports|@Get\\(\"admin|@Post\\(\"admin|/v1/admin/reports" apps/api/src apps/web/src
```

预期：测试和构建全部通过；最后一个 `rg` 在产品源码中无命中。

- [x] **步骤 2：把 Phase 9 状态改为已完成**

在 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 中替换 Phase 9 小节为：

```md
## Phase 9: Alpha 举报、人工治理 Runbook 和反滥用

完成状态：已完成。

完成依据：

- `docs/operations/alpha_moderation_runbook.md` 已明确 Alpha 不提供管理后台、审核工作台或管理员 HTTP API，并给出人工处理举报的最小日常流程、可用动作、证据要求和升级规则。
- `docs/product/beta-admin-dashboard.md` 已把管理员举报队列、仓库/用户管理、审核动作 UI、审计日志、管理员角色和申诉工作流推迟到 Beta。
- `packages/domain/src/moderation/index.ts` 已定义举报原因、target type、状态、审核动作和 `detail` 最小长度。
- `packages/db/prisma/schema.prisma` 已支持 `Report.targetType`、`targetId`、nullable `repositoryId`，并提供 reporter + target + createdAt 查询索引。
- `apps/api/src/modules/moderation/*` 已提供仓库举报和创作者主页举报，按 reporter + target + UTC day 幂等去重，并在重复公开仓库举报达到阈值时写入 moderation scan outbox。
- `apps/api/src/modules/moderation/moderation.controller.ts` 只暴露用户举报 endpoint，不暴露 `/v1/admin/reports` 或审核 action HTTP route。
- `apps/api/src/common/security.ts` 已提供 Redis-backed rate limit store，并按 IP、user、access-token 与 route family 组合键限流；`WorldDockAuthGuard` 已在认证主路径执行 subject rate limit。
- `apps/worker/src/moderation-scan.ts` 已把重复举报阈值纳入审核扫描，并处理 `repository.moderation_scan_requested` outbox 入队。
- `apps/web/src/features/community/report-dialog.tsx`、`repository-detail-page.tsx` 和 `creator-profile-page.tsx` 已提供举报原因选择、说明最小长度、提交状态和 `Alpha 团队会人工处理` 成功反馈。
- `apps/web/src/features/worlddock/api.ts` 已提供 repository report 和 creator profile report API client。
- `apps/api/test/alpha-moderation.integration-spec.ts` 与 `apps/web/tests/e2e/report-flow.spec.ts` 已覆盖 Alpha 举报产品流。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test:integration -- alpha-moderation.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/worker test -- moderation-scan.test.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- report-flow.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。
- `rg -n "admin/reports|@Get\\(\"admin|@Post\\(\"admin|/v1/admin/reports" apps/api/src apps/web/src`：通过，产品源码无命中。

剩余说明：

- Phase 9 不实现真实管理后台、管理员角色管理、申诉系统、通知闭环或法务工作流。
- Alpha 人工处理仍依赖数据库记录、服务日志和发布证据；Beta 再引入正式审核队列、审计日志 UI 和权限模型。
```

- [x] **步骤 3：若主计划 Phase 9 checkbox 状态需要同步，记录证据**

如果执行团队使用 `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md` 作为总控 checklist，则在 Phase 9 下补充一行：

```md
完成证据见 `docs/superpowers/plans/2026-05-31-phase-9-alpha-moderation-completion.md` 和 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`。
```

## 任务 8：最终全量验证

**文件：**
- 运行：workspace 验证命令

- [x] **步骤 1：验证 Prisma schema**

运行：

```bash
pnpm --filter @worlddock/db prisma:validate
```

预期：PASS。

- [x] **步骤 2：验证 Phase 9 定向测试**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- alpha-moderation.integration-spec.ts
pnpm --filter @worlddock/worker test -- moderation-scan.test.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- report-flow.spec.ts
```

预期：全部 PASS。

- [x] **步骤 3：验证全仓库质量门禁**

运行：

```bash
pnpm lint
pnpm test
pnpm build
```

预期：全部 PASS。

- [x] **步骤 4：验证 Alpha 禁止项**

运行：

```bash
rg -n "admin/reports|@Get\\(\"admin|@Post\\(\"admin|/v1/admin/reports" apps/api/src apps/web/src
rg -n "后端接入后|占位|mock|fixture" apps/web/src/features/community apps/web/tests/e2e/report-flow.spec.ts apps/api/test/alpha-moderation.integration-spec.ts
```

预期：第一条在产品源码中无命中；第二条无命中。测试中的 route mock 不使用 `mock` 文字不作为失败条件，若命中真实产品 fixture fallback，需要修复。

## 自检

- Spec 覆盖：本计划覆盖仓库举报、创作者主页举报、reason categories、detail 最小长度、重复举报幂等、成功状态、无 admin route/dashboard/workbench、人工治理 runbook、Beta 管理后台延后、Redis-backed rate limit、Worker 重复举报阈值和验收测试。
- 占位扫描：本文未保留空白任务、未定义修复项或空泛实现说明。
- 类型一致性：`ReportRepositoryInput["reason"]`、`CreateReportInput["reason"]`、`ReportTargetType`、`RateLimitDecision`、`RateLimitCounterStore`、`reportRepository`、`reportCreatorProfile` 命名与当前代码边界一致。
