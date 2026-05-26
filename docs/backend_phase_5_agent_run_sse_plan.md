# Phase 5: Agent Run、SSE 与建议沉淀实施计划

## 目标

把前端 Mock Agent 流推进到真实后端 Agent Run 协议：

- 共享领域包定义 `AgentEvent`、`AgentRun`、`AgentSuggestion`、`ContextRef`、`TokenUsage`；
- API 创建 Agent Run，保存可审计事件和建议；
- `GET /v1/agent-runs/:runId/events` 以 SSE 输出 WorldDock AgentEvent；
- suggestion 在用户保存前只存在于 `agent_suggestions`，保存后才写入 archive / seed / conflict；
- 默认 `mock` provider 可在无模型密钥环境稳定验证；保留 Vercel AI SDK v6 server-side provider 接入点。

## 范围

本 Phase 不做 Usage Ledger 余额预检查和真实计费结算，这些在 Phase 6 完成。本 Phase 的模型失败路径先通过 provider 抛错转换为 `MODEL_UNAVAILABLE` 或 run failed 事件。

## 涉及文件

- `packages/domain/src/agent/**`
- `packages/db/prisma/schema.prisma`
- `apps/api/src/modules/agent/**`
- `apps/api/test/agent.integration-spec.ts`
- `apps/web/src/features/worlddock/api.ts`
- `apps/web/src/features/worlddock/world-dock-app.tsx`
- `docs/backend_development_plan.md`

## 数据模型

- `agent_runs`
- `agent_events`
- `agent_suggestions`
- `context_refs`

## API

- `POST /v1/worlds/:worldId/agent-runs`
- `GET /v1/agent-runs/:runId/events`
- `POST /v1/agent-runs/:runId/cancel`
- `POST /v1/agent-suggestions/:suggestionId/save`
- `POST /v1/agent-suggestions/:suggestionId/discard`

## 前端接入点

- API client 增加 Agent Run、SSE URL、cancel、suggestion save/discard；
- 工作台在存在 session 和真实 world id 时优先使用后端 Agent Run；
- 无 session 或 API 失败时保留当前 Mock streaming 兜底。

## Task 清单

- [x] 在 `packages/domain` 定义 `AgentEvent`、`AgentRun`、`AgentSuggestion`、`ContextRef`、`TokenUsage` schema。
- [x] 设计并迁移 `agent_runs`、`agent_events`、`agent_suggestions`、`context_refs` 表。
- [x] 实现 `POST /v1/worlds/:worldId/agent-runs`，创建 run 并返回 run id。
- [x] 实现 `GET /v1/agent-runs/:runId/events`，以 SSE 输出 WorldDock AgentEvent。
- [x] 接入 server-side Vercel AI SDK，先支持一个默认模型供应商。
- [x] 将模型文本流转换为 `message.delta` 事件。
- [x] 将结构化输出转换为 `suggestion.created` 事件，并通过 Zod 校验。
- [x] 将上下文引用转换为 `context.used` 事件。
- [x] 实现 `POST /v1/agent-runs/:runId/cancel`。
- [x] 实现 suggestion save / discard API。
- [x] suggestion save 根据 kind 写入 archive / seed / conflict。
- [x] 记录 run completed、failed、cancelled 状态。
- [x] 前端工作台接入真实 SSE，保留停止、错误、余额不足、模型不可用反馈。

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

- Agent 输出通过 SSE 渐进显示；
- Agent 事件可在数据库中回放；
- suggestion 未保存前不会进入世界资产；
- 保存 suggestion 后资产数量变化；
- 取消 run 后前端停止接收增量事件；
- 模型失败返回 `MODEL_UNAVAILABLE` 或明确错误；
- Agent E2E 覆盖成功、取消、失败和保存建议。

## 实际验收结果

- `pnpm --filter @worlddock/domain test` 通过，覆盖 AgentEvent / AgentRun / ContextRef / suggestion record schema。
- `pnpm --filter @worlddock/db prisma:generate` 通过。
- `pnpm --filter @worlddock/db prisma:validate` 通过。
- `pnpm --filter @worlddock/api test` 通过。
- `pnpm --filter @worlddock/api test:integration` 通过，覆盖 Agent Run 创建、SSE 流式事件、取消、provider 失败、suggestion 保存后写入资产。
- `pnpm --filter @worlddock/api build` 通过。
- `pnpm --filter @worlddock/web test` 通过，覆盖 Agent API client、SSE replay 与 chunk streaming parser。
- `pnpm --filter @worlddock/web build` 通过。
- `pnpm --filter @worlddock/web test:e2e` 通过，5 条现有前端关键链路保持可用。
- `pnpm lint` 通过。
- `pnpm test` 通过。
- `pnpm build` 通过。
- `GET /v1/agent-runs/:runId/events` 使用 SSE 输出 `run.started`、`context.used`、`message.delta`、`suggestion.created`、`run.completed`、`run.failed`、`run.cancelled`；首次读取 running run 时会触发 provider stream 并持久化事件，后续可回放。
- suggestion 在 SSE 生成并保存到 `agent_suggestions` 后仍为 pending；只有调用 save API 后才根据 kind 写入 archive / seed / conflict。

## 未完成项与风险

- 本 Phase 按范围不做 Usage Ledger、余额预扣、真实计费结算；这些留到 Phase 6。
- Vercel AI SDK provider 已接入 server-side stream 接口，默认 mock provider 可稳定验证；真实外部模型调用需要部署环境提供模型凭据后再做联调。
- Prisma schema 已更新并通过 generate / validate；本地 Docker daemon 不可用时无法在本机跑真实 PostgreSQL `migrate deploy`，上线前仍需在可用数据库环境执行迁移流程。
