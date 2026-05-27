# Phase 5: pi Agent Session、工具和长世界记忆 Detailed Implementation Plan

> Source: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

**Goal:** 在不猜测 upstream API 的前提下，建立 pi Agent 的适配边界、渐进式上下文协议、工具注册和 Safety Gate，并让现有 Agent Run 可以通过 typed Pi runtime event 继续产出 SSE 事件。

**Scope:** upstream audit、pi 架构文档、progressive disclosure 文档、domain contract、AgentRun/ContextRef 元数据、context builder、runtime client、session runner、world tool registry、safety gate、skill loader 占位、前端 Agent inspection 基础组件、API integration。

**Non-goals:** 不在本阶段接入真实生产模型账单；不让 pi 直接写产品表；不开放 shell、文件系统、支付、发布或权限变更工具。

**Upstream Evidence:** `docs/product/pi-upstream-audit.md` pins remote commit `4bbe2959bd93e00d29bdc3cfde71d50e47e80133` and confirms local `Agent` methods: `subscribe`, `prompt`, `waitForIdle`, `abort`, `beforeToolCall`, `afterToolCall`.

## Files

- Create: `docs/product/pi-upstream-audit.md`
- Create: `docs/product/pi-agent-architecture.md`
- Create: `docs/product/world-asset-progressive-disclosure.md`
- Create: `packages/domain/src/agent/context.ts`
- Create: `packages/domain/src/agent/pi.ts`
- Modify: `packages/domain/src/agent/index.ts`
- Modify: `packages/domain/package.json`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260527202500_pi_agent_context/migration.sql`
- Create: `apps/api/src/modules/agent/context-builder.ts`
- Create: `apps/api/src/modules/agent/pi/pi-runtime.client.ts`
- Create: `apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts`
- Create: `apps/api/src/modules/agent/pi/pi-session-runner.ts`
- Create: `apps/api/src/modules/agent/pi/pi-event-adapter.ts`
- Create: `apps/api/src/modules/agent/pi/world-tool-registry.ts`
- Create: `apps/api/src/modules/agent/pi/world-tools.ts`
- Create: `apps/api/src/modules/agent/pi/skill-loader.ts`
- Create: `apps/api/src/modules/agent/pi/safety-gate.ts`
- Modify: `apps/api/src/modules/agent/agent.repository.ts`
- Modify: `apps/api/src/modules/agent/prisma-agent.repository.ts`
- Modify: `apps/api/src/modules/agent/agent.provider.ts`
- Modify: `apps/api/src/modules/agent/agent.module.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `packages/config/src/env.ts`
- Create: `apps/web/src/features/agent/agent-run-panel.tsx`
- Create: `apps/web/src/features/agent/context-inspector.tsx`
- Test: `apps/api/test/pi-agent.integration-spec.ts`
- Test: `apps/api/test/agent-context.integration-spec.ts`
- Test: `apps/web/tests/e2e/pi-agent.spec.ts`

## Task 1: 锁定 pi upstream 版本和真实 API

- [x] Step 1: Inspect local pi package manifests.
- [x] Step 2: Inspect `Agent` methods, tool type, hooks, and event names from local source.
- [x] Step 3: Confirm npm package versions and exports.
- [x] Step 4: Pin remote commit from shallow clone metadata.
- [x] Step 5: Write `docs/product/pi-upstream-audit.md`.

## Task 2: 固化架构、上下文和 pi event contract

- [x] Step 1: Add docs for architecture and progressive disclosure.
- [x] Step 2: Add domain context schemas and pi runtime event schemas.
- [x] Step 3: Extend `agentEventSchema` with pi lifecycle/tool events.
- [x] Step 4: Add Prisma metadata for `piSessionId`, `provider`, context `level`, and context `source`.
- [x] Step 5: Write failing context and pi integration tests.

## Task 3: 建立 runtime、session runner、tools 和 Safety Gate

- [x] Step 1: Implement `PiRuntimeClient`, mock runtime, and missing adapter guard.
- [x] Step 2: Implement `PiSessionRunner` and `pi-event-adapter`.
- [x] Step 3: Implement `WorldToolRegistry`, `world-tools`, `skill-loader`, and `SafetyGate`.
- [x] Step 4: Wire `AI_PROVIDER=pi` to a Pi-backed `AgentProvider`.
- [x] Step 5: Re-run API integration tests.

## Task 4: 前端可检查 Agent 上下文

- [x] Step 1: Add `agent-run-panel.tsx`.
- [x] Step 2: Add `context-inspector.tsx`.
- [x] Step 3: Add `pi-agent.spec.ts` smoke coverage.

## Task 5: Verification and Commit

- [x] Step 1: Run `pnpm --filter @worlddock/db prisma:validate`.
- [x] Step 2: Run `pnpm --filter @worlddock/api test:integration -- pi-agent.integration-spec.ts agent-context.integration-spec.ts`.
- [x] Step 3: Run `pnpm --filter @worlddock/web test:e2e -- pi-agent.spec.ts`.
- [x] Step 4: Run `pnpm lint`.
- [x] Step 5: Run `pnpm test`.
- [x] Step 6: Run `pnpm build`.
- [x] Step 7: Update source plan checkboxes.
- [x] Step 8: Check git identity, commit with anonymized author/committer, and verify `git log --format=fuller`.
