# Phase 6: Usage Ledger 与余额拦截实施计划

## 目标

建立 Cloud 用量事实源，让 Agent Run 在启动前检查余额，并在完成、失败、取消时写入可审计账本：

- 共享领域包定义 billing account、usage ledger、balance、usage summary schema；
- Prisma schema 增加 `billing_accounts` 与 `usage_ledger`；
- API 提供 `GET /v1/billing/balance` 与 `GET /v1/billing/usage`；
- 新用户或首次访问 billing 时获得初始免费额度；
- Agent Run 启动前 reserve，完成时 settle，失败或取消时 refund；
- 前端设置页读取真实余额和最近一次 Agent Run 用量。

## 范围

本 Phase 不接入支付渠道，不做订阅套餐，不做后台调账 UI。`usage_ledger` 先使用整数分计价，余额展示由前端格式化为人民币。

## 涉及文件

- `packages/domain/src/billing/**`
- `packages/db/prisma/schema.prisma`
- `apps/api/src/modules/billing/**`
- `apps/api/src/modules/agent/**`
- `apps/api/test/billing.integration-spec.ts`
- `apps/api/test/agent.integration-spec.ts`
- `apps/web/src/features/worlddock/api.ts`
- `apps/web/src/features/worlddock/view-settings.tsx`
- `apps/web/src/features/worlddock/world-dock-app.tsx`
- `docs/backend_development_plan.md`

## 数据模型

- `billing_accounts`
  - `userId`
  - `currency`
  - `freeCreditGrantedAt`
  - `createdAt`
  - `updatedAt`
- `usage_ledger`
  - `accountId`
  - `userId`
  - `agentRunId`
  - `type`
  - `amountCents`
  - `tokenUsage`
  - `reason`
  - `createdAt`

## API

- `GET /v1/billing/balance`
- `GET /v1/billing/usage`

## 前端接入点

- API client 增加 billing balance / usage；
- 设置页“用量与余额”优先显示真实余额、最近一次 Agent Run、最近账本；
- 无 session 时保留当前 Mock 余额展示。

## Task 清单

- [x] 在 `packages/domain` 定义 billing account、ledger entry、balance、usage summary schema。
- [x] 设计并迁移 `billing_accounts` 与 `usage_ledger` 表。
- [x] 实现 BillingRepository 与 Prisma adapter。
- [x] 实现首次访问 billing 时授予初始免费额度。
- [x] 实现余额聚合查询。
- [x] 实现 `GET /v1/billing/balance`。
- [x] 实现 `GET /v1/billing/usage`。
- [x] Agent Run 启动前执行余额预检查，余额不足返回 `INSUFFICIENT_BALANCE`。
- [x] Agent Run 启动时写入 reserve ledger。
- [x] Agent Run 完成时按 token usage 写入 settle ledger。
- [x] Agent Run 失败时写入 refund ledger 并保留 `MODEL_UNAVAILABLE` 事件。
- [x] Agent Run 取消时写入 refund ledger。
- [x] 前端设置页接入真实余额和最近一次 Agent Run 用量。
- [x] 前端 Agent 成功后刷新余额，余额不足时展示云端错误并保留 Mock 兜底。

## 测试命令

```bash
pnpm --filter @worlddock/domain test
pnpm --filter @worlddock/db prisma:generate
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/api build
pnpm --filter @worlddock/web test
pnpm --filter @worlddock/web build
pnpm --filter @worlddock/web test:e2e
pnpm lint
pnpm test
pnpm build
```

## 验收标准

- 新用户首次访问 billing 后有初始免费额度；
- 余额接口由 ledger 聚合，不读前端 Mock；
- Agent Run 余额不足时不能启动；
- Agent Run 成功后 ledger 包含 reserve 和 settle；
- Agent Run 失败后 ledger 包含 refund；
- Agent Run 取消后 ledger 包含 refund；
- 设置页能显示真实余额、最近一次 Agent Run token/cost 和最近账本；
- Phase 6 测试与全仓质量门通过。

## 实际验收结果

- `pnpm --filter @worlddock/domain test` 通过，覆盖 billing schema。
- `pnpm --filter @worlddock/db prisma:generate` 通过。
- `pnpm --filter @worlddock/db prisma:validate` 通过。
- `pnpm --filter @worlddock/api test` 通过。
- `pnpm --filter @worlddock/api test:integration` 通过，覆盖首次授信、余额查询、用量查询、Agent reserve / settle / refund、余额不足拦截。
- `pnpm --filter @worlddock/api build` 通过。
- `pnpm --filter @worlddock/web test` 通过，覆盖 billing API client。
- `pnpm --filter @worlddock/web build` 通过。
- `pnpm --filter @worlddock/web test:e2e` 通过，5 条现有前端关键链路保持可用。
- `pnpm lint` 通过。
- `pnpm test` 通过。
- `pnpm build` 通过。
- 账本采用 signed cents：`credit_granted` / `model_run_refunded` 为正，`model_run_reserved` 为负，`model_run_settled` 记录 reserve 与实际成本的差额。
- 默认初始额度为 10000 cents，Agent Run reserve 为 100 cents，低余额阈值为 500 cents。

## 未完成项与风险

- 本 Phase 不接入真实支付渠道、订阅套餐或管理员调账 UI；`admin_adjusted` 仅作为 ledger 类型预留。
- Agent Run 成本目前使用 deterministic token 计价函数，后续接真实模型价格表时需要迁移为 provider/model 维度计价。
- Prisma schema 已通过 generate / validate；真实数据库迁移仍需在可用 PostgreSQL 环境执行。
