# Alpha 完成状态复核修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修复 Alpha 完成状态复核中发现的两处阻塞：Agent suggestion 保存后档案不可见的闭环，以及 `2026-05-28-alpha-incomplete-tasks.md` 中 Phase 1 状态仍停留在待重新验收。

**Architecture:** 后端 `POST /v1/agent-suggestions/:id/save` 返回保存后的 `WorldAsset`，前端继续复用已有 `SaveAgentSuggestionResponse.asset` 兼容路径来即时更新档案列表。E2E mock 与真实 API contract 保持一致；文档只在完整验收通过后更新，避免把失败状态写成完成。

**Tech Stack:** NestJS、Prisma repository abstraction、WorldDock domain `WorldAsset` contract、React Query、Playwright、Vitest、pnpm、Docker。

---

## Scope

- 修复 Agent suggestion 保存后“toast 显示已保存，但档案页仍为空”的可见性闭环。
- 更新 Web E2E mock，使其模拟真实保存后的 asset contract，而不是只返回 suggestion status。
- 在 `pnpm verify:ci` 和 Phase 1 补充验收通过后，更新 incomplete-tasks 调查记录。

## Non-Goals

- 不重构 Agent provider、pi runtime 或 WorldAssetsService。
- 不改变 suggestion 编辑、discard、SSE 流或 billing settlement 语义。
- 不新增真实 staging 部署；若 Docker 或 staging smoke 无法执行，只记录为未完成证据，不强行标记生产闭环完成。

## Files

- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `apps/api/src/modules/agent/agent.controller.ts`
- Modify: `apps/api/test/agent.integration-spec.ts`
- Modify: `apps/web/tests/e2e/helpers.ts`
- Test: `apps/web/tests/e2e/creation-flow.spec.ts`
- Modify after validation: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

## Execution Rules

- 后续执行若需要提交，提交前运行：

```bash
git config user.name
git config user.email
```

- 如果输出包含真实姓名或个人邮箱，先在当前仓库设置匿名提交身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

- 每次提交后立即检查最近一次提交身份：

```bash
git log -1 --format=fuller
```

- 只有 Author 和 Committer 都不包含真实姓名或个人邮箱时，才把提交视为完成。

---

## Task 1: 后端保存 suggestion 时返回保存后的 WorldAsset

**Files:**
- Modify: `apps/api/test/agent.integration-spec.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `apps/api/src/modules/agent/agent.controller.ts`

- [x] **Step 1: Write the failing integration contract**

In `apps/api/test/agent.integration-spec.ts`, replace the current save assertions:

```ts
expect(saved.body.suggestion).toMatchObject({ status: "saved", savedAssetId: "archive_1" });
expect(saved.body.asset).toBeUndefined();
expect((await worlds.countAssets(world.id)).archive).toBe(1);
```

with:

```ts
expect(saved.body.suggestion).toMatchObject({ status: "saved", savedAssetId: "archive_1" });
expect(saved.body.asset).toMatchObject({
  id: "archive_1",
  worldId: world.id,
  kind: "setting",
  title: "《记忆交易法》修订版",
  category: "世界规则",
  summary: "修订后的法律地位。",
  body: "仅认证机构可以主持交易，并需要保留撤销机制。",
  payload: { relations: [] },
  position: 0,
});
expect(saved.body.asset.createdAt).toEqual(expect.any(String));
expect(saved.body.asset.updatedAt).toEqual(expect.any(String));
expect((await worlds.countAssets(world.id)).archive).toBe(1);

const savedAgain = await request(app.getHttpServer())
  .post(`/v1/agent-suggestions/${suggestionId}/save`)
  .set("authorization", "Bearer session_user_1")
  .expect(201);

expect(savedAgain.body.suggestion).toMatchObject({ status: "saved", savedAssetId: "archive_1" });
expect(savedAgain.body.asset).toMatchObject({ id: "archive_1", kind: "setting" });
expect((await worlds.countAssets(world.id)).archive).toBe(1);
```

- [x] **Step 2: Run the API integration test and verify RED**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- agent.integration-spec.ts
```

Expected: FAIL because `saved.body.asset` is currently `undefined`.

- [x] **Step 3: Update the controller to return the service result directly**

In `apps/api/src/modules/agent/agent.controller.ts`, change:

```ts
return { suggestion: await this.agentService.saveSuggestion(subject, suggestionId) };
```

to:

```ts
return this.agentService.saveSuggestion(subject, suggestionId);
```

- [x] **Step 4: Update AgentService to return `{ suggestion, asset }`**

In `apps/api/src/modules/agent/agent.service.ts`, update imports:

```ts
import { agentEventSchema, suggestionSchema, type AgentEvent, type TokenUsage, type WorldAsset, type WorldSuggestion } from "@worlddock/domain";
import { AGENT_REPOSITORY, type AgentEventRecord, type AgentRepository, type AgentRunRecord, type AgentSuggestionRecord } from "./agent.repository";
import {
  WORLD_REPOSITORY,
  type ArchiveEntryRecord,
  type ConflictRecord,
  type StorySeedRecord,
  type WorldRepository,
  type WorldRecord,
} from "../worlds/world.repository";
```

Replace `saveSuggestion()` and `saveSuggestionAsset()` with:

```ts
async saveSuggestion(subject: AuthSubject, suggestionId: string) {
  const suggestion = await this.requireOwnedSuggestion(subject, suggestionId);
  if (suggestion.status === "saved") {
    return {
      suggestion,
      asset: await this.findSavedSuggestionAsset(suggestion),
    };
  }

  const saved = await this.saveSuggestionAsset(suggestion.worldId, suggestion.suggestion);
  const updated = await this.agents.updateSuggestion(suggestion.id, {
    status: "saved",
    savedAssetId: saved.asset.id,
  });
  return {
    suggestion: updated ?? { ...suggestion, status: "saved" as const, savedAssetId: saved.asset.id },
    asset: saved.asset,
  };
}

private async saveSuggestionAsset(worldId: string, suggestion: WorldSuggestion): Promise<{ asset: WorldAsset }> {
  if (suggestion.kind === "setting") {
    const entry = await this.worlds.createArchiveEntry({
      worldId,
      title: suggestion.title,
      category: suggestion.category,
      summary: suggestion.summary,
      body: suggestion.body,
      relations: suggestion.relations ?? [],
    });
    return { asset: archiveEntryToWorldAsset(entry) };
  }

  if (suggestion.kind === "seed") {
    const seed = await this.worlds.createStorySeed({
      worldId,
      title: suggestion.title,
      hook: suggestion.hook,
      trigger: suggestion.trigger,
      conflict: suggestion.conflict,
      protagonists: suggestion.protagonists,
      questions: suggestion.questions,
    });
    return { asset: storySeedToWorldAsset(seed) };
  }

  const conflict = await this.worlds.createConflict({
    worldId,
    title: suggestion.title,
    summary: suggestion.summary,
    body: suggestion.body,
    related: suggestion.related ?? [],
    derivedSeeds: suggestion.derivedSeeds ?? [],
  });
  return { asset: conflictToWorldAsset(conflict) };
}

private async findSavedSuggestionAsset(suggestion: AgentSuggestionRecord): Promise<WorldAsset | null> {
  if (!suggestion.savedAssetId) return null;

  if (suggestion.suggestion.kind === "setting") {
    const entry = (await this.worlds.listArchiveEntries(suggestion.worldId))
      .find((item) => item.id === suggestion.savedAssetId);
    return entry ? archiveEntryToWorldAsset(entry) : null;
  }

  if (suggestion.suggestion.kind === "seed") {
    const seed = (await this.worlds.listStorySeeds(suggestion.worldId))
      .find((item) => item.id === suggestion.savedAssetId);
    return seed ? storySeedToWorldAsset(seed) : null;
  }

  const conflict = (await this.worlds.listConflicts(suggestion.worldId))
    .find((item) => item.id === suggestion.savedAssetId);
  return conflict ? conflictToWorldAsset(conflict) : null;
}
```

Add these mapper helpers near the bottom of `agent.service.ts`, outside the class:

```ts
function archiveEntryToWorldAsset(entry: ArchiveEntryRecord): WorldAsset {
  return {
    id: entry.id,
    worldId: entry.worldId,
    kind: "setting",
    title: entry.title,
    category: entry.category,
    summary: entry.summary,
    body: entry.body,
    payload: { relations: entry.relations ?? [] },
    position: entry.position ?? 0,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function storySeedToWorldAsset(seed: StorySeedRecord): WorldAsset {
  return {
    id: seed.id,
    worldId: seed.worldId,
    kind: "seed",
    title: seed.title,
    category: "故事种子",
    summary: seed.hook,
    body: seed.conflict,
    payload: {
      hook: seed.hook,
      trigger: seed.trigger,
      conflict: seed.conflict,
      protagonists: seed.protagonists,
      questions: seed.questions ?? [],
    },
    position: seed.position ?? 0,
    createdAt: seed.createdAt.toISOString(),
    updatedAt: seed.updatedAt.toISOString(),
  };
}

function conflictToWorldAsset(conflict: ConflictRecord): WorldAsset {
  return {
    id: conflict.id,
    worldId: conflict.worldId,
    kind: "conflict",
    title: conflict.title,
    category: "冲突",
    summary: conflict.summary,
    body: conflict.body,
    payload: {
      related: conflict.related ?? [],
      derivedSeeds: conflict.derivedSeeds ?? [],
    },
    position: conflict.position ?? 0,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
  };
}
```

- [x] **Step 5: Run API validation and verify GREEN**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- agent.integration-spec.ts
pnpm --filter @worlddock/api lint
```

Expected: PASS.

---

## Task 2: 修复 Web E2E mock contract 和 creation-flow

**Files:**
- Modify: `apps/web/tests/e2e/helpers.ts`
- Test: `apps/web/tests/e2e/creation-flow.spec.ts`

- [x] **Step 1: Confirm current E2E failure**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- creation-flow.spec.ts
```

Expected before implementation: FAIL at `creation-flow.spec.ts:23`, waiting for `《记忆交易法》` in `main`.

- [x] **Step 2: Add a reusable mock asset**

In `apps/web/tests/e2e/helpers.ts`, add this object near the existing mock constants:

```ts
const memoryTradeLawAsset = {
  id: "archive_1",
  worldId: "world_created",
  kind: "setting",
  title: "《记忆交易法》",
  category: "世界规则",
  summary: "认证机构可以托管、估价并转让记忆，但亲属记忆交易必须经过冷静期。",
  body: "所有记忆交易都必须由认证机构托管，亲属关系内的交易需要七日冷静期和独立见证。",
  payload: { relations: [] },
  position: 0,
  createdAt: "2026-05-28T10:00:00.000Z",
  updatedAt: "2026-05-28T10:00:00.000Z",
};
```

- [x] **Step 3: Mock the world asset list route for created worlds**

In the `installApiMocks()` route handler, add this before legacy `/archive`, `/seeds`, and `/conflicts` handlers:

```ts
if (method === "GET" && /\/v1\/worlds\/[^/]+\/assets$/.test(path)) {
  const worldId = path.split("/")[3];
  return json(route, {
    assets: worldId === "world_created" ? [memoryTradeLawAsset] : [],
    nextCursor: null,
  });
}
```

- [x] **Step 4: Return the saved asset from the suggestion save mock**

Replace:

```ts
if (method === "POST" && /\/v1\/agent-suggestions\/[^/]+\/save$/.test(path)) {
  return json(route, { suggestion: { id: "ags_1", status: "saved" } });
}
```

with:

```ts
if (method === "POST" && /\/v1\/agent-suggestions\/[^/]+\/save$/.test(path)) {
  return json(route, {
    suggestion: { id: "ags_1", status: "saved", savedAssetId: memoryTradeLawAsset.id },
    asset: memoryTradeLawAsset,
  }, 201);
}
```

- [x] **Step 5: Run targeted Web validation and verify GREEN**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- creation-flow.spec.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
```

Expected: PASS.

---

## Task 3: 完整验收并更新 incomplete-tasks 调查记录

**Files:**
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [x] **Step 1: Run full CI-equivalent verification**

Run:

```bash
pnpm verify:ci
```

Expected: PASS. This must include Prisma generate/validate, lint, unit tests, build, API integration, and Web E2E.

- [x] **Step 2: Run Phase 1 Docker verification**

Run:

```bash
docker build -f apps/api/Dockerfile -t worlddock-api:alpha-verification .
docker build -f apps/web/Dockerfile -t worlddock-web:alpha-verification .
docker build -f apps/worker/Dockerfile -t worlddock-worker:alpha-verification .
```

Expected: all three builds PASS. If Docker is unavailable locally, do not mark Phase 1 as fully revalidated; record the blocker instead.

- [x] **Step 3: Update the Phase 1 status only after Steps 1-2 pass**

In `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`, change:

```md
完成状态：待重新验收。
```

to:

```md
完成状态：已完成。
```

Replace the Phase 1 “待重新验收” section with:

```md
完成依据：

- `.github/workflows/ci.yml` 已存在，并通过 `pnpm verify:ci` 串联 Prisma generate/validate、lint、unit、build、API integration 和 Web E2E。
- `apps/api/Dockerfile`、`apps/web/Dockerfile` 和 `apps/worker/Dockerfile` 已通过本轮 Docker build 验证。
- `apps/web/next.config.ts` 不再设置 `output: "export"` 或 `assetPrefix: "."`，生产构建保留服务端能力。
- `packages/config/src/env.ts` 已要求 32 位 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、production `SENTRY_DSN`，并拒绝 production mock provider / 非 cloud edition / 缺失真实模型配置。
- `apps/api/test/system.integration-spec.ts` 覆盖 health、readiness、metrics 和 unsafe production env gate。
- `docs/operations/incident_runbook.md`、`docs/operations/queue_runbook.md` 与 `docs/operations/production_release_checklist.md` 已提供生产事故、队列和发布门禁基线。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/config test -- env.test.ts`：通过。
- `pnpm --filter @worlddock/web test -- src/config/next-config.test.ts`：通过。
- `pnpm --filter @worlddock/api test:integration -- system.integration-spec.ts`：通过。
- `pnpm verify:ci`：通过。
- `docker build -f apps/api/Dockerfile -t worlddock-api:alpha-verification .`：通过。
- `docker build -f apps/web/Dockerfile -t worlddock-web:alpha-verification .`：通过。
- `docker build -f apps/worker/Dockerfile -t worlddock-worker:alpha-verification .`：通过。
```

- [x] **Step 4: Update the document conclusion and recommendation**

Change the top conclusion from:

```md
按“整项 Task 的文件、行为、测试和验收条件都满足才可勾选”的标准，截至本轮 Phase 14 验证，Phase 2 至 Phase 14 已可标记完成。
Phase 1 的早期静态缺口已有明显变化，但本轮未执行对应完整验收，因此仍保留为待重新验收状态。
```

to:

```md
按“整项 Task 的文件、行为、测试和验收条件都满足才可勾选”的标准，截至 2026-06-02 本轮复核，Phase 1 至 Phase 14 已可标记完成。
本轮补齐 Phase 1 定向验收、Docker 构建验收和 CI 等价全量验收，并修复 Agent suggestion 保存后档案可见性回归。
```

Change the final recommendation from:

```md
1. 先重新验收 Phase 1，确认 CI、Docker、生产 env gate、静态导出移除、系统集成测试和运维 runbook 全部满足计划标准。
2. 保持 Phase 2 至 Phase 14 的验收测试作为回归门禁。
```

to:

```md
1. 保持 `pnpm verify:ci` 作为 Alpha 回归门禁。
2. 生产发布前仍需按 `docs/operations/production_release_checklist.md` 记录真实 CI URL、镜像 digest、staging smoke 和发布后观察窗口。
```

- [x] **Step 5: Run documentation diff review**

Run:

```bash
git diff -- docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected: diff only changes Phase 1 status/evidence and the top/final summary; it must not rewrite Phase 2-14 evidence.

- [x] **Step 6: Final verification before handoff**

Run:

```bash
pnpm verify:ci
git status --short
```

Expected: `pnpm verify:ci` PASS; `git status --short` only lists the intended files.

---

## Completion Criteria

- `POST /v1/agent-suggestions/:suggestionId/save` returns both `suggestion` and saved `asset`.
- Re-saving an already saved suggestion is idempotent and does not create duplicate assets.
- `creation-flow.spec.ts` passes and confirms saved `《记忆交易法》` appears in the archive view.
- `pnpm verify:ci` passes.
- Phase 1 Docker builds pass, or the document is left in a non-complete state with the Docker blocker explicitly recorded.
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` is updated only after code and infrastructure verification pass.
