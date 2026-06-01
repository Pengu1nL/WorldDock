# Phase 14 世界包 CLI、个人访问令牌和轻量生态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Phase 14 从 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的“待重新验收”推进到有 API、CLI、scope 和文档证据支撑的 Alpha 完成状态。

**Architecture:** 当前仓库已经具备 Phase 14 主体：`@worlddock/domain` 定义 Alpha PAT scope，Nest API 暴露 Developer Access 和世界包导入导出接口，`@worlddock-cli` 通过 bearer PAT 调用 Cloud API。执行重点是补强 scope 回归测试、复跑 CLI/API 定向验收、确认公共 API 文档与真实 contract 一致，最后只在证据齐全后更新 Alpha 未完成任务记录。

**Tech Stack:** TypeScript、NestJS、Fastify、Zod、Vitest、Supertest、pnpm workspace、Node.js CLI、WorldDock world package v1。

---

## 来源和当前基线

来源记录：

- `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md` 的 Phase 14。
- `docs/superpowers/plans/2026-05-27-phase-14-developer-access-cli.md` 的早期粗粒度执行记录。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 当前仍把 Phase 14 标为“待重新验收”。

当前已存在的实现：

- `packages/domain/src/developer-access/index.ts` 已定义 `world:read`、`world:write`、`repository:read`、`billing:read`。
- `apps/api/src/modules/developer-access/developer-access.controller.ts` 已提供 `GET /v1/developer-access/scopes`、`POST /v1/developer-access/access-tokens` 和 `GET /v1/developer-access/repositories/:owner/:slug/pull`。
- `apps/api/src/modules/exports/exports.controller.ts` 已用 `world:read` 保护世界包导出和下载，用 `world:write` 保护世界包导入。
- `packages/worlddock-cli/src/main.ts` 已提供 `login`、`worlds list`、`worlds export`、`worlds import` 和 `repositories pull`。
- `docs/product/api.md` 已记录 Alpha API、scope 和 CLI 使用方式。

执行边界：

- 不实现本地 Docker 部署、Local 模型配置、真实 OAuth 设备登录或 Local Push 产品化。
- 不新增 SDK 包；Phase 14 的轻量生态入口只要求公共 API 文档和最小 CLI。
- 不把 `repository:push` 纳入 `docs/product/api.md` 的 Alpha public API scope 列表；它仍属于 Local Push 后续路线的兼容能力。
- 只有定向和全仓验收全部通过后，才更新 `2026-05-28-alpha-incomplete-tasks.md` 的 Phase 14 完成状态。

## 文件结构

- Verify: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
  确认 Phase 14 原始验收面。
- Verify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  读取待更新段落；执行完成后修改该文件。
- Verify: `packages/domain/src/developer-access/index.ts`
  Alpha PAT scope 和创建 token schema 的单一来源。
- Verify: `packages/domain/src/worlds/world-package.ts`
  CLI、Repository Pull、导入导出共同使用的 world package v1 schema。
- Verify: `apps/api/src/modules/auth/auth.service.ts`
  bearer session / access token 认证、scope 校验、token hash 和撤销语义。
- Verify: `apps/api/src/modules/auth/auth.controller.ts`
  现有个人 access token 管理 endpoint。
- Verify: `apps/api/src/modules/developer-access/developer-access.controller.ts`
  Phase 14 public developer API。
- Verify: `apps/api/src/modules/exports/exports.controller.ts`
  world package export/import 的 scope 门禁。
- Modify: `apps/api/test/public-api.integration-spec.ts`
  补强 Developer Access token 创建和 Repository Pull scope 回归。
- Modify: `apps/api/test/exports.integration-spec.ts`
  补强 `world:read` / `world:write` access token 对世界包导入导出的真实门禁测试。
- Modify: `packages/worlddock-cli/test/cli.test.ts`
  补强 CLI auth guidance、repository spec 校验和 JSON package contract 回归。
- Verify: `packages/worlddock-cli/src/main.ts`
  只在补强测试发现 drift 时做最小修复。
- Verify: `packages/worlddock-cli/package.json`
  确认 `test`、`lint`、`build` 可作为 Phase 14 验收入口。
- Verify: `docs/product/api.md`
  确认文档列出的 scope、endpoint 和 CLI 命令与测试覆盖一致。
- Modify after successful verification: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  将 Phase 14 标记为完成并写入验收证据。

## 提交身份检查

若执行过程中需要创建 commit，每个 commit step 前先运行：

```bash
git config user.name
git config user.email
```

如果输出包含真实姓名或个人邮箱，先在当前仓库设置通用身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

每个 commit step 后运行：

```bash
git log -1 --format=fuller
```

Expected: Author 和 Committer 都不包含真实姓名或个人邮箱。

### Task 1: 建立 Phase 14 现状基线

**Files:**
- Read: `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- Read: `docs/superpowers/plans/2026-05-27-phase-14-developer-access-cli.md`
- Read: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- Read: `packages/domain/src/developer-access/index.ts`
- Read: `packages/worlddock-cli/package.json`

- [ ] **Step 1: 确认主计划 Phase 14 验收点**

Run:

```bash
sed -n '2607,2656p' docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md
```

Expected: 输出包含 `world:read`、`world:write`、`repository:read`、`billing:read`，以及 `worlddock login`、`worlddock worlds list`、`worlddock worlds export`、`worlddock worlds import`、`worlddock repositories pull`。

- [ ] **Step 2: 确认当前待更新记录仍是 Phase 14**

Run:

```bash
sed -n '409,425p' docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected: 输出显示 Phase 14 状态为“待重新验收”，并说明需要复跑 public API integration、CLI test、CLI lint/build 和相关文档检查。

- [ ] **Step 3: 检查 Phase 14 必需文件全部存在**

Run:

```bash
for path in \
  'packages/domain/src/developer-access/index.ts' \
  'packages/domain/src/worlds/world-package.ts' \
  'apps/api/src/modules/developer-access/developer-access.controller.ts' \
  'apps/api/src/modules/developer-access/developer-access.module.ts' \
  'apps/api/src/modules/exports/exports.controller.ts' \
  'apps/api/test/public-api.integration-spec.ts' \
  'apps/api/test/exports.integration-spec.ts' \
  'packages/worlddock-cli/package.json' \
  'packages/worlddock-cli/src/main.ts' \
  'packages/worlddock-cli/test/cli.test.ts' \
  'docs/product/api.md'; do
  test -f "$path" || { echo "missing $path"; exit 1; }
done
```

Expected: 命令无输出并以 exit code 0 结束。

- [ ] **Step 4: 确认 Alpha scope 单一来源**

Run:

```bash
sed -n '1,80p' packages/domain/src/developer-access/index.ts
rg -n '"world:read"|"world:write"|"repository:read"|"billing:read"|repository:push' docs/product/api.md packages/domain/src/developer-access/index.ts apps/api/src/modules/developer-access apps/api/src/modules/auth/auth.service.ts
```

Expected: `packages/domain/src/developer-access/index.ts` 导出四个 Alpha scope；`docs/product/api.md` 只列出这四个 Alpha public API scope；`repository:push` 只在 Auth 兼容 Local Push 能力中出现，不进入 Developer Access scope endpoint。

- [ ] **Step 5: 确认开始执行前没有无关工作区漂移**

Run:

```bash
git status --short
```

Expected: 只允许看到本执行文档。若出现其他文件，先判断是否与 Phase 14 相关；无关改动不纳入本阶段提交。

### Task 2: 补强 Developer Access API 回归

**Files:**
- Modify: `apps/api/test/public-api.integration-spec.ts`
- Verify: `apps/api/src/modules/developer-access/developer-access.controller.ts`
- Verify: `apps/api/src/modules/auth/auth.service.ts`

- [ ] **Step 1: 在 public API integration 中补充 access token 不可再签发 PAT 的断言**

Modify `apps/api/test/public-api.integration-spec.ts`，在 `issues scoped tokens and requires repository:read for repository pull` 用例后追加：

```ts
  it("requires a user session to issue developer access tokens", async () => {
    const auth = createInMemoryAuthRepository();
    auth.users.set("user_1", { id: "user_1", email: "writer@example.com", name: "Writer", role: "user" });
    addAccessToken(auth, "wdl_repo_read", "user_1", ["repository:read"]);
    app = await createTestApp(auth, createInMemoryRepositoryRepository());

    await request(app.getHttpServer())
      .post("/v1/developer-access/access-tokens")
      .set("authorization", "Bearer wdl_repo_read")
      .send({ name: "Nested Token", scopes: ["repository:read"] })
      .expect(403);
  });
```

Expected: 该测试验证 `DeveloperAccessController.createAccessToken` 只能由 user session 调用，PAT 本身不能递归创建新的 PAT。

- [ ] **Step 2: 运行 public API 定向测试**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- public-api.integration-spec.ts
```

Expected: PASS，新增用例返回 403，既有 scope 列表和 Repository Pull 用例继续通过。

- [ ] **Step 3: 若 Step 2 暴露实现漂移，做最小修复**

Expected implementation shape in `apps/api/src/modules/developer-access/developer-access.controller.ts`:

```ts
  @Post("access-tokens")
  @UseGuards(WorldDockAuthGuard)
  async createAccessToken(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    const session = this.authService.assertSessionSubject(subject);
    const input = createPersonalAccessTokenSchema.parse(body);
    const issued = await this.authService.issueAccessToken(session.user.id, {
      name: input.name,
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });

    return {
      token: issued.plaintextToken,
      accessToken: issued.accessToken,
    };
  }
```

Expected: `assertSessionSubject` 保留在签发入口，scope schema 使用 `createPersonalAccessTokenSchema`，不接受 `repository:push`。

- [ ] **Step 4: 重新运行 public API 定向测试**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- public-api.integration-spec.ts
```

Expected: PASS。

### Task 3: 补强世界包导入导出的 access token scope 验证

**Files:**
- Modify: `apps/api/test/exports.integration-spec.ts`
- Verify: `apps/api/src/modules/exports/exports.controller.ts`
- Verify: `apps/api/src/modules/exports/exports.service.ts`

- [ ] **Step 1: 让 exports integration 的 in-memory auth repository 支持 access token**

Modify `apps/api/test/exports.integration-spec.ts` imports:

```ts
import { AUTH_REPOSITORY, hashToken, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
```

Replace `createInMemoryAuthRepository` with:

```ts
function createInMemoryAuthRepository() {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, StoredSession>();
  const accessTokens = new Map<string, StoredAccessToken>();
  return {
    users,
    sessions,
    accessTokens,
    async findUserById(id: string) { return users.get(id) ?? null; },
    async findSessionByToken(token: string) { return sessions.get(token) ?? null; },
    async deleteSession(token: string) { sessions.delete(token); },
    async listAccessTokens() { return []; },
    async createAccessToken(input: StoredAccessToken) { accessTokens.set(input.id, input); return input; },
    async findAccessTokenByHash(tokenHash: string) {
      return [...accessTokens.values()].find((token) => token.tokenHash === tokenHash) ?? null;
    },
    async markAccessTokenUsed(id: string, usedAt: Date) {
      const token = accessTokens.get(id);
      if (token) token.lastUsedAt = usedAt;
    },
    async revokeAccessToken() { return null; },
  } satisfies AuthRepository & { users: typeof users; sessions: typeof sessions; accessTokens: typeof accessTokens };
}
```

Add helper after `addSession`:

```ts
function addAccessToken(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string, name: string, scopes: string[]) {
  const now = new Date();
  repository.users.set(userId, { id: userId, email: `${userId}@example.com`, name, role: "user" });
  repository.accessTokens.set(`at_${token}`, {
    id: `at_${token}`,
    userId,
    name: token,
    tokenHash: hashToken(token),
    prefix: token.slice(0, 8),
    scopes,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: now,
  });
}
```

Expected: export tests can authenticate both session bearer tokens and `wdl_` PAT bearer tokens.

- [ ] **Step 2: 添加 world package scope integration test**

Add this test inside `describe("exports endpoints", () => { ... })` after the existing export/import/account export test:

```ts
  it("enforces world package access token scopes", async () => {
    const auth = createInMemoryAuthRepository();
    const worlds = createInMemoryWorldRepository();
    const repositories = createInMemoryRepositoryRepository();
    addAccessToken(auth, "wdl_world_read", "user_1", "ren", ["world:read"]);
    addAccessToken(auth, "wdl_world_write", "user_1", "ren", ["world:write"]);
    const world = await worlds.createWorld({
      ownerId: "user_1",
      name: "Scoped Export World",
      type: "奇幻",
      summary: "验证 PAT scope 的世界。",
      tags: ["scope"],
      mode: "cloud",
      maturity: 51,
    });
    app = await createTestApp(auth, worlds, repositories);

    const created = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/export`)
      .set("authorization", "Bearer wdl_world_read")
      .expect(201);

    const loaded = await request(app.getHttpServer())
      .get(`/v1/exports/${created.body.export.id}`)
      .set("authorization", "Bearer wdl_world_read")
      .expect(200);

    expect(loaded.body.package).toMatchObject({
      format: "worlddock.world-package.v1",
      world: { name: "Scoped Export World" },
    });

    await request(app.getHttpServer())
      .post("/v1/worlds/import")
      .set("authorization", "Bearer wdl_world_read")
      .send({ package: loaded.body.package })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/export`)
      .set("authorization", "Bearer wdl_world_write")
      .expect(403);

    const imported = await request(app.getHttpServer())
      .post("/v1/worlds/import")
      .set("authorization", "Bearer wdl_world_write")
      .send({ package: loaded.body.package })
      .expect(201);

    expect(imported.body.world).toMatchObject({
      name: "Scoped Export World",
      visibility: "private",
    });
  });
```

Expected: `world:read` can export/download but cannot import; `world:write` can import but cannot export/download.

- [ ] **Step 3: 运行 exports 定向测试**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- exports.integration-spec.ts
```

Expected: PASS，新增 access token scope 用例和既有 session export/import 用例全部通过。

- [ ] **Step 4: 若 Step 3 暴露 scope drift，修正 controller decorator**

Expected implementation shape in `apps/api/src/modules/exports/exports.controller.ts`:

```ts
  @Post("worlds/:worldId/export")
  @RequireScopes("world:read")
  exportWorld(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string) {
    return this.exportsService.exportWorld(subject, worldId);
  }

  @Get("exports/:exportId")
  @RequireScopes("world:read")
  getExport(@CurrentSubject() subject: AuthSubject, @Param("exportId") exportId: string) {
    return this.exportsService.getExport(subject, exportId);
  }

  @Post("worlds/import")
  @RequireScopes("world:write")
  importWorld(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    return this.exportsService.importWorld(subject, importWorldSchema.parse(body));
  }
```

Expected: scope decorator 保持在 controller 层，service 不重复解析 bearer token。

- [ ] **Step 5: 重新运行 public API 和 exports 定向测试**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- public-api.integration-spec.ts exports.integration-spec.ts
```

Expected: PASS。

### Task 4: 补强 CLI 行为回归

**Files:**
- Modify: `packages/worlddock-cli/test/cli.test.ts`
- Verify: `packages/worlddock-cli/src/main.ts`
- Verify: `packages/worlddock-cli/package.json`

- [ ] **Step 1: 添加缺少 token 的清晰错误测试**

Add this test inside `describe("worlddock cli", () => { ... })`:

```ts
  it("prints explicit auth guidance when token is missing", async () => {
    const stderr: string[] = [];

    await expect(runWorldDockCli(["worlds", "list"], {
      env: { WORLD_DOCK_API_URL: "https://api.worlddock.test" },
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(stderr[0]).toBe("WORLD_DOCK_TOKEN is required.");
  });
```

Expected: 未配置 `WORLD_DOCK_TOKEN` 时 CLI 不发起网络请求，返回 exit code 1，并输出固定错误。

- [ ] **Step 2: 添加 login 命令 smoke test**

Add this test inside `describe("worlddock cli", () => { ... })`:

```ts
  it("accepts login tokens without writing local files", async () => {
    const stdout: string[] = [];

    await expect(runWorldDockCli(["login", "--token", "wdl_login_token"], {
      env: {},
      stdout: (line) => stdout.push(line),
    })).resolves.toBe(0);

    expect(stdout[0]).toBe("WorldDock token detected. Export WORLD_DOCK_TOKEN for subsequent commands.");
  });
```

Expected: Alpha `login` 只做 token presence 检查，不写入本地 credential store。

- [ ] **Step 3: 添加 repository spec 校验测试**

Add this test inside `describe("worlddock cli", () => { ... })`:

```ts
  it.each(["memory-market", "ren/memory-market/typo"])("validates repository pull spec %s before calling the API", async (spec) => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const stderr: string[] = [];

    await expect(runWorldDockCli(["repositories", "pull", spec], {
      env,
      fetch: fetchMock as typeof fetch,
      stderr: (line) => stderr.push(line),
    })).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr[0]).toBe("Repository must be formatted as <owner>/<slug>.");
  });
```

Expected: 缺少 owner 或包含额外路径段的 repository spec 不访问 API。

- [ ] **Step 4: 运行 CLI test**

Run:

```bash
pnpm --filter @worlddock-cli test
```

Expected: PASS，所有 CLI 用例通过。

- [ ] **Step 5: 运行 CLI lint/build**

Run:

```bash
pnpm --filter @worlddock-cli lint
pnpm --filter @worlddock-cli build
```

Expected: 两条命令均 PASS。

- [ ] **Step 6: 若 Step 4 或 Step 5 暴露 CLI drift，修正最小实现**

Expected implementation shape in `packages/worlddock-cli/src/main.ts`:

```ts
function login(argv: string[], env: Record<string, string | undefined>, output: (line: string) => void, error: (line: string) => void) {
  const token = readOption(argv, "--token") ?? env.WORLD_DOCK_TOKEN;
  if (!token) {
    error("Set WORLD_DOCK_TOKEN or pass --token to use Alpha API access.");
    return 1;
  }
  output("WorldDock token detected. Export WORLD_DOCK_TOKEN for subsequent commands.");
  return 0;
}
```

```ts
function createApiClient(input: { apiUrl: string; token?: string; fetch: typeof fetch }) {
  if (!input.token) {
    throw new Error("WORLD_DOCK_TOKEN is required.");
  }
```

```ts
function parseRepositorySpec(spec: string) {
  const parts = spec.split("/");
  if (parts.length !== 2 || parts.some((part) => !part)) {
    throw new Error("Repository must be formatted as <owner>/<slug>.");
  }
  return parts as [string, string];
}
```

Expected: 修复保持 CLI 无本地部署依赖，不新增 credential 文件写入。

- [ ] **Step 7: 重新运行 CLI test/lint/build**

Run:

```bash
pnpm --filter @worlddock-cli test
pnpm --filter @worlddock-cli lint
pnpm --filter @worlddock-cli build
```

Expected: PASS。

### Task 5: 文档 contract 和静态一致性检查

**Files:**
- Verify: `docs/product/api.md`
- Verify: `packages/domain/src/developer-access/index.ts`
- Verify: `apps/api/src/modules/developer-access/developer-access.controller.ts`
- Verify: `packages/worlddock-cli/src/main.ts`

- [ ] **Step 1: 检查产品 API 文档的 endpoint 和 scope**

Run:

```bash
sed -n '1,120p' docs/product/api.md
```

Expected: 输出包含：

```txt
GET  /v1/developer-access/scopes
POST /v1/developer-access/access-tokens
GET  /v1/developer-access/repositories/:owner/:slug/pull
```

Expected: scope 列表只包含：

```txt
world:read
world:write
repository:read
billing:read
```

- [ ] **Step 2: 检查 CLI 文档命令与真实 CLI 路由一致**

Run:

```bash
rg -n "worlddock worlds list|worlddock worlds export|worlddock worlds import|worlddock repositories pull|/v1/worlds/import|/v1/developer-access/repositories" docs/product/api.md packages/worlddock-cli/src/main.ts packages/worlddock-cli/test/cli.test.ts
```

Expected: 文档、源码和测试同时覆盖 `worlds list`、`worlds export`、`worlds import`、`repositories pull`；Repository Pull 路径为 `/v1/developer-access/repositories/:owner/:slug/pull`。

- [ ] **Step 3: 检查 Alpha public API 文档没有混入 Local Push scope**

Run:

```bash
rg -n "repository:push|Local Push|local-push" docs/product/api.md packages/domain/src/developer-access/index.ts apps/api/src/modules/developer-access
```

Expected: 无命中。`repository:push` 可以继续存在于 `apps/api/src/modules/auth/auth.service.ts` 和 `apps/api/src/modules/repositories/repository.controller.ts`，但不属于 Phase 14 public API 文档或 Developer Access scope endpoint。

- [ ] **Step 4: 若文档 drift，按当前 contract 修改 `docs/product/api.md`**

Expected `docs/product/api.md` scope block:

```txt
Alpha personal access token scopes:

- `world:read`: list, read, and export owned cloud worlds.
- `world:write`: create, import, edit, and publish owned cloud worlds.
- `repository:read`: pull public repository world packages.
- `billing:read`: read Alpha credit balance, usage, and entitlements.
```

Expected CLI block:

```bash
WORLD_DOCK_API_URL=https://api.worlddock.example \
WORLD_DOCK_TOKEN=wdl_... \
worlddock worlds list

worlddock worlds export world_123
worlddock worlds import ./memory-market.worlddock.json
worlddock repositories pull ren/memory-market
```

- [ ] **Step 5: 重新运行文档一致性检查**

Run:

```bash
rg -n "repository:push|Local Push|local-push" docs/product/api.md packages/domain/src/developer-access/index.ts apps/api/src/modules/developer-access
rg -n "worlddock worlds list|worlddock worlds export|worlddock worlds import|worlddock repositories pull|/v1/worlds/import|/v1/developer-access/repositories" docs/product/api.md packages/worlddock-cli/src/main.ts packages/worlddock-cli/test/cli.test.ts
```

Expected: 第一条命令无命中；第二条命令命中文档、源码和测试。

### Task 6: Phase 14 定向验收和全仓回归

**Files:**
- Run: Phase 14 API、CLI、domain、docs 和全仓验收命令

- [ ] **Step 1: 运行 domain schema 验收**

Run:

```bash
pnpm --filter @worlddock/domain lint
pnpm --filter @worlddock/domain test
```

Expected: PASS。

- [ ] **Step 2: 运行 public API 和 world package integration**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- public-api.integration-spec.ts exports.integration-spec.ts
```

Expected: PASS。

- [ ] **Step 3: 运行 CLI 定向验收**

Run:

```bash
pnpm --filter @worlddock-cli test
pnpm --filter @worlddock-cli lint
pnpm --filter @worlddock-cli build
```

Expected: PASS。

- [ ] **Step 4: 运行 API lint**

Run:

```bash
pnpm --filter @worlddock/api lint
```

Expected: PASS。

- [ ] **Step 5: 运行全仓门禁**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: 三条命令均 PASS。

- [ ] **Step 6: 记录验收证据**

Expected evidence list for Task 7:

```txt
pnpm --filter @worlddock/domain lint
pnpm --filter @worlddock/domain test
pnpm --filter @worlddock/api test:integration -- public-api.integration-spec.ts exports.integration-spec.ts
pnpm --filter @worlddock-cli test
pnpm --filter @worlddock-cli lint
pnpm --filter @worlddock-cli build
pnpm --filter @worlddock/api lint
pnpm lint
pnpm test
pnpm build
```

### Task 7: 更新 Alpha 未完成任务记录

**Files:**
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [ ] **Step 1: 读取 Phase 14 待替换段落**

Run:

```bash
sed -n '409,425p' docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected: 该段仍显示“完成状态：待重新验收”。

- [ ] **Step 2: 将 Phase 14 段落替换为完成记录**

Replace the Phase 14 section with:

```md
## Phase 14: 世界包 CLI、个人访问令牌和轻量生态

完成状态：已完成。

完成依据：

- `packages/domain/src/developer-access/index.ts` 已定义 Alpha Personal Access Token scope：`world:read`、`world:write`、`repository:read` 和 `billing:read`，并提供创建 token 的 Zod schema。
- `apps/api/src/modules/developer-access/*` 已提供 Developer Access API：scope 列表、session-only PAT 签发和公开仓库世界包 pull。
- `apps/api/src/modules/exports/*` 已提供 Cloud 世界包导出、下载、导入和账户数据导出，并用 `world:read` / `world:write` 保护 PAT 访问。
- `packages/worlddock-cli/*` 已提供 `login`、`worlds list`、`worlds export`、`worlds import` 和 `repositories pull` 主命令，所有命令只依赖 Cloud API 和 bearer PAT，不要求本地部署。
- `docs/product/api.md` 已记录 Alpha public API scope、Developer Access endpoint 和 CLI 使用方式，且未把 Local Push scope 纳入 Phase 14 public API 文档。
- `apps/api/test/public-api.integration-spec.ts`、`apps/api/test/exports.integration-spec.ts` 和 `packages/worlddock-cli/test/cli.test.ts` 已覆盖 PAT scope、Repository Pull、世界包导入导出和 CLI contract。

验收证据：

- `pnpm --filter @worlddock/domain lint`：通过。
- `pnpm --filter @worlddock/domain test`：通过。
- `pnpm --filter @worlddock/api test:integration -- public-api.integration-spec.ts exports.integration-spec.ts`：通过。
- `pnpm --filter @worlddock-cli test`：通过。
- `pnpm --filter @worlddock-cli lint`：通过。
- `pnpm --filter @worlddock-cli build`：通过。
- `pnpm --filter @worlddock/api lint`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 14 不包含本地 Docker 部署、Local 模型配置、真实 OAuth 设备登录、SDK 包发布或 Local Push 产品化。
- `repository:push` 仍是 Local Push 兼容能力，不属于 Alpha public API 文档和 Developer Access scope endpoint。
```

Expected: Phase 14 状态改为“已完成”，证据命令必须和 Task 6 实际运行结果一致。

- [ ] **Step 3: 更新结论段落**

Modify the top conclusion in `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` so it no longer says Phase 14 remains pending. Expected wording:

```md
按“整项 Task 的文件、行为、测试和验收条件都满足才可勾选”的标准，截至本轮 Phase 14 验证，Phase 2 至 Phase 14 已可标记完成。
Phase 1 的早期静态缺口已有明显变化，但本轮未执行对应完整验收，因此仍保留为待重新验收状态。
```

- [ ] **Step 4: 更新建议执行顺序**

Expected wording in the suggestion section:

```md
1. 先重新验收 Phase 1，确认 CI、Docker、生产 env gate、静态导出移除、系统集成测试和运维 runbook 全部满足计划标准。
2. 保持 Phase 2 至 Phase 14 的验收测试作为回归门禁。
```

Expected: 不再保留“再重新验收 Phase 14”的待办。

- [ ] **Step 5: 检查文档不再保留 Phase 14 待重新验收表述**

Run:

```bash
rg -n "Phase 14.*待重新验收|Phase 1 与 Phase 14|再重新验收 Phase 14|暂不把 Phase 14" docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

Expected: 无命中。

### Task 8: 最终复核

**Files:**
- Read: `docs/superpowers/plans/2026-06-01-phase-14-developer-access-cli-completion.md`
- Read: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- Run: final status and focused searches

- [ ] **Step 1: 检查计划文档没有占位词**

Run:

```bash
rg -n 'TB[D]|TO[D]O|待[补]|稍后[补]|implement[ -]later|fill in detail[s]' docs/superpowers/plans/2026-06-01-phase-14-developer-access-cli-completion.md
```

Expected: 无命中。

- [ ] **Step 2: 检查 Phase 14 contract 的三组证据仍在**

Run:

```bash
rg -n "developer-access/scopes|developer-access/access-tokens|developer-access/repositories/.*/pull|worlds/.*/export|worlds/import" apps/api/test/public-api.integration-spec.ts apps/api/test/exports.integration-spec.ts packages/worlddock-cli/test/cli.test.ts docs/product/api.md
```

Expected: 命中 API integration、CLI test 和 product doc。

- [ ] **Step 3: 检查工作区只包含 Phase 14 相关改动**

Run:

```bash
git status --short
```

Expected: 只包含本执行文档、Phase 14 测试/文档修补和 `2026-05-28-alpha-incomplete-tasks.md` 的完成记录更新。

- [ ] **Step 4: 最终全仓验证**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: PASS。

- [ ] **Step 5: 准备交付说明**

Expected final summary:

```txt
Phase 14 已完成：补强了 Developer Access、世界包导入导出 PAT scope、CLI 行为回归和 API 文档一致性检查；已用定向 API/CLI 验收和全仓 lint/test/build 证明通过；`2026-05-28-alpha-incomplete-tasks.md` 已把 Phase 14 标为完成。
```

## 自检记录

- Spec coverage: 本计划覆盖 Phase 14 原始主计划的四个 PAT scope、五个 CLI 命令、Repository Pull、world package export/import、public API 文档和最终验收命令。
- Placeholder scan: 本计划已使用 Task 8 的分段 pattern 自检，未保留占位式任务描述。
- Type consistency: 计划内 scope 名称统一为 `world:read`、`world:write`、`repository:read`、`billing:read`；world package format 统一为 `worlddock.world-package.v1`；CLI 包 filter 统一使用 `@worlddock-cli`。
