# Phase 13: 可观测性、Worker 运维和生产发布闭环 Detailed Implementation Plan

> Source: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`

**Goal:** 让 Alpha 发布前可以看到 Worker 队列健康、异常告警和可执行发布证据。
**Scope:** Worker 队列快照、API 健康端点、Sentry 事件、Worker 告警 runbook、生产发布 checklist。
**Non-goals:** 不接入真实托管队列面板，不建设管理后台，不把人工发布流程自动化成一键发布。

## Task 1: Worker 队列健康快照

**Files:**
- Create: `apps/worker/src/queue-dashboard.ts`
- Modify: `apps/worker/src/observability.ts`
- Test: `apps/worker/test/queue-dashboard.test.ts`

- [x] **Step 1: Write failing test**
- [x] **Step 2: Run test and confirm failure**
- [x] **Step 3: Implement minimal code**
- [x] **Step 4: Run test and confirm pass**
- [x] **Step 5: Update docs or release evidence**
- [x] **Step 6: Commit**

## Task 2: API Worker Health 端点

**Files:**
- Create: `apps/api/src/modules/system/worker-health.controller.ts`
- Modify: `apps/api/src/modules/system/system.module.ts`
- Modify: `apps/api/src/common/observability.ts`
- Test: `apps/api/test/worker-health.integration-spec.ts`

- [x] **Step 1: Write failing test**
- [x] **Step 2: Run test and confirm failure**
- [x] **Step 3: Implement minimal code**
- [x] **Step 4: Run test and confirm pass**
- [x] **Step 5: Update docs or release evidence**
- [x] **Step 6: Commit**

## Task 3: 发布 checklist 可执行化

**Files:**
- Create: `docs/operations/worker_alerts.md`
- Modify: `docs/operations/production_release_checklist.md`

- [x] **Step 1: Write failing test**
- [x] **Step 2: Run test and confirm failure**
- [x] **Step 3: Implement minimal docs**
- [x] **Step 4: Run verification**
- [x] **Step 5: Record acceptance evidence**
- [x] **Step 6: Commit**

## Verification

```bash
pnpm --filter @worlddock/api test:integration -- worker-health.integration-spec.ts
pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts
pnpm lint
pnpm test
pnpm build
```

Expected:
- API exposes queue health at `/v1/system/worker-health`.
- Failed or unhealthy queues raise observability events when Sentry is configured.
- Release checklist records owner, evidence, and command for each item.
- Production readiness cannot be marked ready without staging smoke evidence.
