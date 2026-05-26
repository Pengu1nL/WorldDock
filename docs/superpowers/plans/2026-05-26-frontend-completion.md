# WorldDock 前端完善实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前高保真前端原型补齐为可验收的 WorldDock Web 前端体验原型，覆盖创作闭环、发布 / Push、界仓社区、Local / Cloud 差异、错误状态、响应式与基础工程质量。

**Architecture:** 先保留当前单页原型的交互速度，同时逐步抽出领域 schema、fixture、状态 reducer 和页面级组件。社区、发布、设置先以 Mock 前端闭环落地，再预留 API / TanStack Query 接入边界，避免在没有后端时把 UI 做死。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS v4、Radix Dialog / Tooltip、lucide-react、Zod、Zustand、TanStack Query、Vitest、Playwright。

---

## 当前判断

本文件是执行用长计划，最新对外验收状态以 `docs/frontend_completion_plan.md` 和 `docs/frontend_completion_checklist.md` 为准。

当前已经实现并验证：

- 创作、工作台、档案、社区、发布 / Push、设置五条前端路径均已形成可点击 Mock 闭环。
- Explore、公开世界仓库、Star、Fork、Releases、举报已落地。
- 发布 / Push 已补齐隐私边界、不会公开内容、实体级 diff、授权、更新说明和状态变更。
- Local / Cloud 已补齐余额、本次消耗、余额不足、模型连接、社区 Access Token 和 Local Push 边界表达。
- 领域 schema、状态 reducer、fixture、单元测试、静态导出验证和 E2E 用例已补齐。
- `pnpm test:e2e` 与直连 Playwright 命令均已通过 5 条浏览器用例，覆盖创作、社区、发布、设置与 `390x844` 移动端无横向溢出。

当前剩余 / 后续边界：

- 当前前端计划内验收已闭合；此前 `pnpm test:e2e` 的 Chromium Mach port 限制已随沙箱限制解除而消失。
- 桌面与移动端截图附件已生成到 `artifacts/frontend-verification/`，可支撑设计层人工验收。
- 真实登录、模型调用、计费、发布、审核和管理员后台仍属于后端或下一轮生产化范围。

注意：下文任务步骤是原始实施计划正文，保留用于追溯；当前完成状态以 `docs/frontend_completion_checklist.md` 的全勾选验收清单为准。

## 文件结构目标

本计划完成后，新增或调整的文件职责如下：

```txt
src/features/worlddock/
  domain.ts                 # 领域类型、Zod schema、Mock 数据校验入口
  fixtures.ts               # 世界、公开仓库、发布 diff、用量、设置状态的 Mock fixture
  world-dock-app.tsx        # 顶层组合与视图状态，逐步瘦身
  view-workbench.tsx        # 工作台、Agent 模式、消息流、建议处理
  view-worlds.tsx           # 我的世界与创建世界
  view-archive.tsx          # 档案、种子池、冲突池
  view-community.tsx        # Explore、公开仓库、Star、Fork、Releases、举报
  view-publish.tsx          # 发布 / Push 向导、隐私边界、实体级 diff、授权
  view-settings.tsx         # Billing、Model、Community Token、Data 设置
  state.ts                  # 原型阶段 reducer/actions；后续可迁到 Zustand store
  __tests__/
    domain.test.ts
    state.test.ts

tests/e2e/
  creation-flow.spec.ts     # 创作闭环
  community-flow.spec.ts    # 社区闭环
  publish-flow.spec.ts      # 发布 / Push 闭环
  responsive.spec.ts        # 移动端核心路径
```

## 验收命令

每个任务完成后至少运行：

```bash
pnpm lint
pnpm build
```

涉及领域逻辑或状态变更时运行：

```bash
pnpm test
```

涉及页面交互时运行：

```bash
pnpm test:e2e
```

首次运行 E2E 前，如果本机缺少浏览器：

```bash
pnpm exec playwright install chromium
```

---

### Task 1: 建立领域类型与 Mock 校验

**Files:**
- Create: `src/features/worlddock/domain.ts`
- Create: `src/features/worlddock/__tests__/domain.test.ts`
- Modify: `src/features/worlddock/mock-data.ts`

- [x] **Step 1: 写领域 schema 测试**

Create `src/features/worlddock/__tests__/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MOCK } from "../mock-data";
import {
  agentSeedSchema,
  publicRepositorySchema,
  worldSchema,
} from "../domain";

describe("worlddock domain schemas", () => {
  it("validates every premade world", () => {
    for (const world of MOCK.PREMADE_WORLDS) {
      expect(() => worldSchema.parse(world)).not.toThrow();
    }
  });

  it("validates every agent seed", () => {
    for (const seed of Object.values(MOCK.SEEDS)) {
      expect(() => agentSeedSchema.parse(seed)).not.toThrow();
    }
  });

  it("rejects a repository without license", () => {
    const invalidRepository = {
      id: "repo_bad",
      owner: "ren",
      slug: "bad-world",
      name: "Bad World",
      summary: "Missing license should fail.",
      tags: [],
      stars: 0,
      forks: 0,
      updated: "刚刚",
      version: "v0.1.0",
      visibility: "public",
    };

    expect(() => publicRepositorySchema.parse(invalidRepository)).toThrow();
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test -- src/features/worlddock/__tests__/domain.test.ts
```

Expected: FAIL，提示 `../domain` 不存在。

- [x] **Step 3: 创建领域 schema**

Create `src/features/worlddock/domain.ts`:

```ts
import { z } from "zod";

export const worldStatusSchema = z.enum(["draft", "unpublished", "published"]);
export const worldModeSchema = z.enum(["cloud", "local"]);
export const visibilitySchema = z.enum(["private", "public"]);

export const worldSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1),
  maturity: z.number().int().min(0).max(100),
  status: worldStatusSchema,
  visibility: visibilitySchema,
  archive: z.number().int().min(0),
  seeds: z.number().int().min(0),
  conflicts: z.number().int().min(0),
  updated: z.string().min(1),
  mode: worldModeSchema,
  hasUnsaved: z.boolean().optional(),
  hasUnpushed: z.boolean().optional(),
  starred: z.number().int().min(0).optional(),
  forked: z.number().int().min(0).optional(),
  isNew: z.boolean().optional(),
});

export const suggestionKindSchema = z.enum(["setting", "conflict", "seed"]);

const baseSuggestionSchema = z.object({
  id: z.string().min(1),
  kind: suggestionKindSchema,
  category: z.string().min(1),
  title: z.string().min(1),
});

export const settingSuggestionSchema = baseSuggestionSchema.extend({
  kind: z.literal("setting"),
  summary: z.string().min(1),
  body: z.string().min(1),
  relations: z.array(z.string().min(1)).optional(),
});

export const conflictSuggestionSchema = baseSuggestionSchema.extend({
  kind: z.literal("conflict"),
  summary: z.string().min(1),
  body: z.string().min(1),
  related: z.array(z.string().min(1)).optional(),
  derivedSeeds: z.array(z.string().min(1)).optional(),
});

export const seedSuggestionSchema = baseSuggestionSchema.extend({
  kind: z.literal("seed"),
  hook: z.string().min(1),
  trigger: z.string().min(1),
  conflict: z.string().min(1),
  protagonists: z.string().min(1),
  questions: z.array(z.string().min(1)),
  parentConflict: z.string().min(1).optional(),
});

export const suggestionSchema = z.discriminatedUnion("kind", [
  settingSuggestionSchema,
  conflictSuggestionSchema,
  seedSuggestionSchema,
]);

export const consistencyIssueSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  involves: z.array(z.string().min(1)),
  severity: z.enum(["normal", "important"]),
});

export const agentSeedSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  inspiration: z.string().min(1),
  suggestedName: z.string().min(1),
  suggestedType: z.string().min(1),
  styles: z.array(z.string().min(1)),
  coreSetting: z.string().min(1),
  coreConflict: z.string().min(1),
  directions: z.array(z.string().min(1)),
  firstQuestion: z.string().min(1),
  tools: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    detail: z.string().min(1),
  })),
  responseChunks: z.array(z.string()),
  suggestions: z.array(suggestionSchema),
  archive: z.record(z.string(), z.number().int().min(0)),
  issues: z.array(consistencyIssueSchema),
});

export const licenseSchema = z.enum([
  "all-rights-reserved",
  "non-commercial-attribution",
  "free-fork-attribution",
  "commercial-attribution",
  "no-fork",
]);

export const releaseSchema = z.object({
  version: z.string().min(1),
  updated: z.string().min(1),
  note: z.string().min(1),
  addedSettings: z.number().int().min(0),
  changedSettings: z.number().int().min(0),
  removedSettings: z.number().int().min(0),
  addedSeeds: z.number().int().min(0),
  source: z.enum(["cloud-publish", "local-push"]),
});

export const publicRepositorySchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  readme: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)),
  stars: z.number().int().min(0),
  forks: z.number().int().min(0),
  seeds: z.number().int().min(0).optional(),
  maturity: z.number().int().min(0).max(100).optional(),
  updated: z.string().min(1),
  version: z.string().min(1),
  visibility: z.literal("public"),
  license: licenseSchema,
  forkedFrom: z.string().min(1).optional(),
  releases: z.array(releaseSchema).default([]),
});

export type World = z.infer<typeof worldSchema>;
export type AgentSeed = z.infer<typeof agentSeedSchema>;
export type WorldSuggestion = z.infer<typeof suggestionSchema>;
export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;
export type PublicRepository = z.infer<typeof publicRepositorySchema>;
export type Release = z.infer<typeof releaseSchema>;
```

- [x] **Step 4: 去掉 `mock-data.ts` 的 `@ts-nocheck` 并导出类型约束**

Modify `src/features/worlddock/mock-data.ts`:

```diff
- // @ts-nocheck
  // mock-data.ts — WorldDock seed data + agent script
  // Quality content per PRD §9.3 — memory trading default + alternatives
+ import type { AgentSeed, World } from "./domain";
 
  export const SEEDS = {
@@
- };
+ } satisfies Record<string, AgentSeed>;
 
  export const PREMADE_WORLDS = [
@@
- ];
+ ] satisfies World[];
 
  export const MOCK = { SEEDS, PREMADE_WORLDS };
```

Expected implementation detail: the existing `memory`, `city`, and `PREMADE_WORLDS` object bodies stay byte-for-byte identical; only the import, `satisfies` clauses, and first-line removal are part of this step.

- [x] **Step 5: 运行测试确认通过**

Run:

```bash
pnpm test -- src/features/worlddock/__tests__/domain.test.ts
```

Expected: PASS。

- [x] **Step 6: 运行构建**

Run:

```bash
pnpm build
```

Expected: build 成功。

---

### Task 2: 抽出原型状态 reducer，补足状态测试

**Files:**
- Create: `src/features/worlddock/state.ts`
- Create: `src/features/worlddock/__tests__/state.test.ts`
- Modify: `src/features/worlddock/world-dock-app.tsx`

- [x] **Step 1: 写状态测试**

Create `src/features/worlddock/__tests__/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MOCK } from "../mock-data";
import {
  createInitialWorldDockState,
  worldDockReducer,
} from "../state";

describe("worldDockReducer", () => {
  it("saves a setting suggestion and increments archive count", () => {
    const seed = MOCK.SEEDS.memory;
    const world = MOCK.PREMADE_WORLDS[0];
    const state = createInitialWorldDockState([world]);
    const opened = worldDockReducer(state, { type: "world.opened", worldId: world.id });
    const withSuggestion = {
      ...opened,
      currentWorld: world,
      savedIds: [],
      savedSettings: [],
    };

    const next = worldDockReducer(withSuggestion, {
      type: "suggestion.saved",
      item: seed.suggestions[0],
    });

    expect(next.savedIds).toContain("s1");
    expect(next.savedSettings).toHaveLength(1);
    expect(next.currentWorld?.archive).toBe(world.archive + 1);
  });

  it("forks a public repository into a private draft world", () => {
    const state = createInitialWorldDockState([]);
    const next = worldDockReducer(state, {
      type: "repository.forked",
      repository: {
        id: "repo_tide",
        owner: "ren",
        slug: "tide-book",
        name: "潮汐之书",
        summary: "潮汐每 13 年一次反向。",
        tags: ["海洋"],
        stars: 184,
        forks: 23,
        seeds: 12,
        maturity: 72,
        updated: "3 小时前",
        version: "v1.2.0",
        visibility: "public",
        license: "free-fork-attribution",
        releases: [],
      },
    });

    expect(next.worlds[0].name).toBe("潮汐之书 · Fork");
    expect(next.worlds[0].visibility).toBe("private");
    expect(next.worlds[0].status).toBe("draft");
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test -- src/features/worlddock/__tests__/state.test.ts
```

Expected: FAIL，提示 `../state` 不存在。

- [x] **Step 3: 创建 reducer**

Create `src/features/worlddock/state.ts`:

```ts
import type { PublicRepository, World, WorldSuggestion } from "./domain";

export type WorldDockState = {
  worlds: World[];
  currentWorld: World | null;
  savedIds: string[];
  savedSettings: WorldSuggestion[];
  savedSeeds: WorldSuggestion[];
  savedConflicts: WorldSuggestion[];
};

export type WorldDockAction =
  | { type: "world.opened"; worldId: string }
  | { type: "suggestion.saved"; item: WorldSuggestion }
  | { type: "repository.forked"; repository: PublicRepository }
  | { type: "world.published"; worldId: string }
  | { type: "world.push.completed"; worldId: string };

export function createInitialWorldDockState(worlds: World[]): WorldDockState {
  return {
    worlds,
    currentWorld: null,
    savedIds: [],
    savedSettings: [],
    savedSeeds: [],
    savedConflicts: [],
  };
}

export function worldDockReducer(
  state: WorldDockState,
  action: WorldDockAction,
): WorldDockState {
  switch (action.type) {
    case "world.opened": {
      const currentWorld = state.worlds.find((world) => world.id === action.worldId) ?? null;
      return { ...state, currentWorld };
    }
    case "suggestion.saved": {
      if (state.savedIds.includes(action.item.id)) return state;

      const currentWorld = state.currentWorld
        ? {
            ...state.currentWorld,
            archive: action.item.kind === "setting"
              ? state.currentWorld.archive + 1
              : state.currentWorld.archive,
            seeds: action.item.kind === "seed"
              ? state.currentWorld.seeds + 1
              : state.currentWorld.seeds,
            conflicts: action.item.kind === "conflict"
              ? state.currentWorld.conflicts + 1
              : state.currentWorld.conflicts,
            maturity: Math.min(
              100,
              state.currentWorld.maturity + (action.item.kind === "setting" ? 6 : 3),
            ),
            hasUnsaved: false,
          }
        : null;

      return {
        ...state,
        currentWorld,
        savedIds: [...state.savedIds, action.item.id],
        savedSettings: action.item.kind === "setting"
          ? [...state.savedSettings, action.item]
          : state.savedSettings,
        savedSeeds: action.item.kind === "seed"
          ? [...state.savedSeeds, action.item]
          : state.savedSeeds,
        savedConflicts: action.item.kind === "conflict"
          ? [...state.savedConflicts, action.item]
          : state.savedConflicts,
        worlds: currentWorld
          ? state.worlds.map((world) => world.id === currentWorld.id ? currentWorld : world)
          : state.worlds,
      };
    }
    case "repository.forked": {
      const forkedWorld: World = {
        id: `fork_${action.repository.id}`,
        name: `${action.repository.name} · Fork`,
        type: "Forked World",
        tags: action.repository.tags,
        summary: action.repository.summary,
        maturity: action.repository.maturity ?? 20,
        status: "draft",
        visibility: "private",
        archive: 0,
        seeds: action.repository.seeds ?? 0,
        conflicts: 0,
        updated: "刚刚",
        mode: "cloud",
        hasUnsaved: false,
        hasUnpushed: false,
        isNew: true,
      };
      return {
        ...state,
        worlds: [forkedWorld, ...state.worlds],
        currentWorld: forkedWorld,
      };
    }
    case "world.published":
      return {
        ...state,
        worlds: state.worlds.map((world) =>
          world.id === action.worldId
            ? { ...world, status: "published", visibility: "public", hasUnsaved: false }
            : world,
        ),
        currentWorld: state.currentWorld?.id === action.worldId
          ? { ...state.currentWorld, status: "published", visibility: "public", hasUnsaved: false }
          : state.currentWorld,
      };
    case "world.push.completed":
      return {
        ...state,
        worlds: state.worlds.map((world) =>
          world.id === action.worldId
            ? { ...world, hasUnpushed: false, status: "published", visibility: "public" }
            : world,
        ),
        currentWorld: state.currentWorld?.id === action.worldId
          ? { ...state.currentWorld, hasUnpushed: false, status: "published", visibility: "public" }
          : state.currentWorld,
      };
    default:
      return state;
  }
}
```

- [x] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm test -- src/features/worlddock/__tests__/state.test.ts
```

Expected: PASS。

- [x] **Step 5: 在 `world-dock-app.tsx` 中先只导入 reducer 类型，不替换全部状态**

Modify `src/features/worlddock/world-dock-app.tsx`:

```ts
import { worldDockReducer } from "./state";
```

Add a lightweight usage near the imports or component body to avoid unused import while migration is gradual:

```ts
void worldDockReducer;
```

Expected: build still passes. Full state migration happens after community and publish flows stabilize.

---

### Task 3: 补齐 Agent 模式按钮组与后续建议产出

**Files:**
- Modify: `src/features/worlddock/view-workbench.tsx`
- Modify: `src/features/worlddock/world-dock-app.tsx`
- Test: `tests/e2e/creation-flow.spec.ts`

- [x] **Step 1: 新增 E2E 测试**

Create `tests/e2e/creation-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("creator can create a world, switch agent mode, and save suggestions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /新建世界/ }).click();
  await page.getByLabel(/初始灵感/).fill("一个世界里，记忆可以被买卖。");
  await page.getByRole("button", { name: /开始推演/ }).click();
  await expect(page.getByText("雏形已生成")).toBeVisible();
  await page.getByRole("button", { name: /确认并进入工作台/ }).click();

  await expect(page.getByText("可保存设定")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /扩展/ })).toBeVisible();
  await page.getByRole("button", { name: /挑刺/ }).click();
  await expect(page.getByText(/Agent · 挑刺/)).toBeVisible();

  await page.getByRole("button", { name: /保存/ }).first().click();
  await expect(page.getByText(/已保存到档案/)).toBeVisible();
  await page.getByRole("button", { name: /档案/ }).click();
  await expect(page.getByText("《记忆交易法》")).toBeVisible();
});
```

- [x] **Step 2: 运行 E2E 确认失败**

Run:

```bash
pnpm test:e2e -- tests/e2e/creation-flow.spec.ts
```

Expected: FAIL，原因是 Agent 模式按钮未渲染，或 label 不可访问。

- [x] **Step 3: 在 Composer 中渲染模式按钮**

Modify `src/features/worlddock/view-workbench.tsx` inside `Composer` before the textarea block:

```tsx
<div className="row gap-2" style={{ marginBottom: 8, flexWrap: "wrap" }}>
  {AGENT_MODES.map((agentMode) => (
    <button
      key={agentMode.id}
      className={"sb-btn " + (mode === agentMode.id ? "primary" : "")}
      onClick={() => onModeChange(agentMode.id)}
      title={agentMode.hint}
      type="button"
    >
      <Icon name={agentMode.ico} size={11} />
      <span>{agentMode.label}</span>
    </button>
  ))}
</div>
```

- [x] **Step 4: 用 modeFlash 给用户反馈**

Modify `Composer` below the mode button row:

```tsx
{modeFlash && (
  <div
    className="badge slate"
    style={{ marginBottom: 8, height: 20, width: "fit-content" }}
  >
    已切换为 {AGENT_MODES.find((agentMode) => agentMode.id === modeFlash)?.label}
  </div>
)}
```

- [x] **Step 5: 让后续 run 也能生成可保存建议**

Modify `startAgentRun` in `src/features/worlddock/world-dock-app.tsx`:

```ts
const suggestions = isInitial
  ? seedData.suggestions
  : getFollowUpSuggestions(agentMode, seedData);
```

Add helper below `getFollowUpResponse`:

```ts
function getFollowUpSuggestions(mode, seed) {
  if (mode === "seed") {
    return seed.suggestions.filter((item) => item.kind === "seed").slice(0, 1);
  }
  if (mode === "tension") {
    return seed.suggestions.filter((item) => item.kind === "conflict").slice(0, 1);
  }
  if (mode === "settle") {
    return seed.suggestions.filter((item) => item.kind === "setting").slice(0, 1);
  }
  return null;
}
```

- [x] **Step 6: 运行验证**

Run:

```bash
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/creation-flow.spec.ts
```

Expected: 全部通过。

---

### Task 4: 实现发布 / Push 前端闭环

**Files:**
- Create: `src/features/worlddock/view-publish.tsx`
- Modify: `src/features/worlddock/world-dock-app.tsx`
- Modify: `src/features/worlddock/components.tsx`
- Test: `tests/e2e/publish-flow.spec.ts`

- [x] **Step 1: 写发布 E2E**

Create `tests/e2e/publish-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("creator can review privacy boundaries and publish a world", async ({ page }) => {
  await page.goto("/");
  await page.getByText("潮汐之书").click();
  await page.getByRole("button", { name: /发布|Push/ }).click();

  await expect(page.getByRole("heading", { name: /发布|Push/ })).toBeVisible();
  await expect(page.getByText("不会公开")).toBeVisible();
  await expect(page.getByText("原始对话记录")).toBeVisible();
  await expect(page.getByText("API Key")).toBeVisible();
  await expect(page.getByText("实体级差异预览")).toBeVisible();

  await page.getByLabel("更新说明").fill("补齐公开仓库的首个快照。");
  await page.getByLabel("授权方式").selectOption("free-fork-attribution");
  await page.getByRole("button", { name: /确认发布/ }).click();
  await expect(page.getByText(/发布成功/)).toBeVisible();
  await expect(page.getByText(/已公开/)).toBeVisible();
});
```

- [x] **Step 2: 创建发布页组件**

Create `src/features/worlddock/view-publish.tsx`:

```tsx
import { useState } from "react";
import { Icon } from "./components";

const PUBLIC_ITEMS = [
  "世界总览",
  "已确认世界规则",
  "已确认势力",
  "已确认角色",
  "已确认冲突",
  "已确认故事种子",
  "README",
  "标签",
  "授权设置",
];

const PRIVATE_ITEMS = [
  "原始对话记录",
  "本地草稿",
  "未确认设定",
  "私密备注",
  "模型配置",
  "API Key",
  "本地日志",
  "token 记录",
];

export function PublishView({ mode, world, onBack, onConfirm }) {
  const [releaseNote, setReleaseNote] = useState("");
  const [license, setLicense] = useState("non-commercial-attribution");
  const isLocal = mode === "local";

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">
            / ren / {world.name} / <span style={{ color: "var(--fg-1)" }}>{isLocal ? "push" : "publish"}</span>
          </div>
          <h1>{isLocal ? "Push 到界仓" : "发布世界"}</h1>
          <div className="sub">
            {isLocal ? "Local Push 是公开快照，不是完整云同步。" : "Cloud Publish 会生成公开世界仓库快照。"}
          </div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回工作台</button>
      </div>

      <div style={{ padding: "20px 32px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section className="card" style={{ padding: 16 }}>
          <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>将公开</h2>
          <div className="col" style={{ gap: 8 }}>
            {PUBLIC_ITEMS.map((item) => (
              <div key={item} className="row gap-2" style={{ fontSize: 13 }}>
                <Icon name="check" size={12} style={{ color: "var(--sage)" }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: 16, borderColor: "var(--amber-dim)" }}>
          <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>不会公开</h2>
          <div className="col" style={{ gap: 8 }}>
            {PRIVATE_ITEMS.map((item) => (
              <div key={item} className="row gap-2" style={{ fontSize: 13 }}>
                <Icon name="eyeoff" size={12} style={{ color: "var(--amber)" }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: 16 }}>
          <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>实体级差异预览</h2>
          <div className="col" style={{ gap: 8 }}>
            <DiffRow label="新增设定" value={Math.max(1, world.archive)} />
            <DiffRow label="修改设定" value={2} />
            <DiffRow label="删除设定" value={0} />
            <DiffRow label="新增故事种子" value={Math.max(1, world.seeds)} />
          </div>
        </section>

        <section className="card" style={{ padding: 16 }}>
          <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>发布信息</h2>
          <label className="label" htmlFor="release-note">更新说明</label>
          <textarea
            id="release-note"
            className="textarea"
            value={releaseNote}
            onChange={(event) => setReleaseNote(event.target.value)}
            rows={4}
          />
          <label className="label" htmlFor="license" style={{ marginTop: 12 }}>授权方式</label>
          <select
            id="license"
            className="input"
            value={license}
            onChange={(event) => setLicense(event.target.value)}
          >
            <option value="all-rights-reserved">保留所有权利</option>
            <option value="non-commercial-attribution">允许非商业再创作，需署名</option>
            <option value="free-fork-attribution">允许自由 Fork，需署名</option>
            <option value="commercial-attribution">允许商业使用，需署名</option>
            <option value="no-fork">禁止 Fork，仅可浏览</option>
          </select>
          <button
            className="btn primary lg"
            disabled={!releaseNote.trim()}
            onClick={() => onConfirm({ releaseNote, license })}
            style={{ marginTop: 16 }}
          >
            <Icon name={isLocal ? "push" : "upload"} size={13} />
            <span>{isLocal ? "确认 Push" : "确认发布"}</span>
          </button>
        </section>
      </div>
    </div>
  );
}

function DiffRow({ label, value }) {
  return (
    <div className="row gap-2" style={{ justifyContent: "space-between", fontSize: 13 }}>
      <span>{label}</span>
      <span className="badge slate">{value}</span>
    </div>
  );
}
```

- [x] **Step 3: 接入顶层视图**

Modify `src/features/worlddock/world-dock-app.tsx`:

```ts
import { PublishView } from "./view-publish";
```

Add view union comment:

```ts
// worlds | create | workbench | archive | seeds | conflicts | publish | explore | settings
```

Change `StatusBar` usage:

```tsx
onOpenPublish={() => {
  if (currentWorld) setView("publish");
  else pushToast({ text: "请先打开一个世界", kind: "warn" });
}}
```

Add render branch:

```tsx
{view === "publish" && currentWorld && (
  <PublishView
    mode={t.mode}
    world={currentWorld}
    onBack={() => setView("workbench")}
    onConfirm={({ releaseNote }) => {
      setCurrentWorld((prev) => prev
        ? { ...prev, status: "published", visibility: "public", hasUnpushed: false, hasUnsaved: false }
        : prev);
      setWorlds((prev) => prev.map((world) =>
        world.id === currentWorld.id
          ? { ...world, status: "published", visibility: "public", hasUnpushed: false, hasUnsaved: false }
          : world,
      ));
      pushToast({
        kind: "save",
        text: `${t.mode === "local" ? "Push" : "发布"}成功 · ${releaseNote.slice(0, 18)}`,
        action: { label: "查看界仓", onClick: () => setView("explore") },
      });
      setView("workbench");
    }}
  />
)}
```

- [x] **Step 4: 运行验证**

Run:

```bash
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/publish-flow.spec.ts
```

Expected: PASS。

---

### Task 5: 实现 Explore 与公开世界仓库

**Files:**
- Create: `src/features/worlddock/view-community.tsx`
- Modify: `src/features/worlddock/fixtures.ts`
- Modify: `src/features/worlddock/world-dock-app.tsx`
- Test: `tests/e2e/community-flow.spec.ts`

- [x] **Step 1: 创建社区 fixture**

Create `src/features/worlddock/fixtures.ts`:

```ts
import type { PublicRepository } from "./domain";

export const PUBLIC_REPOSITORIES: PublicRepository[] = [
  {
    id: "repo_tide",
    owner: "ren",
    slug: "tide-book",
    name: "潮汐之书",
    summary: "潮汐每 13 年一次反向，文明的法律、婚姻与税收都建立在这个循环之上。",
    readme: "一个把自然周期写进制度深处的海洋奇幻世界。",
    tags: ["海洋", "宗教", "制度"],
    stars: 184,
    forks: 23,
    seeds: 12,
    maturity: 72,
    updated: "3 小时前",
    version: "v1.2.0",
    visibility: "public",
    license: "free-fork-attribution",
    releases: [
      {
        version: "v1.2.0",
        updated: "3 小时前",
        note: "新增潮税制度与两条高潜力故事种子。",
        addedSettings: 6,
        changedSettings: 2,
        removedSettings: 0,
        addedSeeds: 2,
        source: "cloud-publish",
      },
    ],
  },
  {
    id: "repo_ledger",
    owner: "lin",
    slug: "ledger-world",
    name: "账簿世界",
    summary: "所有人际关系都必须以双式记账法记录，未入账的承诺在法律上不存在。",
    readme: "一套由账本、债务和审计构成的蒸汽朋克社会。",
    tags: ["货币", "蒸汽", "审计"],
    stars: 92,
    forks: 11,
    seeds: 8,
    maturity: 54,
    updated: "昨天",
    version: "v0.8.0",
    visibility: "public",
    license: "non-commercial-attribution",
    releases: [
      {
        version: "v0.8.0",
        updated: "昨天",
        note: "公开审计庭与债务婚姻设定。",
        addedSettings: 4,
        changedSettings: 1,
        removedSettings: 0,
        addedSeeds: 1,
        source: "local-push",
      },
    ],
  },
];
```

- [x] **Step 2: 写社区 E2E**

Create `tests/e2e/community-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("visitor can browse, star, fork, view releases, and report a repository", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /界仓/ }).first().click();

  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  await page.getByText("潮汐之书").click();
  await expect(page.getByRole("heading", { name: "潮汐之书" })).toBeVisible();
  await expect(page.getByText("Overview")).toBeVisible();

  await page.getByRole("button", { name: /Star/ }).click();
  await expect(page.getByText(/已 Star/)).toBeVisible();

  await page.getByRole("button", { name: /Releases/ }).click();
  await expect(page.getByText("v1.2.0")).toBeVisible();

  await page.getByRole("button", { name: /举报/ }).click();
  await expect(page.getByText(/举报已提交/)).toBeVisible();

  await page.getByRole("button", { name: /Fork/ }).click();
  await expect(page.getByText(/Fork 成功/)).toBeVisible();
  await page.getByRole("button", { name: /世界/ }).click();
  await expect(page.getByText("潮汐之书 · Fork")).toBeVisible();
});
```

- [x] **Step 3: 创建社区视图**

Create `src/features/worlddock/view-community.tsx` with these exported components:

```tsx
import { useMemo, useState } from "react";
import type { PublicRepository } from "./domain";
import { PUBLIC_REPOSITORIES } from "./fixtures";
import { Icon } from "./components";

export function CommunityView({ onBack, onFork, onToast }) {
  const [query, setQuery] = useState("");
  const [activeRepository, setActiveRepository] = useState<PublicRepository | null>(null);
  const [starredIds, setStarredIds] = useState<string[]>([]);

  const filtered = useMemo(() => {
    return PUBLIC_REPOSITORIES.filter((repository) => {
      const text = `${repository.name} ${repository.summary} ${repository.tags.join(" ")}`;
      return !query || text.includes(query);
    });
  }, [query]);

  if (activeRepository) {
    return (
      <RepositoryView
        repository={activeRepository}
        starred={starredIds.includes(activeRepository.id)}
        onBack={() => setActiveRepository(null)}
        onStar={() => {
          setStarredIds((prev) => prev.includes(activeRepository.id)
            ? prev.filter((id) => id !== activeRepository.id)
            : [...prev, activeRepository.id]);
          onToast({ kind: "save", text: "已 Star · " + activeRepository.name });
        }}
        onFork={() => {
          onFork(activeRepository);
          onToast({ kind: "save", text: "Fork 成功 · 已生成私有世界" });
        }}
        onReport={() => onToast({ kind: "warn", text: "举报已提交 · 管理员会复核" })}
      />
    );
  }

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ 界仓社区</div>
          <h1>Explore</h1>
          <div className="sub">公开世界仓库 · 浏览、Star、Fork</div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回</button>
      </div>
      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)" }}>
        <input
          className="input"
          aria-label="搜索公开世界"
          placeholder="搜索世界、标签、作者..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: 320 }}
        />
      </div>
      <div style={{ padding: "20px 32px 40px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {filtered.map((repository) => (
          <button
            key={repository.id}
            className="card hover"
            onClick={() => setActiveRepository(repository)}
            style={{ textAlign: "left", padding: 16, cursor: "pointer" }}
          >
            <div className="row gap-2">
              <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>{repository.name}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>@{repository.owner}</span>
            </div>
            <p className="prose" style={{ fontSize: "var(--t-13)", color: "var(--fg-1)", lineHeight: 1.55 }}>{repository.summary}</p>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {repository.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
            </div>
            <div className="row gap-3 mono" style={{ marginTop: 12, fontSize: 11, color: "var(--fg-3)" }}>
              <span><Icon name="star" size={11} /> {repository.stars}</span>
              <span><Icon name="fork" size={11} /> {repository.forks}</span>
              <span>{repository.version}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function RepositoryView({ repository, starred, onBack, onStar, onFork, onReport }) {
  const [tab, setTab] = useState("overview");
  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ {repository.owner} / <span style={{ color: "var(--fg-1)" }}>{repository.slug}</span></div>
          <h1>{repository.name}</h1>
          <div className="sub">{repository.summary}</div>
        </div>
        <div className="row gap-2">
          <button className="btn" onClick={onStar}><Icon name="star" size={12} /><span>{starred ? "已 Star" : "Star"}</span></button>
          <button className="btn primary" onClick={onFork}><Icon name="fork" size={12} /><span>Fork</span></button>
          <button className="btn ghost" onClick={onBack}>返回 Explore</button>
        </div>
      </div>

      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 8 }}>
        {["overview", "archive", "seeds", "conflicts", "releases", "forks"].map((item) => (
          <button key={item} className={"sb-btn " + (tab === item ? "primary" : "")} onClick={() => setTab(item)}>
            {item === "overview" ? "Overview" : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
        <div className="flex" />
        <button className="sb-btn" onClick={onReport}><Icon name="flag" size={11} /><span>举报</span></button>
      </div>

      <div style={{ padding: "20px 32px 40px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 18 }}>
        <main className="card" style={{ padding: 18 }}>
          {tab === "overview" && (
            <>
              <h2 className="title-font" style={{ marginTop: 0 }}>README</h2>
              <p className="prose">{repository.readme}</p>
              <h3>推荐阅读路径</h3>
              <p className="prose">先读核心规则，再看冲突池，最后进入高潜力故事种子。</p>
            </>
          )}
          {tab === "releases" && (
            <div className="col" style={{ gap: 10 }}>
              {repository.releases.map((release) => (
                <div key={release.version} className="card" style={{ padding: 12 }}>
                  <div className="row gap-2">
                    <span className="badge slate">{release.version}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{release.updated}</span>
                  </div>
                  <p className="prose" style={{ fontSize: 13 }}>{release.note}</p>
                </div>
              ))}
            </div>
          )}
          {tab !== "overview" && tab !== "releases" && (
            <p className="prose">公开 {tab} 内容使用当前仓库快照展示，后端接入后按分页加载。</p>
          )}
        </main>
        <aside className="card" style={{ padding: 14 }}>
          <div className="label">授权</div>
          <div className="badge sage">{repository.license}</div>
          <div className="label" style={{ marginTop: 14 }}>统计</div>
          <div className="mono" style={{ fontSize: 12, color: "var(--fg-2)" }}>
            {repository.stars + (starred ? 1 : 0)} stars · {repository.forks} forks · {repository.version}
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [x] **Step 4: 替换 ExplorePlaceholder**

Modify `src/features/worlddock/world-dock-app.tsx`:

```ts
import { CommunityView } from "./view-community";
import { worldDockReducer, createInitialWorldDockState } from "./state";
```

Replace render branch:

```tsx
{view === "explore" && (
  <CommunityView
    onBack={() => setView("worlds")}
    onToast={pushToast}
    onFork={(repository) => {
      const next = worldDockReducer(createInitialWorldDockState(worlds), {
        type: "repository.forked",
        repository,
      });
      setWorlds(next.worlds);
      setCurrentWorld(next.currentWorld);
      setView("worlds");
    }}
  />
)}
```

Remove `ExplorePlaceholder`.

- [x] **Step 5: 运行验证**

Run:

```bash
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/community-flow.spec.ts
```

Expected: PASS。

---

### Task 6: 实现设置、用量、Local 连接状态

**Files:**
- Create: `src/features/worlddock/view-settings.tsx`
- Modify: `src/features/worlddock/world-dock-app.tsx`
- Test: `tests/e2e/settings-flow.spec.ts`

- [x] **Step 1: 写设置 E2E**

Create `tests/e2e/settings-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("user can inspect billing, model, and community connection states", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /设置/ }).click();

  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.getByText("当前余额")).toBeVisible();

  await page.getByRole("button", { name: "模型" }).click();
  await expect(page.getByLabel("MODEL_BASE_URL")).toBeVisible();
  await page.getByRole("button", { name: /测试连接/ }).click();
  await expect(page.getByText(/模型连接正常/)).toBeVisible();

  await page.getByRole("button", { name: "社区连接" }).click();
  await page.getByLabel("Access Token").fill("wd_mock_token");
  await page.getByRole("button", { name: /保存 Token/ }).click();
  await expect(page.getByText(/Token 已保存/)).toBeVisible();
});
```

- [x] **Step 2: 创建设置视图**

Create `src/features/worlddock/view-settings.tsx`:

```tsx
import { useState } from "react";
import { Icon } from "./components";

export function SettingsView({ mode, balance, onBack, onToast }) {
  const [tab, setTab] = useState("billing");
  const [modelStatus, setModelStatus] = useState("未测试");
  const [token, setToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState("未连接");

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ settings</div>
          <h1>设置</h1>
          <div className="sub">{mode === "local" ? "Local 模型与社区连接" : "Cloud 用量与账户"}</div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回</button>
      </div>

      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 8 }}>
        {[
          ["billing", "用量"],
          ["model", "模型"],
          ["community", "社区连接"],
          ["data", "导入导出"],
        ].map(([id, label]) => (
          <button key={id} className={"sb-btn " + (tab === id ? "primary" : "")} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 32px 40px", maxWidth: 860 }}>
        {tab === "billing" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>用量与余额</h2>
            <Metric label="当前余额" value={`¥${balance.toFixed(2)}`} />
            <Metric label="本月消耗" value="¥37.60" />
            <Metric label="最近一次 Agent Run" value="1,283 tokens / ¥1.83" />
            <div className="badge amber">余额低于 ¥5.00 时会拦截新的 Agent Run</div>
          </section>
        )}
        {tab === "model" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>模型配置</h2>
            <Field label="MODEL_PROVIDER" value="openai-compatible" />
            <Field label="MODEL_BASE_URL" value="http://localhost:8000/v1" />
            <Field label="MODEL_API_KEY" value="********" />
            <Field label="MODEL_NAME" value="qwen3-32b" />
            <Field label="MAX_TOKENS" value="4096" />
            <Field label="TEMPERATURE" value="0.7" />
            <Field label="CONTEXT_LIMIT" value="32768" />
            <button
              className="btn primary"
              onClick={() => {
                setModelStatus("模型连接正常 · 218ms");
                onToast({ kind: "save", text: "模型连接正常" });
              }}
            >
              <Icon name="bolt" size={12} /><span>测试连接</span>
            </button>
            <div style={{ marginTop: 12, fontSize: 13 }}>{modelStatus}</div>
          </section>
        )}
        {tab === "community" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>社区连接</h2>
            <label className="label" htmlFor="access-token">Access Token</label>
            <input
              id="access-token"
              className="input"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="wd_..."
              style={{ width: 360 }}
            />
            <div className="row gap-2" style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                disabled={!token.trim()}
                onClick={() => {
                  setTokenStatus("Token 已保存 · Push 权限正常");
                  onToast({ kind: "save", text: "Token 已保存" });
                }}
              >
                保存 Token
              </button>
              <button className="btn ghost" onClick={() => setTokenStatus("已断开社区连接")}>断开连接</button>
            </div>
            <div style={{ marginTop: 12, fontSize: 13 }}>{tokenStatus}</div>
          </section>
        )}
        {tab === "data" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>导入导出</h2>
            <button className="btn"><Icon name="download" size={12} /><span>导出世界包</span></button>
            <button className="btn" style={{ marginLeft: 8 }}><Icon name="upload" size={12} /><span>导入世界包</span></button>
          </section>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="row gap-2" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span className="label">{label}</span>
      <input className="input" aria-label={label} value={value} readOnly style={{ width: 360 }} />
    </label>
  );
}
```

- [x] **Step 3: 接入顶层视图**

Modify `src/features/worlddock/world-dock-app.tsx`:

```ts
import { SettingsView } from "./view-settings";
```

Replace settings branch:

```tsx
{view === "settings" && (
  <SettingsView
    mode={t.mode}
    balance={balance}
    onBack={() => setView("worlds")}
    onToast={pushToast}
  />
)}
```

Remove `SettingsPlaceholder`.

- [x] **Step 4: 给 Rail 设置按钮加可访问名称**

Modify settings rail button in `src/features/worlddock/components.tsx`:

```tsx
<button className="rail-item" onClick={() => onNav("settings")} aria-label="设置">
  <Icon name="settings" size={16}/>
</button>
```

- [x] **Step 5: 运行验证**

Run:

```bash
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/settings-flow.spec.ts
```

Expected: PASS。

---

### Task 7: 补齐核心异常状态

**Files:**
- Modify: `src/features/worlddock/world-dock-app.tsx`
- Modify: `src/features/worlddock/view-workbench.tsx`
- Modify: `src/features/worlddock/view-publish.tsx`
- Modify: `src/features/worlddock/view-community.tsx`
- Test: `src/features/worlddock/__tests__/state.test.ts`

- [x] **Step 1: 增加状态枚举**

Modify `src/features/worlddock/domain.ts`:

```ts
export const appErrorKindSchema = z.enum([
  "save-failed",
  "network-error",
  "model-unavailable",
  "insufficient-balance",
  "permission-denied",
  "community-disconnected",
]);

export type AppErrorKind = z.infer<typeof appErrorKindSchema>;
```

- [x] **Step 2: 在顶层增加 Mock 状态开关**

Modify `src/features/worlddock/world-dock-app.tsx` state:

```ts
const [mockFailure, setMockFailure] = useState(null); // null | "save-failed" | "model-unavailable" | "insufficient-balance"
```

Add checks to `startAgentRun`:

```ts
if (mockFailure === "model-unavailable") {
  pushToast({ kind: "warn", text: "模型不可用 · 请检查模型配置或稍后重试" });
  return;
}
if (t.mode === "cloud" && balance < 1) {
  pushToast({ kind: "warn", text: "余额不足 · 请充值后继续推演" });
  return;
}
```

Add check to `handleSave`:

```ts
if (mockFailure === "save-failed") {
  pushToast({ kind: "warn", text: "保存失败 · 请检查网络后重试" });
  return;
}
```

- [x] **Step 3: 在 Tweaks 中暴露异常状态**

Add inside `TweaksPanel`:

```tsx
<TweakSection label="异常状态 · ERRORS"/>
<TweakSelect
  label="Mock Failure"
  value={mockFailure || "none"}
  options={[
    { label: "无", value: "none" },
    { label: "保存失败", value: "save-failed" },
    { label: "模型不可用", value: "model-unavailable" },
    { label: "余额不足", value: "insufficient-balance" },
  ]}
  onChange={(value) => setMockFailure(value === "none" ? null : value)}
/>
```

- [x] **Step 4: 发布页处理社区未连接**

Modify `PublishView` props:

```tsx
export function PublishView({ mode, world, onBack, onConfirm, communityConnected = true }) {
```

Add before confirm button:

```tsx
{mode === "local" && !communityConnected && (
  <div className="badge amber" style={{ height: 22, marginTop: 12 }}>
    本地未连接社区，无法 Push
  </div>
)}
```

Disable confirm:

```tsx
disabled={!releaseNote.trim() || (isLocal && !communityConnected)}
```

- [x] **Step 5: 运行验证**

Run:

```bash
pnpm lint
pnpm build
```

Expected: PASS。手动从 Tweaks 选择三种异常状态，分别验证提示文案出现且不误改数据。

---

### Task 8: 移动端响应式修正

**Files:**
- Modify: `src/styles/base.css`
- Modify: `src/features/worlddock/view-worlds.tsx`
- Modify: `src/features/worlddock/view-workbench.tsx`
- Modify: `src/features/worlddock/view-publish.tsx`
- Modify: `src/features/worlddock/view-community.tsx`
- Test: `tests/e2e/responsive.spec.ts`

- [x] **Step 1: 写移动端 E2E**

Create `tests/e2e/responsive.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile user can reach core creation path without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的世界" })).toBeVisible();
  await page.getByRole("button", { name: /新建世界/ }).click();
  await expect(page.getByRole("heading", { name: "创建世界" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
```

- [x] **Step 2: 添加基础移动端 CSS**

Modify `src/styles/base.css`:

```css
@media (max-width: 720px) {
  .app {
    grid-template-rows: auto 1fr;
  }

  .statusbar {
    height: auto;
    min-height: var(--statusbar-h);
    flex-wrap: wrap;
    padding: 4px 6px;
  }

  .statusbar-section {
    height: 28px;
    padding: 0 6px;
  }

  .app-body {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .rail {
    width: 44px;
  }

  .rail-item {
    height: 44px;
  }

  .rail-item .lbl {
    display: none;
  }

  .page-head {
    padding: 16px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .page-head > .row {
    flex-wrap: wrap;
  }

  .view-scroll {
    overflow-x: hidden;
  }

  .drawer-body {
    overflow-x: hidden;
  }
}
```

- [x] **Step 3: 修改固定宽度输入框**

Replace inline `width: 240`, `width: 320`, `width: 360` styles in feature views with:

```tsx
style={{ width: "min(100%, 360px)" }}
```

For grids using `gridTemplateColumns: "1fr 1fr"` add a mobile-safe CSS class or inline:

```tsx
style={{
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
}}
```

- [x] **Step 4: 运行验证**

Run:

```bash
pnpm test:e2e -- tests/e2e/responsive.spec.ts
pnpm build
```

Expected: PASS。

---

### Task 9: 移除 `@ts-nocheck` 与修复 lint warnings

**Files:**
- Modify: `src/features/worlddock/components.tsx`
- Modify: `src/features/worlddock/view-workbench.tsx`
- Modify: `src/features/worlddock/view-worlds.tsx`
- Modify: `src/features/worlddock/view-archive.tsx`
- Modify: `src/features/worlddock/tweaks-panel.tsx`
- Modify: `src/features/worlddock/world-dock-app.tsx`

- [x] **Step 1: 先修复当前 lint warnings**

Run:

```bash
pnpm lint
```

Expected current warnings include unused `onDismiss`, unused `idx`, unused `modeFlash`/`onModeChange` if Task 3 not yet complete, missing dependency `seed`。

Apply these fixes:

```diff
- export const Toasts = ({ toasts, onDismiss }) => (
+ export const Toasts = ({ toasts }) => (
```

```diff
- {filtered.map((s, idx) => {
+ {filtered.map((s) => {
```

```tsx
// view-worlds.tsx useEffect dependency
}, [step, seedKey, seed]);
```

Replace short-circuit expressions that trigger `no-unused-expressions`:

```tsx
if (onDuplicate) onDuplicate(world.id);
if (onDelete) onDelete(world.id);
```

- [x] **Step 2: Remove one `@ts-nocheck` file at a time**

Order:

```txt
src/features/worlddock/domain.ts
src/features/worlddock/mock-data.ts
src/features/worlddock/components.tsx
src/features/worlddock/view-workbench.tsx
src/features/worlddock/view-worlds.tsx
src/features/worlddock/view-archive.tsx
src/features/worlddock/view-publish.tsx
src/features/worlddock/view-community.tsx
src/features/worlddock/view-settings.tsx
src/features/worlddock/world-dock-app.tsx
src/features/worlddock/tweaks-panel.tsx
```

After each file:

```bash
pnpm build
```

Expected: build passes before moving to the next file.

- [x] **Step 3: Add minimal component prop types**

For each exported component, add explicit prop type. Example diff for `StatusBar`:

```diff
+ type StatusBarProps = {
+   world: World | null;
+   mode: "cloud" | "local";
+   balance: number;
+   tokens: number;
+   onMode?: (mode: "cloud" | "local") => void;
+   onOpenPublish: () => void;
+   onOpenCommunity: () => void;
+ };
+
- export const StatusBar = ({ world, mode, balance, tokens, onMode, onOpenPublish, onOpenCommunity }) => {
+ export const StatusBar = ({ world, mode, balance, tokens, onMode, onOpenPublish, onOpenCommunity }: StatusBarProps) => {
```

Expanded type for reference:

```ts
type StatusBarProps = {
  world: World | null;
  mode: "cloud" | "local";
  balance: number;
  tokens: number;
  onMode?: (mode: "cloud" | "local") => void;
  onOpenPublish: () => void;
  onOpenCommunity: () => void;
};
```

- [x] **Step 4: Final quality gate**

Run:

```bash
pnpm lint
pnpm build
pnpm test
```

Expected: no lint warnings, build passes, tests pass.

---

### Task 10: 最终验收与文档更新

**Files:**
- Create: `docs/frontend_completion_checklist.md`
- Modify: `docs/frontend_design_requirements.md` only if requirements changed during implementation

- [x] **Step 1: 创建验收清单**

Create `docs/frontend_completion_checklist.md`:

```md
# WorldDock 前端完善验收清单

## 创作闭环

- [x] 从“一个世界里，记忆可以被买卖。”创建世界
- [x] 展示世界雏形确认卡
- [x] 进入工作台并看到 Mock Agent 流式输出
- [x] 展示至少 3 条可保存设定
- [x] 展示至少 1 条一致性提醒
- [x] 展示至少 3 个故事种子
- [x] 保存设定到世界档案
- [x] 保存故事种子到故事种子池

## 社区闭环

- [x] 浏览 Explore
- [x] 打开公开世界仓库页
- [x] 查看 Overview
- [x] 查看公开档案、故事种子、冲突池
- [x] Star 世界
- [x] Fork 世界并生成私有世界
- [x] 查看 Releases
- [x] 提交举报

## 发布 / Push 闭环

- [x] 从工作台进入发布 / Push
- [x] 选择发布内容
- [x] 明确展示不会公开的内容
- [x] 展示实体级差异预览
- [x] 填写更新说明
- [x] 选择授权
- [x] 确认发布
- [x] 世界状态变为已公开或已 Push

## Local / Cloud

- [x] Cloud 显示余额和本次消耗
- [x] Cloud 余额不足时阻止 Agent Run
- [x] Local 显示模型连接状态
- [x] Local 显示社区 Access Token 状态
- [x] Local Push 明确是公开快照

## 工程质量

- [x] `pnpm lint` 无 warning
- [x] `pnpm build` 通过
- [x] `pnpm test` 通过
- [x] `pnpm test:e2e` 通过
- [x] 移动端 390x844 无横向溢出
```

- [x] **Step 2: 运行全量命令**

Run:

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

Expected: all pass。

- [x] **Step 3: 手动验收**

Use dev server:

```bash
pnpm dev
```

Manual paths:

```txt
/                    # 当前入口，世界列表
创建世界 -> 工作台 -> 保存建议 -> 档案 / 种子 / 冲突
界仓 -> Explore -> 公开仓库 -> Star / Fork / Releases / 举报
工作台 -> 发布 / Push -> 确认发布 -> 状态变更
设置 -> 用量 / 模型 / 社区连接 / 导入导出
```

Expected: checklist 全部勾选。

---

## 执行顺序建议

1. Task 1-2：先建立 schema 和 reducer 测试，避免后续页面堆状态时失控。
2. Task 3：补齐创作闭环里最明显的 Agent 模式缺口。
3. Task 4-6：补发布、社区、设置三大产品闭环。
4. Task 7-8：补异常状态和移动端可用性。
5. Task 9-10：清理类型、lint、测试和最终验收文档。

## 提交建议

按任务提交，避免一个巨型 commit：

```bash
git add src/features/worlddock/domain.ts src/features/worlddock/__tests__/domain.test.ts src/features/worlddock/mock-data.ts
git commit -m "feat: add worlddock domain schemas"

git add src/features/worlddock/state.ts src/features/worlddock/__tests__/state.test.ts
git commit -m "feat: add worlddock prototype reducer"

git add src/features/worlddock/view-workbench.tsx src/features/worlddock/world-dock-app.tsx tests/e2e/creation-flow.spec.ts
git commit -m "feat: complete agent mode controls"

git add src/features/worlddock/view-publish.tsx src/features/worlddock/world-dock-app.tsx tests/e2e/publish-flow.spec.ts
git commit -m "feat: add publish and push prototype"

git add src/features/worlddock/view-community.tsx src/features/worlddock/fixtures.ts tests/e2e/community-flow.spec.ts
git commit -m "feat: add community repository prototype"

git add src/features/worlddock/view-settings.tsx tests/e2e/settings-flow.spec.ts
git commit -m "feat: add settings and usage states"

git add src styles tests docs
git commit -m "chore: complete frontend quality gates"
```

Before each commit, use anonymous commit identity if needed:

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```
