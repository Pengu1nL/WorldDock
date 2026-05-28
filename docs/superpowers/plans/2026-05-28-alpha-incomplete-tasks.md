# WorldDock Cloud Alpha 未完成任务调查记录

调查日期：2026-05-28

调查对象：`docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

## 结论

按“整项 Task 的文件、行为、测试和验收条件都满足才可勾选”的标准，本次调查没有发现可以安全标记为完成的 Alpha Task，因此未修改 Alpha 主计划中的 checkbox。

当前代码库已经具备一些早期后端能力，例如世界创建、档案/种子/冲突持久化、基础发布、Fork、用量账本、举报和 Worker 扫描雏形。但这些能力大多没有达到 Alpha 主计划定义的完整产品闭环、文件结构和验收测试要求。

## 判定标准

- 文件存在但未接入主链路，不视为完成。
- API 存在但路径、行为、权限或幂等性不符合计划，不视为完成。
- 前端有占位 UI 但仍使用本地状态、fixture 或手动 token，不视为完成。
- 缺少计划指定的集成测试、E2E 测试或验收命令证据，不视为完成。
- 某 Phase 内的部分能力已实现，只记录为“已有但不足”，不勾选该 Task。

## Phase 1: 生产工程闸门和环境基线

未完成：

- 缺少 `.github/workflows/ci.yml`。
- 缺少 `apps/api/Dockerfile`、`apps/web/Dockerfile`、`apps/worker/Dockerfile`。
- 缺少 `docs/operations/incident_runbook.md` 和 `docs/operations/queue_runbook.md`。
- `apps/web/next.config.ts` 仍在非开发环境设置 `output: "export"` 和 `assetPrefix: "."`，未移除生产静态导出假设。
- `packages/config/src/env.ts` 未实现计划中的生产门禁：`BETTER_AUTH_SECRET` 仍是 16 位最小长度，缺少 `BETTER_AUTH_URL`，未按计划拒绝 production mock/pi 配置缺失。
- `docs/operations/production_release_checklist.md` 仍是普通 checklist，没有 owner、evidence、command 结构。

已有但不足：

- `apps/api/test/system.integration-spec.ts` 存在并覆盖基础 health/readiness/metrics。
- API 和 Worker 已有部分 observability 代码。

## Phase 2: 个人账户认证、账户和 Onboarding

未完成：

- 缺少 `apps/web/src/app/(auth)/login/page.tsx`。
- 缺少 `apps/web/src/app/(auth)/register/page.tsx`。
- 缺少 `apps/web/src/app/(app)/onboarding/page.tsx`。
- 缺少 `apps/web/src/features/account/account-api.ts`。
- 缺少 `apps/web/src/features/onboarding/onboarding-flow.tsx`。
- 缺少 `apps/api/src/modules/account/*`。
- `packages/db/prisma/schema.prisma` 缺少 `UserProfile`。
- 前端仍通过 `window.localStorage.getItem("worlddock.sessionToken")` 手动读取 session token。
- 缺少 `apps/api/test/account.integration-spec.ts` 和 `apps/web/tests/e2e/auth-onboarding.spec.ts`。

已有但不足：

- Better Auth 配置文件存在：`apps/api/src/modules/auth/better-auth.ts`。
- API 已有 bearer session/access token 认证、`GET /v1/me`、`POST /v1/auth/logout` 和 access token 管理。
- Better Auth 登录注册端点未挂到可用路由，前端也没有登录入口。

## Phase 3: 云端部署版范围冻结和 Cloud-only 主路径

未完成：

- 缺少 `docs/product/cloud-release-scope.md`。
- 缺少 `docs/product/local-deployment-later.md`。
- 缺少 `docs/product/cloud-api-contract.md`。
- `packages/config/src/env.ts` 缺少 `WORLD_DOCK_EDITION` schema 和 production cloud edition 门禁。
- 前端仍手动读取 `worlddock.sessionToken`，未达到“不再依赖 Local 兜底/手动 token”的要求。
- 缺少 `apps/web/tests/e2e/cloud-deployment-flow.spec.ts`。

已有但不足：

- `apps/web/src/features/worlddock/runtime-no-mock.test.ts` 检查部分运行时文件不导入 mock fixture。
- API client 已集中在 `apps/web/src/features/worlddock/api.ts`，但认证状态来源仍未产品化。

## Phase 4: 云端世界 CRUD 和资产编辑器

未完成：

- 缺少 `apps/api/src/modules/world-assets/*`。
- 缺少 `packages/domain/src/assets/index.ts`。
- 缺少 `apps/web/src/features/worlds/worlds-api.ts`。
- 缺少 `apps/web/src/features/world-assets/asset-editor.tsx` 和 `asset-search.tsx`。
- 计划要求的统一资产端点未实现：`/assets` 查询、详情、PATCH、DELETE、reorder、relations。
- 前端 `deleteWorld`、`duplicateWorld` 仍是本地状态操作，没有调用云端 API。
- `handleSave` 只在有 agent suggestion id 时保存云端建议；普通本地 item 仍只更新前端状态。
- 缺少 `apps/api/test/world-assets.integration-spec.ts` 和 `apps/web/tests/e2e/cloud-world-crud.spec.ts`。

已有但不足：

- 已有 `GET/POST /v1/worlds`。
- 已有 `GET/PATCH/DELETE /v1/worlds/:worldId`，但 DELETE 当前语义是 archive/unpublished。
- 已有 archive/seeds/conflicts 的 list/create API。
- `apps/api/test/worlds.integration-spec.ts` 覆盖了部分世界和资产持久化。

## Phase 5: 基于 pi 的 Agent Session、工具和长世界记忆

未完成：

- 缺少 `docs/product/pi-upstream-audit.md`。
- 缺少 `docs/product/pi-agent-architecture.md`。
- 缺少 `docs/product/world-asset-progressive-disclosure.md`。
- 缺少 `packages/domain/src/agent/context.ts` 和 `packages/domain/src/agent/pi.ts`。
- 缺少 `apps/api/src/modules/agent/pi/*`。
- 缺少 `apps/api/src/modules/agent/context-builder.ts`。
- `packages/db/prisma/schema.prisma` 的 `AgentRun` 缺少 `piSessionId` 和 `provider`。
- `ContextRef` 缺少 `level` 和 `source`。
- `packages/domain/src/agent/index.ts` 未包含 pi session/tool event 类型。
- `apps/api/src/modules/agent/agent.provider.ts` 当前是 OpenAI provider，不是 PiAgentProvider。
- 缺少 `pi-agent.integration-spec.ts`、`agent-context.integration-spec.ts`、`pi-agent.spec.ts`。

已有但不足：

- Agent Run、SSE 事件、pending suggestion、save/discard、失败/取消退款已有雏形。
- 当前 provider 可调用 OpenAI-compatible chat completions，但不符合 pi session/tool/progressive disclosure 架构。

## Phase 6: 版本、发布、回滚和 Fork 同步

未完成：

- 缺少 `packages/domain/src/releases/index.ts`。
- 缺少 `apps/api/src/modules/releases/*`。
- 缺少 `apps/web/src/features/releases/release-wizard.tsx` 和 `diff-view.tsx`。
- release 状态机未按计划建模，缺少 `draft/published/rolled_back`。
- 发布前检查不完整：未阻止零资产世界、未接入 moderation pre-scan 失败、未接入 billing entitlement。
- 缺少 rollback。
- 缺少 Fork upstream diff/sync/detach API。
- 缺少 `releases.integration-spec.ts` 和 `release-flow.spec.ts`。

已有但不足：

- 已有 `POST /v1/worlds/:worldId/publish`。
- 已有 repository release snapshot、版本递增和基础 Fork。
- 前端 `view-publish.tsx` 有发布表单和静态差异预览。

## Phase 7: 真实模型、创作点账本和支付 UI 占位

未完成：

- 缺少 `packages/domain/src/billing/price-book.ts`。
- 缺少 `apps/api/src/modules/billing/entitlements.service.ts`。
- 缺少 `apps/web/src/features/billing/billing-page.tsx` 和 `pricing-page.tsx`。
- 缺少 `docs/product/beta-payments.md`。
- `BillingPlaceholderIntent` 未加入 Prisma schema。
- Agent Run 成本仍使用 `totalTokens / 10` 的简化计算，不是计划中的真实 price book。
- 支付 UI 占位未形成独立页面和完整 Beta 开放说明。
- 缺少 `billing-price-book.spec.ts`、`billing-alpha.integration-spec.ts`、`billing-flow.spec.ts`。

已有但不足：

- 已有 `BillingAccount`、`UsageLedgerEntry`、初始额度、低余额拦截、reserve/settle/refund。
- 设置页能显示余额、最近 Agent Run 和账本条目。

## Phase 8: 社区发现、创作者主页和完整 Repository Detail

未完成：

- 缺少 `apps/api/src/modules/community/*`。
- 缺少 `apps/web/src/features/community/*` 独立页面。
- 缺少 `/v1/community/repositories?cursor=&q=&tag=&sort=` 等计划中的 community API。
- 缺少 creator profile、creator repositories、collections API。
- Repository detail 的 Archive/Seeds/Conflicts/Forks 标签页仍是“后端接入后按分页加载”的占位文案。
- 缺少 `community.integration-spec.ts` 和 `community-product-flow.spec.ts`。

已有但不足：

- 已有 `/v1/repositories`、`/v1/repositories/search`、repository detail、releases、Star、Fork。
- 前端 `view-community.tsx` 有 Explore、Star、Fork、举报入口雏形。

## Phase 9: Alpha 举报、人工治理 Runbook 和反滥用

未完成：

- 缺少 `docs/operations/alpha_moderation_runbook.md`。
- 缺少 `docs/product/beta-admin-dashboard.md`。
- 缺少 `apps/web/src/features/community/report-dialog.tsx`。
- 举报流程缺少 creator profile report。
- 举报 detail 没有计划要求的最小长度校验和弹窗选择体验。
- 缺少 reporter + target + day 的重复举报幂等。
- 当前存在 `GET /v1/admin/reports` 和 `POST /v1/admin/reports/:reportId/actions`，与 Alpha 计划中的“no admin route / no admin dashboard / no moderation workbench”冲突。
- `apps/api/src/common/security.ts` 仍是单进程内存 rate limit，没有 Redis-backed key，也没有 ip/user/access-token route family 组合键。
- 缺少 `alpha-moderation.integration-spec.ts` 和 `report-flow.spec.ts`。

已有但不足：

- 已有 `POST /v1/repositories/:repositoryId/reports`。
- 已有 report/moderation action 表和 Worker 规则扫描。
- 发布和 Local Push 会写入 moderation scan outbox。

## Phase 10: 文件、导入导出和数据权利

未完成：

- 缺少 `packages/domain/src/worlds/world-package.ts`。
- 缺少 `apps/api/src/modules/exports/*`。
- 缺少 `apps/worker/src/export-jobs.ts`。
- 缺少 `apps/web/src/features/account/data-rights-page.tsx`。
- 缺少 `apps/web/src/features/worlds/import-export-panel.tsx`。
- 缺少 world export/import 和 account data export API。
- 缺少 `exports.integration-spec.ts` 和 `import-export.spec.ts`。

已有但不足：

- 已有对象存储模块和 signed upload/download 能力，但未形成导入导出产品闭环。

## Phase 11: 站内通知、活动流和 Alpha 反馈入口

未完成：

- 缺少 `packages/domain/src/notifications/index.ts`。
- 缺少 `apps/api/src/modules/notifications/*`。
- 缺少 `apps/web/src/features/notifications/notification-center.tsx`。
- 缺少 `apps/web/src/features/support/support-entry.tsx`。
- 缺少 `docs/product/beta-email.md`。
- 缺少通知表、未读数、mark as read、反馈提交和活动流。
- 缺少 `notifications.integration-spec.ts`。

## Phase 12: 产品分析、官网和 Alpha 申请/反馈

未完成：

- 缺少 `apps/web/src/app/(marketing)/page.tsx`。
- 缺少 `apps/web/src/app/(marketing)/pricing/page.tsx`。
- 缺少 `apps/web/src/features/analytics/product-events.ts`。
- 缺少 `apps/api/src/modules/analytics/*`。
- 缺少 `docs/product/beta-template-library.md`。
- 缺少 `docs/product/positioning.md`、`pricing.md`、`permissions.md`、`data-and-ip-policy.md`。
- 缺少 Alpha waitlist/feedback CTA、非支付定价页、无模板库保证。
- 缺少 `marketing-and-activation.spec.ts`。

## Phase 13: 可观测性、Worker 运维和生产发布闭环

未完成：

- 缺少 `apps/worker/src/queue-dashboard.ts`。
- 缺少 `apps/api/src/modules/system/worker-health.controller.ts`。
- 缺少 `docs/operations/worker_alerts.md`。
- Release checklist 没有 owner/evidence/command。
- API 未暴露 queue health。
- 缺少 `worker-health.integration-spec.ts` 和 `queue-dashboard.test.ts`。

已有但不足：

- Worker 已有 search indexing、moderation scan、storage cleanup 和 Sentry capture 雏形。
- API/Worker 已有基础 observability 初始化。

## Phase 14: 世界包 CLI、个人访问令牌和轻量生态

未完成：

- 缺少 `packages/domain/src/developer-access/index.ts`。
- 缺少 `apps/api/src/modules/developer-access/*`。
- 缺少 `packages/worlddock-cli/*`。
- 缺少 `docs/product/api.md`。
- 个人访问令牌 scope 与计划不一致：当前已有 `world:read`、`world:write`、`repository:push`，计划要求 `world:read`、`world:write`、`repository:read`、`billing:read`。
- 缺少 CLI 命令：`worlddock login`、`worlddock worlds list`、`worlddock worlds export`、`worlddock worlds import`、`worlddock repositories pull`。
- 缺少 `public-api.integration-spec.ts` 和 `packages/worlddock-cli/test/cli.test.ts`。

已有但不足：

- 已有 access token 创建、列表、撤销 API。
- 已有 Local Push 用的 `repository:push` scope，但 Cloud Alpha 计划把本地部署和 Local Push 放在 Alpha 后的独立计划里。

## 建议执行顺序

1. 先完成 Phase 1，移除静态导出假设，补 CI、Docker、生产 env gate 和运维 runbook。
2. 接着完成 Phase 2，打通登录、注册、session、账户 profile 和 onboarding。
3. 再完成 Phase 3，把 Cloud-only 范围、环境门禁和前端认证来源固定下来。
4. 在 Phase 4 中统一 world assets，消除前端本地 CRUD。
5. 然后推进 Phase 5 和 Phase 7，因为 Agent、账本、计费和发布验收互相依赖。

## 本次未执行

本次只做静态调查和文档整理，未运行全量 `pnpm lint`、`pnpm test`、`pnpm build` 或 E2E。原因是没有发现任何整项 Task 已达到可勾选状态，运行全量验收不能改变 checkbox 判定。
