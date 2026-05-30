# WorldDock Cloud Alpha 未完成任务调查记录

调查日期：2026-05-28

调查对象：`docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

## 结论

按“整项 Task 的文件、行为、测试和验收条件都满足才可勾选”的标准，经本轮 Phase 2 与 Phase 3 验证，Phase 2、Phase 3 已可标记完成。除 Phase 2、Phase 3 外，本记录其余 Phase 的未完成判断保持不变。

当前代码库已经具备一些早期后端能力，例如个人账户认证和 onboarding、世界创建、档案/种子/冲突持久化、基础发布、Fork、用量账本、举报和 Worker 扫描雏形。Phase 3 已进一步冻结 Cloud-only 范围、生产环境门禁和前端认证来源。但除已验证完成的 Phase 2、Phase 3 外，这些能力大多没有达到 Alpha 主计划定义的完整产品闭环、文件结构和验收测试要求。

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

## Phase 3: 云端部署版范围冻结和 Cloud-only 主路径

完成状态：已完成。

完成依据：

- `docs/product/cloud-release-scope.md` 已冻结 Cloud Alpha 范围，并明确真实支付、邮件投递、邮箱验证、管理后台、模板库和 Local 部署不进入 Alpha 阻塞路径。
- `docs/product/local-deployment-later.md` 已将 Local 部署版拆到 Cloud Alpha 之后的独立计划。
- `docs/product/cloud-api-contract.md` 已定义 Cloud API 主路径、fixture 边界和认证状态约束。
- `packages/config/src/env.ts` 已包含 `WORLD_DOCK_EDITION` schema，production 只允许 `WORLD_DOCK_EDITION=cloud`。
- `apps/web/src/features/worlddock/api.ts` 已集中 `worlddock.sessionToken` 读写 helper，产品运行时不再直接读写该浏览器存储键。
- `apps/web/src/features/worlddock/world-dock-app.tsx` 与 `apps/web/src/features/worlddock/view-worlds.tsx` 已在登录后使用云端世界列表的 loading/error/empty/ready 状态，不回退到 fixture 世界或 Local tab。
- `apps/web/tests/e2e/cloud-deployment-flow.spec.ts` 已覆盖 authenticated cloud error 和 empty list 场景。

验收证据：

- `pnpm --filter @worlddock/config test -- env.test.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- cloud-deployment-flow.spec.ts`：通过。

剩余说明：

- Phase 3 不删除后续生态仍需的 Local Push 后端能力，也不实现 Local 部署版。
- E2E 测试中仍可直接写入 `worlddock.sessionToken` 来设置测试登录态；产品运行时代码必须通过共享 helper。

## Phase 4: 云端世界 CRUD 和资产编辑器

完成状态：已完成。

完成依据：

- `packages/domain/src/assets/index.ts` 定义统一 `WorldAsset`、资产列表和资产关系 schema。
- `packages/db/prisma/schema.prisma` 与 `packages/db/prisma/migrations/20260529090000_phase4_world_delete_semantics/migration.sql` 支持资产排序、资产关系和世界软删除。
- `apps/api/src/modules/world-assets/*` 提供 `/v1/worlds/:worldId/assets` 查询、详情、创建、更新、删除、排序和关系 API；查询和详情会把关系表回填到 `payload.relationLabels/relationTargets`，不污染旧 `relations/related` 字段，并复用 owner 权限校验。
- `apps/api/src/modules/worlds/*` 支持 Cloud 世界创建、详情、更新、删除隐藏和带资产复制。
- `apps/web/src/features/worlddock/api.ts` 与 `apps/web/src/features/worlds/worlds-api.ts` 提供 Cloud 世界和统一资产 API client。
- `apps/web/src/features/world-assets/asset-editor.tsx`、`asset-search.tsx` 和 `apps/web/src/features/worlddock/world-dock-app.tsx` 接入 Cloud 主路径资产创建、搜索、编辑、删除、排序、关系操作和真实 Agent suggestion 保存响应。
- `apps/api/src/modules/world-assets/world-assets.service.spec.ts`、`apps/api/test/world-assets.integration-spec.ts` 与 `apps/api/test/worlds.integration-spec.ts` 覆盖资产 CRUD、权限、关系回填、关系删除、关系标签不回写旧字段、世界删除和复制。
- `apps/web/tests/e2e/cloud-world-crud.spec.ts` 覆盖登录后的 Cloud 世界创建、真实 Agent suggestion 保存、刷新持久化、资产搜索编辑、关系新增/删除、复制和删除。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test -- world-assets.service.spec.ts`：通过。
- `pnpm --filter @worlddock/api test:integration -- worlds.integration-spec.ts world-assets.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/api test:integration -- world-assets.integration-spec.ts agent.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- cloud-world-crud.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

## Phase 5: 基于 pi 的 Agent Session、工具和长世界记忆

完成状态：已完成。

完成依据：

- `docs/product/pi-upstream-audit.md`、`docs/product/pi-agent-architecture.md` 和 `docs/product/world-asset-progressive-disclosure.md` 已固定 pi upstream、架构边界和长世界渐进披露协议。
- `packages/domain/src/agent/context.ts` 和 `packages/domain/src/agent/pi.ts` 已定义 disclosure level、context ref、pi runtime event、tool call 和 session event 类型。
- `packages/db/prisma/schema.prisma` 已包含 `AgentRun.provider`、`AgentRun.piSessionId`、`ContextRef.level`、`ContextRef.source` 及对应 migration。
- `apps/api/src/modules/agent/context-builder.ts` 已按 manifest、card、brief 选择初始上下文。
- `apps/api/src/modules/agent/pi/*` 已提供真实 pi Agent adapter、runtime client、session runner、event adapter、tool registry、WorldDock tools、skill loader 和 safety gate。
- `AgentService` 已把 `pi.session.started`、`context.used`、tool events、message delta、pending suggestion、usage settlement 和失败退款串入 Agent Run SSE。
- `apps/web/src/features/agent/context-inspector.tsx` 与工作台已展示真实上下文 ref 和工具活动，pending suggestion 仍需用户确认后才写入世界资产。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test -- agent.provider.spec.ts pi-agent-core.adapter.spec.ts`：通过。
- `pnpm --filter @worlddock/api test:integration -- pi-agent.integration-spec.ts agent-context.integration-spec.ts agent.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- pi-agent.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 5 不让 pi 直接保存、删除、发布、收费或读取本地文件；这些动作仍由 WorldDock API 在用户显式确认后执行。
- 真实模型调用依赖 `AI_PROVIDER=pi`、`PI_MODEL_PROVIDER`、`PI_MODEL_ID`、`PI_PROVIDER_API_KEY`；本地 E2E 仍可使用测试 provider 或 mock runtime 保持稳定。

## Phase 6: 版本、发布、回滚和 Fork 同步

完成状态：已完成。

完成依据：

- `packages/domain/src/releases/index.ts` 已定义 release 状态、diff change、preflight、rollback 和 fork sync contract。
- `apps/api/src/modules/releases/*` 已提供 release preview、rollback、fork upstream diff、sync 和 detach endpoint，并复用认证 scope。
- `apps/api/src/modules/repositories/repository.service.ts` 已在发布前检查零资产、授权、发布说明、moderation pre-scan 和公开发布 entitlement。
- 发布流程会生成 repository release、release snapshot、实体级 changes 和版本号；repository detail 使用最新 published release，跳过 rolled_back release。
- rollback 只允许仓库 owner 回滚最新 published release，并会把 Cloud 世界恢复到上一个 published snapshot。
- Fork sync 会基于 fork source snapshot 与 upstream snapshot 计算差异，自动应用非冲突 added、changed、removed 变更；冲突项进入 skipped，当前 Web contract 兼容可选 reason。
- `apps/web/src/features/releases/release-wizard.tsx` 和 `diff-view.tsx` 已使用服务端 preflight 与 changes 渲染发布检查和差异预览。
- `apps/web/src/features/releases/fork-sync-panel.tsx` 与 repository detail Forks tab 已提供 upstream diff、sync 和 detach 操作入口。
- `apps/api/test/releases.integration-spec.ts` 和 `apps/web/tests/e2e/release-flow.spec.ts` 覆盖发布预检、发布、回滚、Fork 对比、同步和 detach。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test:integration -- releases.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- release-flow.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 6 不实现多人协同分支、复杂三路冲突编辑器、release draft 草稿编辑页或真实审核后台；这些进入后续版本。
- 当前 sync 策略只自动应用 fork 本地未修改的 upstream changes；发生 local conflict 时保留 fork 本地内容并在 skipped 中返回对应变更。

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
2. Phase 2 和 Phase 3 已完成，后续保持其验收测试作为回归门禁。
3. 在 Phase 4 中统一 world assets，消除前端本地 CRUD。
4. 然后推进 Phase 5 和 Phase 7，因为 Agent、账本、计费和发布验收互相依赖。
5. 再按社区、治理、导入导出、通知、官网、运维和 CLI 的依赖顺序推进后续 Phase。

## 本次执行说明

本记录最初来自静态调查和文档整理；Phase 3 收口时已补充执行定向验证，并在 `docs/superpowers/plans/2026-05-27-phase-3-cloud-only-main-path.md` 中记录完整验证命令。其余未完成 Phase 仍保持静态调查结论，尚未运行对应全量验收。
