# Phase 3 Cloud-only 主路径收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 Phase 3，让 Cloud Alpha 的产品范围、生产环境门禁、认证来源和登录后云端主路径都有可验证证据，并把 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 中的 Phase 3 改为完成。

**Architecture:** 保留当前 Next Web、Nest API、共享 config 包和现有 Cloud API client 边界。Phase 3 不新增后端业务能力，重点是把浏览器 session token 读写集中到 `apps/web/src/features/worlddock/api.ts`，让登录后的世界列表只依赖云端 API 状态，并用文档和测试关闭 Local/fixture 兜底路径。

**Tech Stack:** TypeScript、React、Next.js App Router、TanStack Query、Vitest、Playwright、Zod、pnpm workspace。

---

## 来源和当前基线

来源问题记录：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

已有 Phase 3 执行记录：`docs/superpowers/plans/2026-05-27-phase-3-cloud-only-main-path.md`

当前已具备：

- `docs/product/cloud-release-scope.md`
- `docs/product/local-deployment-later.md`
- `docs/product/cloud-api-contract.md`
- `packages/config/src/env.ts` 已有 `WORLD_DOCK_EDITION` 和 production cloud gate。
- `apps/web/tests/e2e/cloud-deployment-flow.spec.ts` 已覆盖认证后的错误状态。
- `apps/web/src/features/worlddock/api.ts` 已有 `canUseFixtures()` 和 `readStoredSessionToken()`。

剩余收口工作：

- 产品运行时文件仍直接读写 `worlddock.sessionToken`，需要改为共享 helper。
- Cloud deployment E2E 还需要证明认证后的空列表不会展示 Local tab 或 fixture world。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 仍把 Phase 3 记录为未完成，需要补上完成证据。

## 文件结构

- 修改：`apps/web/src/features/worlddock/api.ts`
  - 统一承载浏览器 session token 存储 helper。
- 修改：`apps/web/src/features/worlddock/api.test.ts`
  - 覆盖 session token 存储 helper 的读取、写入和清理行为。
- 修改：`apps/web/src/features/worlddock/runtime-no-mock.test.ts`
  - 防止产品运行时文件直接调用 `localStorage.getItem("worlddock.sessionToken")` 和 `localStorage.setItem("worlddock.sessionToken", ...)`。
- 修改：`apps/web/src/app/(auth)/login/page.tsx`
  - 登录成功后通过共享 helper 写入 session token。
- 修改：`apps/web/src/app/(auth)/register/page.tsx`
  - 注册成功后通过共享 helper 写入 session token。
- 修改：`apps/web/src/features/onboarding/onboarding-flow.tsx`
  - Onboarding 通过共享 helper 读取 session token。
- 修改：`apps/web/src/features/worlddock/world-dock-app.tsx`
  - App shell 通过共享 helper 读取 session token。
- 修改：`apps/web/src/features/worlddock/view-community.tsx`
  - 社区视图通过共享 helper 读取 session token。
- 修改：`apps/web/src/features/worlddock/view-settings.tsx`
  - 设置视图通过共享 helper 读取 session token。
- 修改：`apps/web/tests/e2e/cloud-deployment-flow.spec.ts`
  - 增加认证后空列表的 Cloud-only 回归覆盖。
- 修改：`docs/superpowers/plans/2026-05-27-phase-3-cloud-only-main-path.md`
  - 链接本收口计划并记录最终验证证据。
- 修改：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  - 用完成证据标记 Phase 3 完成。

## 任务 1：强化共享 Session Token Helper

**文件：**
- 修改：`apps/web/src/features/worlddock/api.ts`
- 修改：`apps/web/src/features/worlddock/api.test.ts`
- 修改：`apps/web/src/features/worlddock/runtime-no-mock.test.ts`

- [ ] **步骤 1：写入失败用 helper 测试**

在 `apps/web/src/features/worlddock/api.test.ts` 中扩展 import：

```ts
import {
  canUseFixtures,
  clearStoredSessionToken,
  createAccessToken,
  createArchiveEntry,
  createAgentRun,
  createWorld,
  fetchAgentEvents,
  getBillingBalance,
  getBillingUsage,
  getPublicRepository,
  listArchiveEntries,
  listAccessTokens,
  listConflicts,
  listPublicRepositories,
  searchPublicRepositories,
  listRepositoryReleases,
  listStorySeeds,
  listWorlds,
  localPushRepository,
  publishWorld,
  reportRepository,
  revokeAccessToken,
  readStoredSessionToken,
  saveAgentSuggestion,
  starRepository,
  streamAgentEvents,
  unstarRepository,
  forkRepository,
  writeStoredSessionToken,
} from "./api";
```

在现有 `reads the stored session token through a single cloud auth helper` 测试之后加入：

```ts
  it("writes and clears the stored session token through a single cloud auth helper", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    writeStoredSessionToken(" session_alpha ", storage);
    expect(readStoredSessionToken(storage)).toBe("session_alpha");

    writeStoredSessionToken("", storage);
    expect(readStoredSessionToken(storage)).toBe("session_alpha");

    clearStoredSessionToken(storage);
    expect(readStoredSessionToken(storage)).toBe("");
  });
```

- [ ] **步骤 2：写入失败用运行时边界测试**

在 `apps/web/src/features/worlddock/runtime-no-mock.test.ts` 中，用显式路径组替换当前 `runtimeFiles`：

```ts
const runtimeFiles = [
  join(__dirname, "world-dock-app.tsx"),
  join(__dirname, "view-worlds.tsx"),
  join(__dirname, "view-community.tsx"),
  join(__dirname, "view-settings.tsx"),
];

const sessionBoundaryFiles = [
  join(__dirname, "world-dock-app.tsx"),
  join(__dirname, "view-community.tsx"),
  join(__dirname, "view-settings.tsx"),
  join(__dirname, "../onboarding/onboarding-flow.tsx"),
  join(__dirname, "../../app/(auth)/login/page.tsx"),
  join(__dirname, "../../app/(auth)/register/page.tsx"),
];
```

因为 `runtimeFiles` 现在保存完整路径，同步更新已有循环：

```ts
    for (const file of runtimeFiles) {
      const source = readFileSync(file, "utf8");
```

在同一个 `describe` block 中加入第二个测试：

```ts
  it("keeps direct browser session token storage access inside the shared API helper", () => {
    for (const file of sessionBoundaryFiles) {
      const source = readFileSync(file, "utf8");

      expect(source).not.toContain('localStorage.getItem("worlddock.sessionToken")');
      expect(source).not.toContain('localStorage.setItem("worlddock.sessionToken"');
      expect(source).not.toContain("localStorage.getItem('worlddock.sessionToken')");
      expect(source).not.toContain("localStorage.setItem('worlddock.sessionToken'");
    }
  });
```

- [ ] **步骤 3：运行定向测试并确认失败**

运行：

```bash
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
```

预期：FAIL。原因是 `clearStoredSessionToken` 和 `writeStoredSessionToken` 尚未导出，且运行时文件仍包含直接 session token 存储访问。

- [ ] **步骤 4：实现存储 helper**

在 `apps/web/src/features/worlddock/api.ts` 中，把文件顶部附近的 storage type 和 helper block 改为：

```ts
type SessionTokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function canUseFixtures(env: FixtureEnvironment = process.env) {
  return env.NODE_ENV !== "production" && env.NEXT_PUBLIC_WORLD_DOCK_FIXTURES === "1";
}

export function readStoredSessionToken(storage: SessionTokenStorage | null = getBrowserSessionStorage()) {
  return storage?.getItem(WORLD_DOCK_SESSION_TOKEN_KEY) ?? "";
}

export function writeStoredSessionToken(
  token: string,
  storage: SessionTokenStorage | null = getBrowserSessionStorage(),
) {
  const normalized = token.trim();
  if (!normalized) return;
  storage?.setItem(WORLD_DOCK_SESSION_TOKEN_KEY, normalized);
}

export function clearStoredSessionToken(storage: SessionTokenStorage | null = getBrowserSessionStorage()) {
  storage?.removeItem(WORLD_DOCK_SESSION_TOKEN_KEY);
}
```

保留文件底部现有的 `getBrowserSessionStorage()` 实现：

```ts
function getBrowserSessionStorage(): SessionTokenStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}
```

- [ ] **步骤 5：运行 helper 测试**

运行：

```bash
pnpm --filter @worlddock/web test -- api.test.ts
```

预期：PASS。运行时边界测试在任务 2 替换直接调用之前仍可以失败。

## 任务 2：替换产品运行时的直接 Session Token 访问

**文件：**
- 修改：`apps/web/src/app/(auth)/login/page.tsx`
- 修改：`apps/web/src/app/(auth)/register/page.tsx`
- 修改：`apps/web/src/features/onboarding/onboarding-flow.tsx`
- 修改：`apps/web/src/features/worlddock/world-dock-app.tsx`
- 修改：`apps/web/src/features/worlddock/view-community.tsx`
- 修改：`apps/web/src/features/worlddock/view-settings.tsx`

- [ ] **步骤 1：更新登录页写入**

在 `apps/web/src/app/(auth)/login/page.tsx` 中加入：

```ts
import { writeStoredSessionToken } from "@/features/worlddock/api";
```

替换：

```ts
    if (typeof token === "string") {
      window.localStorage.setItem("worlddock.sessionToken", token);
    }
```

替换为：

```ts
    if (typeof token === "string") {
      writeStoredSessionToken(token);
    }
```

- [ ] **步骤 2：更新注册页写入**

在 `apps/web/src/app/(auth)/register/page.tsx` 中加入：

```ts
import { writeStoredSessionToken } from "@/features/worlddock/api";
```

替换：

```ts
    if (typeof token === "string") {
      window.localStorage.setItem("worlddock.sessionToken", token);
    }
```

替换为：

```ts
    if (typeof token === "string") {
      writeStoredSessionToken(token);
    }
```

- [ ] **步骤 3：更新 onboarding 读取**

在 `apps/web/src/features/onboarding/onboarding-flow.tsx` 中加入：

```ts
import { readStoredSessionToken } from "../worlddock/api";
```

替换：

```ts
    const token = window.localStorage.getItem("worlddock.sessionToken");
```

替换为：

```ts
    const token = readStoredSessionToken();
```

- [ ] **步骤 4：更新 app shell 读取**

在 `apps/web/src/features/worlddock/world-dock-app.tsx` 中，把 `readStoredSessionToken` 加到现有 `./api` import：

```ts
  publishWorld,
  readStoredSessionToken,
  saveAgentSuggestion,
```

替换：

```ts
  useEffect(() => {
    setSessionToken(window.localStorage.getItem("worlddock.sessionToken") ?? "");
  }, []);
```

替换为：

```ts
  useEffect(() => {
    setSessionToken(readStoredSessionToken());
  }, []);
```

- [ ] **步骤 5：更新社区视图读取**

在 `apps/web/src/features/worlddock/view-community.tsx` 中，把 `readStoredSessionToken` 加到现有 `./api` import：

```ts
  listCommunityRepositories,
  readStoredSessionToken,
  removeRepositoryFromCollection,
```

替换：

```ts
  const sessionToken = useCallback(() => typeof window === "undefined"
    ? ""
    : window.localStorage.getItem("worlddock.sessionToken") ?? "", []);
```

替换为：

```ts
  const sessionToken = useCallback(() => readStoredSessionToken(), []);
```

- [ ] **步骤 6：更新设置视图读取**

在 `apps/web/src/features/worlddock/view-settings.tsx` 中，把 `readStoredSessionToken` 加到现有 `./api` import：

```ts
  listAccessTokens,
  readStoredSessionToken,
  revokeAccessToken,
```

替换：

```ts
  const sessionToken = () => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("worlddock.sessionToken") ?? "";
  };
```

替换为：

```ts
  const sessionToken = useCallback(() => readStoredSessionToken(), []);
```

同步更新 `refreshBilling` dependencies：

```ts
  }, [onToast, sessionToken]);
```

- [ ] **步骤 7：运行运行时边界测试**

运行：

```bash
pnpm --filter @worlddock/web test -- runtime-no-mock.test.ts
```

预期：PASS。E2E setup code 仍允许直接读写 session token，但产品运行时文件必须通过 `api.ts`。

- [ ] **步骤 8：提交 session helper 边界**

运行：

```bash
git config user.name
git config user.email
git config user.name "Codex"
git config user.email "codex@openai.com"
git add \
  'apps/web/src/app/(auth)/login/page.tsx' \
  'apps/web/src/app/(auth)/register/page.tsx' \
  apps/web/src/features/onboarding/onboarding-flow.tsx \
  apps/web/src/features/worlddock/api.ts \
  apps/web/src/features/worlddock/api.test.ts \
  apps/web/src/features/worlddock/runtime-no-mock.test.ts \
  apps/web/src/features/worlddock/view-community.tsx \
  apps/web/src/features/worlddock/view-settings.tsx \
  apps/web/src/features/worlddock/world-dock-app.tsx
git commit -m "fix: centralize cloud session token storage"
git log -1 --format=fuller
```

预期：Author 和 Committer 均为 `Codex <codex@openai.com>`，且字段里不包含用户真实姓名或个人邮箱。

## 任务 3：扩展 Cloud 部署流程覆盖

**文件：**
- 修改：`apps/web/tests/e2e/cloud-deployment-flow.spec.ts`
- 仅当新增 E2E 失败时修改：`apps/web/src/features/worlddock/view-worlds.tsx`
- 仅当新增 E2E 失败时修改：`apps/web/src/features/worlddock/world-dock-app.tsx`

- [ ] **步骤 1：增加认证后空列表 E2E 覆盖**

把这个测试追加到 `apps/web/tests/e2e/cloud-deployment-flow.spec.ts`：

```ts
test("authenticated empty cloud world list hides Local paths and fixture worlds", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_cloud_empty");
  });

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ worlds: [] }),
    });
  });

  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "我的世界" })).toBeVisible();
  await expect(page.getByText("还没有云端世界。")).toBeVisible();
  await expect(page.getByRole("button", { name: /Local/ })).toHaveCount(0);
  await expect(page.getByText("潮汐之书")).toHaveCount(0);
});
```

- [ ] **步骤 2：运行 cloud deployment E2E**

运行：

```bash
pnpm --filter @worlddock/web test:e2e -- cloud-deployment-flow.spec.ts
```

预期：任务 1 和任务 2 完成后 PASS。若因 Local tab 仍可见而失败，继续步骤 3；若已通过，跳过步骤 3，并保留该测试作为回归覆盖。

- [ ] **步骤 3：必要时修复 Cloud-only 列表渲染**

如果 E2E 报告 Local tab 可见，确认 `apps/web/src/features/worlddock/world-dock-app.tsx` 从认证状态传入 `cloudOnly`：

```tsx
                cloudState={cloudWorldsState}
                cloudOnly={Boolean(sessionToken)}
```

确认 `apps/web/src/features/worlddock/view-worlds.tsx` 只在非 Cloud-only mode 下加入 Local filter：

```tsx
          ...(!cloudOnly ? [{ id: "local", label: "Local", n: worlds.filter((w: any) => w.mode === "local").length }] : []),
```

重新运行：

```bash
pnpm --filter @worlddock/web test:e2e -- cloud-deployment-flow.spec.ts
```

预期：PASS。

- [ ] **步骤 4：提交 E2E 覆盖**

运行：

```bash
git add apps/web/tests/e2e/cloud-deployment-flow.spec.ts apps/web/src/features/worlddock/view-worlds.tsx apps/web/src/features/worlddock/world-dock-app.tsx
git commit -m "test: cover cloud-only empty world list"
git log -1 --format=fuller
```

预期：Author 和 Committer 均为 `Codex <codex@openai.com>`。

## 任务 4：收口 Phase 3 记录和验证

**文件：**
- 修改：`docs/superpowers/plans/2026-05-27-phase-3-cloud-only-main-path.md`
- 修改：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [ ] **步骤 1：更新旧 Phase 3 执行记录**

把这个小节追加到 `docs/superpowers/plans/2026-05-27-phase-3-cloud-only-main-path.md`：

````md
## 2026-05-28 收口记录

收口计划：`docs/superpowers/plans/2026-05-28-phase-3-cloud-only-main-path-completion.md`

补充收口：

- 产品运行时文件现在只通过 `apps/web/src/features/worlddock/api.ts` 的共享 helper 读写 `worlddock.sessionToken`。
- 已认证 Cloud 世界列表覆盖 loading、error、empty 和 ready 状态，不回退到 fixture。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 已更新，Phase 3 标记为完成。

验证：

```bash
pnpm --filter @worlddock/config test -- env.test.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- cloud-deployment-flow.spec.ts
pnpm lint
pnpm test
pnpm build
```
````

- [ ] **步骤 2：替换 incomplete-task 记录里的 Phase 3 小节**

在 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 中，用以下内容替换当前 Phase 3 小节：

```md
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
```

- [ ] **步骤 3：运行文档和源码扫描**

运行：

```bash
rg -n '缺少 `docs/product/cloud-release-scope.md`|缺少 `docs/product/local-deployment-later.md`|缺少 `docs/product/cloud-api-contract.md`|WORLD_DOCK_EDITION.*缺少|cloud-deployment-flow.spec.ts`。' docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
rg -n 'localStorage\\.getItem\\("worlddock\\.sessionToken"\\)|localStorage\\.setItem\\("worlddock\\.sessionToken"' apps/web/src
```

预期：两个命令都没有匹配结果。

- [ ] **步骤 4：运行 Phase 3 验证套件**

运行：

```bash
pnpm --filter @worlddock/config test -- env.test.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- cloud-deployment-flow.spec.ts
```

预期：PASS。

- [ ] **步骤 5：运行 workspace 验证**

运行：

```bash
pnpm lint
pnpm test
pnpm build
```

预期：PASS。

- [ ] **步骤 6：提交文档收口**

运行：

```bash
git add \
  docs/superpowers/plans/2026-05-28-phase-3-cloud-only-main-path-completion.md \
  docs/superpowers/plans/2026-05-27-phase-3-cloud-only-main-path.md \
  docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
git commit -m "docs: mark phase 3 cloud-only path complete"
git log -1 --format=fuller
```

预期：Author 和 Committer 均为 `Codex <codex@openai.com>`。

## 最终验证清单

- [ ] `pnpm --filter @worlddock/config test -- env.test.ts` 通过。
- [ ] `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts` 通过。
- [ ] `pnpm --filter @worlddock/web test:e2e -- cloud-deployment-flow.spec.ts` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm build` 通过。
- [ ] `rg -n 'localStorage\\.getItem\\("worlddock\\.sessionToken"\\)|localStorage\\.setItem\\("worlddock\\.sessionToken"' apps/web/src` 没有匹配结果。
- [ ] `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 中的 Phase 3 写明 `完成状态：已完成。`
- [ ] 最新提交通过 `git log -1 --format=fuller` 身份复核。

## 自检

需求覆盖：

- Cloud 范围文档：已存在，并纳入完成证据。
- Local 部署延后：已存在，并纳入完成证据。
- Cloud API contract：已存在，并纳入完成证据。
- Production cloud edition gate：已存在，并由 `env.test.ts` 覆盖。
- 产品代码不再手动读取 session token：由 Tasks 1 和 2 实现，并由 `runtime-no-mock.test.ts` 守住。
- 认证后无 Local/fixture 兜底：由现有错误状态 E2E 和新增空列表 E2E 覆盖。
- 完成状态更新：由任务 4 实现。

占位扫描：

- 本计划使用具体文件、命令、代码片段和预期结果。
- 没有步骤依赖未定义的未来行为。

类型一致性：

- Session helper 在测试和实现中使用同一个 `SessionTokenStorage` type。
- 产品组件调用 `readStoredSessionToken()`，认证页面调用 `writeStoredSessionToken(token)`。
