# Phase 10 导入导出与数据权利收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Phase 10，让 Alpha 创作者可以导出世界包、导入世界包、请求账户数据导出，并在删除账户前看到明确的数据导出确认路径。

**Architecture:** 共享 domain 包定义稳定的 `worlddock.world-package.v1` JSON contract；Nest `ExportsModule` 在认证后读取用户自己的世界和资产，生成同步 ready export，并允许把合法世界包导入为新的私有 Cloud 世界。Web 设置页把世界导入导出和账户数据权利集中到 `导入导出` tab；Worker 保留 `exports` BullMQ 队列封装，为账户数据导出的异步化提供可测入口，但 Alpha UI 仍可使用立即 ready 的 JSON 响应完成闭环。

**Tech Stack:** TypeScript、Zod、NestJS、Prisma repository contracts、BullMQ、React、Next.js App Router、Vitest、Playwright、pnpm workspace。

---

## 来源和当前基线

来源记录：

- `docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md` 的 Phase 10。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 10 未完成清单。

当前工作区已经出现 Phase 10 相关文件，执行时先验收，不要按旧清单盲目新增同名文件：

- `packages/domain/src/worlds/world-package.ts`
- `apps/api/src/modules/exports/exports.controller.ts`
- `apps/api/src/modules/exports/exports.service.ts`
- `apps/api/src/modules/exports/exports.module.ts`
- `apps/worker/src/export-jobs.ts`
- `apps/web/src/features/account/data-rights-page.tsx`
- `apps/web/src/features/worlds/import-export-panel.tsx`
- `apps/api/test/exports.integration-spec.ts`
- `apps/web/tests/e2e/import-export.spec.ts`

执行原则：

- 先跑 Phase 10 定向验收；若已经通过，进入文档语言收口和完成记录更新。
- 若验收失败，按下面任务逐项修复，不重构 Phase 4 资产编辑器、Phase 6 发布/Fork 或 Phase 7 账本逻辑。
- 世界包是用户可检查的 JSON 文件格式，Alpha 不引入二进制压缩包、批量附件打包或对象存储下载页。
- 导入世界包只能创建当前用户自己的私有 Cloud 世界；不能覆盖现有世界、不能发布、不能写入别人的账户。
- 账户删除只做 Alpha 软删除排期；删除按钮必须要求先生成账户数据导出。
- 文档内容使用简体中文。

## 文件结构

- 修改：`packages/domain/src/worlds/world-package.ts`
  - 固定 `worlddock.world-package.v1` schema、世界 metadata、资产列表和 release 摘要 contract。
- 修改：`packages/domain/src/index.ts`
  - 从 domain 根入口导出 `WorldPackage` 和 `worldPackageSchema`。
- 修改：`apps/api/src/modules/exports/exports.controller.ts`
  - 暴露 `POST /v1/worlds/:worldId/export`、`GET /v1/exports/:exportId`、`POST /v1/worlds/import`、`POST /v1/account/data-export`、`GET /v1/account/data-export/:exportId`。
- 修改：`apps/api/src/modules/exports/exports.service.ts`
  - 负责 owner 权限校验、世界包生成、导入资产映射、账户数据导出和 export ownership 校验。
- 修改：`apps/api/src/modules/exports/exports.module.ts`
  - 接入 `AuthModule`、`WorldsModule` 和 `RepositoryModule`。
- 修改：`apps/api/src/app.module.ts`
  - 确认 `ExportsModule` 已进入主 API module。
- 修改：`apps/worker/src/export-jobs.ts`
  - 提供 `exports` 队列、`account-data-export` job name、enqueue helper 和 worker factory。
- 修改：`apps/web/src/features/worlddock/api.ts`
  - 增加世界导出、世界导入、账户数据导出和账户删除 API client。
- 修改：`apps/web/src/features/worlds/import-export-panel.tsx`
  - 提供当前世界导出、JSON 文本预览和粘贴 JSON 导入。
- 修改：`apps/web/src/features/account/data-rights-page.tsx`
  - 提供账户数据导出 JSON、导出后删除确认 checkbox 和账户删除请求。
- 修改：`apps/web/src/features/worlddock/view-settings.tsx`
  - 在设置页接入 `导入导出` tab，并挂载世界导入导出与数据权利面板。
- 测试：`apps/api/test/exports.integration-spec.ts`
- 测试：`apps/web/tests/e2e/import-export.spec.ts`
- 可选补充测试：`apps/worker/test/export-jobs.test.ts`
- 修改：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
  - 验收通过后把 Phase 10 标记为完成并记录命令证据。

## 任务 1：运行 Phase 10 基线验收

**文件：**
- 读取：`docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md`
- 读取：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`
- 运行：Phase 10 定向测试和静态搜索命令

- [x] **步骤 1：确认 Phase 10 主计划验收点**

运行：

```bash
sed -n '2309,2388p' docs/superpowers/plans/2026-05-27-creator-alpha-product-closure.md
sed -n '286,306p' docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
```

预期：主计划要求世界包格式、导入导出 API、账户数据导出、删除账户前导出提示、`exports.integration-spec.ts` 和 `import-export.spec.ts`。

- [x] **步骤 2：确认当前文件存在**

运行：

```bash
test -f packages/domain/src/worlds/world-package.ts
test -f apps/api/src/modules/exports/exports.controller.ts
test -f apps/api/src/modules/exports/exports.service.ts
test -f apps/api/src/modules/exports/exports.module.ts
test -f apps/worker/src/export-jobs.ts
test -f apps/web/src/features/account/data-rights-page.tsx
test -f apps/web/src/features/worlds/import-export-panel.tsx
test -f apps/api/test/exports.integration-spec.ts
test -f apps/web/tests/e2e/import-export.spec.ts
```

预期：所有命令退出码为 0。若任一文件缺失，继续任务 2 到任务 6。

- [x] **步骤 3：运行后端导入导出验收**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- exports.integration-spec.ts
```

预期：PASS。若失败，继续任务 2 和任务 3。

- [x] **步骤 4：运行前端导入导出验收**

运行：

```bash
pnpm --filter @worlddock/web test:e2e -- import-export.spec.ts
```

预期：PASS。若失败，继续任务 5。

- [x] **步骤 5：运行 Worker 和共享类型验收**

运行：

```bash
pnpm --filter @worlddock/domain lint
pnpm --filter @worlddock/worker lint
```

预期：PASS。若失败，继续任务 2 或任务 4。

- [x] **步骤 6：确认产品源码没有导入导出占位文案**

运行：

```bash
rg -n "后端接入后|占位|待接入|待补充" apps/api/src/modules/exports apps/web/src/features/account apps/web/src/features/worlds apps/web/src/features/worlddock/view-settings.tsx
```

预期：无命中。若命中产品源码，替换为真实状态、真实错误反馈或删除该文案。

执行记录：Task 1 基线验收已通过，且 Task 1 相关规格复查和质量复查已通过；Task 2-6 为补实现路径，因基线已满足 Phase 10 要求而跳过。

## 任务 2：收口世界包 domain contract

**文件：**
- 修改：`packages/domain/src/worlds/world-package.ts`
- 修改：`packages/domain/src/index.ts`
- 验证：`pnpm --filter @worlddock/domain lint`

- [ ] **步骤 1：确认世界包 schema 内容**

`packages/domain/src/worlds/world-package.ts` 应包含：

```ts
import { z } from "zod";

export const worldPackageSchema = z.object({
  format: z.literal("worlddock.world-package.v1"),
  exportedAt: z.string().datetime(),
  world: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(z.string()),
    maturity: z.number().int().min(0).max(100),
  }),
  assets: z.array(z.object({
    kind: z.enum(["setting", "seed", "conflict"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    body: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
  })),
  releases: z.array(z.object({
    version: z.string().min(1),
    note: z.string().min(1),
    createdAt: z.string().datetime(),
  })).default([]),
});

export type WorldPackage = z.infer<typeof worldPackageSchema>;
```

- [ ] **步骤 2：确认 domain 根入口导出世界包 contract**

`packages/domain/src/index.ts` 应包含：

```ts
export * from "./worlds/world-package";
```

- [ ] **步骤 3：运行 domain 类型验收**

运行：

```bash
pnpm --filter @worlddock/domain lint
```

预期：PASS。若失败，修正 `WorldPackage` import/export 路径和 TypeScript 类型。

## 任务 3：收口后端导入导出 API

**文件：**
- 修改：`apps/api/src/modules/exports/exports.controller.ts`
- 修改：`apps/api/src/modules/exports/exports.service.ts`
- 修改：`apps/api/src/modules/exports/exports.module.ts`
- 修改：`apps/api/src/app.module.ts`
- 测试：`apps/api/test/exports.integration-spec.ts`

- [ ] **步骤 1：确认 controller 暴露 Phase 10 API**

`apps/api/src/modules/exports/exports.controller.ts` 应包含：

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { ExportsService } from "./exports.service";

const importWorldSchema = z.object({
  package: z.unknown(),
});

@Controller()
@UseGuards(WorldDockAuthGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

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

  @Post("account/data-export")
  @RequireScopes("world:read")
  requestAccountExport(@CurrentSubject() subject: AuthSubject) {
    return this.exportsService.requestAccountDataExport(subject);
  }

  @Get("account/data-export/:exportId")
  @RequireScopes("world:read")
  getAccountExport(@CurrentSubject() subject: AuthSubject, @Param("exportId") exportId: string) {
    return this.exportsService.getAccountDataExport(subject, exportId);
  }
}
```

- [ ] **步骤 2：确认 service 做 owner 校验、格式校验和私有导入**

`apps/api/src/modules/exports/exports.service.ts` 应满足这些可检查行为：

```ts
async exportWorld(subject: AuthSubject, worldId: string) {
  const world = await this.requireOwnedWorld(subject, worldId);
  const payload = await this.buildWorldPackage(world);
  const record = this.createExportRecord(subject.user.id, "world", payload);
  return { export: toExportResponse(record) };
}

async getExport(subject: AuthSubject, exportId: string) {
  const record = this.requireExport(subject, exportId);
  return { export: toExportResponse(record), package: record.payload };
}

async importWorld(subject: AuthSubject, input: { package: unknown }) {
  const worldPackage = worldPackageSchema.parse(input.package);
  const world = await this.worlds.createWorld({
    ownerId: subject.user.id,
    name: worldPackage.world.name,
    type: worldPackage.world.type,
    summary: worldPackage.world.summary,
    tags: worldPackage.world.tags,
    mode: "cloud",
    maturity: worldPackage.world.maturity,
  });
  await Promise.all(worldPackage.assets.map((asset) => this.createImportedAsset(world.id, asset)));
  return { world: await this.toWorldResponse(world) };
}

private async requireOwnedWorld(subject: AuthSubject, worldId: string) {
  const world = await this.worlds.findWorldById(worldId);
  if (!world) throw this.notFound("World not found.");
  if (world.ownerId !== subject.user.id) {
    throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not have access to this world." });
  }
  return world;
}
```

继续确认导入资产映射：

```ts
private async createImportedAsset(worldId: string, asset: WorldPackage["assets"][number]) {
  if (asset.kind === "setting") {
    return this.worlds.createArchiveEntry({
      worldId,
      title: asset.title,
      category: stringPayload(asset.payload.category) ?? "Imported",
      summary: asset.summary,
      body: asset.body ?? asset.summary,
      relations: stringArrayPayload(asset.payload.relations),
    });
  }
  if (asset.kind === "seed") {
    return this.worlds.createStorySeed({
      worldId,
      title: asset.title,
      hook: asset.summary,
      trigger: stringPayload(asset.payload.trigger),
      conflict: asset.body ?? asset.summary,
      protagonists: stringPayload(asset.payload.protagonists),
      questions: stringArrayPayload(asset.payload.questions),
    });
  }
  return this.worlds.createConflict({
    worldId,
    title: asset.title,
    summary: asset.summary,
    body: asset.body ?? asset.summary,
    related: stringArrayPayload(asset.payload.related),
    derivedSeeds: stringArrayPayload(asset.payload.derivedSeeds),
  });
}
```

- [ ] **步骤 3：确认账户导出只返回当前用户数据**

`apps/api/src/modules/exports/exports.service.ts` 应包含：

```ts
async requestAccountDataExport(subject: AuthSubject) {
  const worlds = await this.worlds.listWorlds(subject.user.id);
  const payload = {
    format: "worlddock.account-export.v1",
    exportedAt: new Date().toISOString(),
    user: {
      id: subject.user.id,
      email: subject.user.email,
      name: subject.user.name,
    },
    worlds: await Promise.all(worlds.map((world) => this.buildWorldPackage(world))),
  };
  const record = this.createExportRecord(subject.user.id, "account", payload);
  return { export: toExportResponse(record) };
}

async getAccountDataExport(subject: AuthSubject, exportId: string) {
  const record = this.requireExport(subject, exportId);
  if (record.kind !== "account") throw this.notFound("Account export not found.");
  return { export: toExportResponse(record), data: record.payload };
}
```

- [ ] **步骤 4：确认 module 接入依赖**

`apps/api/src/modules/exports/exports.module.ts` 应包含：

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RepositoryModule } from "../repositories/repository.module";
import { WorldsModule } from "../worlds/worlds.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [AuthModule, RepositoryModule, WorldsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
```

- [ ] **步骤 5：确认 AppModule 接入 ExportsModule**

运行：

```bash
rg -n "ExportsModule" apps/api/src/app.module.ts
```

预期：输出同时包含 `import { ExportsModule }` 和 `imports: [...] ExportsModule [...]`。

- [ ] **步骤 6：运行后端验收**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- exports.integration-spec.ts
```

预期：PASS，覆盖：

- owner 可以导出世界包。
- 非 owner 读取 export 返回 403。
- 导出的 package 符合 `worlddock.world-package.v1`。
- 导入世界包创建新的私有世界，并带回 archive、seed、conflict 计数。
- 账户导出只包含当前用户和当前用户世界。

## 任务 4：收口 Worker export queue

**文件：**
- 修改：`apps/worker/src/export-jobs.ts`
- 可选创建：`apps/worker/test/export-jobs.test.ts`
- 验证：`pnpm --filter @worlddock/worker test -- export-jobs.test.ts`
- 验证：`pnpm --filter @worlddock/worker lint`

- [ ] **步骤 1：确认 export queue helper**

`apps/worker/src/export-jobs.ts` 应包含：

```ts
import { Queue, Worker, type JobsOptions } from "bullmq";
import { createRedisConnection } from "./search-indexing.queue";

export const EXPORT_QUEUE = "exports";
export const ACCOUNT_EXPORT_JOB_NAME = "account-data-export";

export type AccountExportJob = {
  exportId: string;
  userId: string;
};

export type ExportQueue = {
  add(name: string, data: AccountExportJob, options?: JobsOptions): Promise<unknown>;
};

export type AccountExportProcessor = {
  processAccountExport(job: AccountExportJob): Promise<unknown>;
};

export function createExportQueue(redisUrl?: string) {
  return new Queue<AccountExportJob>(EXPORT_QUEUE, {
    connection: createRedisConnection(redisUrl),
  });
}

export async function enqueueAccountExport(queue: ExportQueue, job: AccountExportJob) {
  return queue.add(ACCOUNT_EXPORT_JOB_NAME, job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1_000 },
    jobId: job.exportId,
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

export function createExportWorker(options: {
  redisUrl?: string;
  processor: AccountExportProcessor;
}) {
  return new Worker<AccountExportJob>(
    EXPORT_QUEUE,
    async (job) => options.processor.processAccountExport(job.data),
    { connection: createRedisConnection(options.redisUrl) },
  );
}
```

- [ ] **步骤 2：若 Worker 覆盖率不足，创建 export queue 单测**

Create `apps/worker/test/export-jobs.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_EXPORT_JOB_NAME, enqueueAccountExport } from "../src/export-jobs";

describe("export jobs", () => {
  it("enqueues account export jobs with stable id and retries", async () => {
    const add = vi.fn().mockResolvedValue({ id: "export_1" });

    await enqueueAccountExport({ add }, { exportId: "export_1", userId: "user_1" });

    expect(add).toHaveBeenCalledWith(
      ACCOUNT_EXPORT_JOB_NAME,
      { exportId: "export_1", userId: "user_1" },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        jobId: "export_1",
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  });
});
```

- [ ] **步骤 3：运行 Worker 验收**

运行：

```bash
pnpm --filter @worlddock/worker test -- export-jobs.test.ts
pnpm --filter @worlddock/worker lint
```

预期：PASS。若没有创建 `export-jobs.test.ts`，运行 `pnpm --filter @worlddock/worker lint` 即可确认 Phase 10 Worker 文件类型正确。

## 任务 5：收口 Web API client 和设置页产品闭环

**文件：**
- 修改：`apps/web/src/features/worlddock/api.ts`
- 修改：`apps/web/src/features/worlds/import-export-panel.tsx`
- 修改：`apps/web/src/features/account/data-rights-page.tsx`
- 修改：`apps/web/src/features/worlddock/view-settings.tsx`
- 测试：`apps/web/tests/e2e/import-export.spec.ts`

- [ ] **步骤 1：确认 API client 方法**

`apps/web/src/features/worlddock/api.ts` 应包含：

```ts
export type ExportSummary = {
  id: string;
  kind: "world" | "account";
  status: "ready";
  createdAt: string;
};

export async function exportWorldPackage(worldId: string, options: ApiClientOptions): Promise<{ export: ExportSummary }> {
  return requestJson(`/v1/worlds/${worldId}/export`, {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function getWorldExport(exportId: string, options: ApiClientOptions): Promise<{ export: ExportSummary; package: WorldPackage }> {
  return requestJson(`/v1/exports/${exportId}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function importWorldPackage(input: WorldPackage, options: ApiClientOptions) {
  return requestJson("/v1/worlds/import", {
    method: "POST",
    sessionToken: options.sessionToken,
    body: { package: input },
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function requestAccountDataExport(options: ApiClientOptions): Promise<{ export: ExportSummary }> {
  return requestJson("/v1/account/data-export", {
    method: "POST",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function getAccountDataExport(exportId: string, options: ApiClientOptions): Promise<{ export: ExportSummary; data: unknown }> {
  return requestJson(`/v1/account/data-export/${exportId}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}

export async function deleteAccount(options: ApiClientOptions) {
  return requestJson("/v1/account", {
    method: "DELETE",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}
```

- [ ] **步骤 2：确认世界导入导出面板行为**

`apps/web/src/features/worlds/import-export-panel.tsx` 应满足：

```ts
async function exportCurrentWorld() {
  if (!world) return;
  setBusy(true);
  try {
    const created = await exportWorldPackage(world.id, { sessionToken });
    const loaded = await getWorldExport(created.export.id, { sessionToken });
    setExportId(created.export.id);
    setPackageText(JSON.stringify(loaded.package, null, 2));
    onToast({ kind: "save", text: "世界包已生成" });
  } catch {
    onToast({ kind: "warn", text: "世界包导出失败" });
  } finally {
    setBusy(false);
  }
}

async function importPackage() {
  setBusy(true);
  try {
    const parsed = JSON.parse(packageText) as WorldPackage;
    await importWorldPackage(parsed, { sessionToken });
    onToast({ kind: "save", text: "世界包已导入为私有世界" });
  } catch {
    onToast({ kind: "warn", text: "世界包导入失败" });
  } finally {
    setBusy(false);
  }
}
```

继续确认 UI 具有可被 E2E 稳定定位的 label 和按钮：

```tsx
<button className="btn primary" disabled={!world || !sessionToken || busy} onClick={exportCurrentWorld}>
  <Icon name="download" size={12} /><span>导出世界包</span>
</button>
<button className="btn" disabled={!packageText.trim() || !sessionToken || busy} onClick={importPackage}>
  <Icon name="upload" size={12} /><span>导入世界包</span>
</button>
<textarea
  className="input"
  aria-label="世界包 JSON"
  value={packageText}
  onChange={(event) => setPackageText(event.target.value)}
/>
```

- [ ] **步骤 3：确认数据权利面板要求导出后才能删除**

`apps/web/src/features/account/data-rights-page.tsx` 应包含：

```ts
async function requestExport() {
  setBusy(true);
  try {
    const created = await requestAccountDataExport({ sessionToken });
    const loaded = await getAccountDataExport(created.export.id, { sessionToken });
    setAccountExport(created.export);
    setExportText(JSON.stringify(loaded.data, null, 2));
    onToast({ kind: "save", text: "账户数据导出已生成" });
  } catch {
    onToast({ kind: "warn", text: "账户数据导出失败" });
  } finally {
    setBusy(false);
  }
}

async function scheduleDeletion() {
  setBusy(true);
  try {
    await deleteAccount({ sessionToken });
    onToast({ kind: "warn", text: "账户删除已排期" });
  } catch {
    onToast({ kind: "warn", text: "账户删除请求失败" });
  } finally {
    setBusy(false);
  }
}
```

继续确认删除按钮禁用条件：

```tsx
<button className="btn" style={{ marginTop: 10 }} disabled={!confirmed || !accountExport || busy} onClick={scheduleDeletion}>
  <Icon name="trash" size={12} /><span>删除账户</span>
</button>
```

- [ ] **步骤 4：确认设置页挂载导入导出 tab**

`apps/web/src/features/worlddock/view-settings.tsx` 应在 tab 列表中包含：

```tsx
["data", "导入导出"],
```

并在 `tab === "data"` 时渲染：

```tsx
{tab === "data" && (
  <section style={{ display: "grid", gap: 18 }}>
    <div className="card" style={{ padding: 18 }}>
      <h2 className="title-font" style={{ marginTop: 0 }}>导入导出</h2>
      <ImportExportPanel world={currentWorld} sessionToken={sessionToken()} onToast={onToast} />
    </div>
    <div className="card" style={{ padding: 18 }}>
      <h2 className="title-font" style={{ marginTop: 0 }}>数据权利</h2>
      <DataRightsPage sessionToken={sessionToken()} onToast={onToast} />
    </div>
  </section>
)}
```

- [ ] **步骤 5：运行前端验收**

运行：

```bash
pnpm --filter @worlddock/web test:e2e -- import-export.spec.ts
```

预期：PASS，覆盖：

- 登录态用户打开设置页 `导入导出` tab。
- 点击 `导出世界包` 后 `世界包 JSON` 出现 `worlddock.world-package.v1`。
- 点击 `导入世界包` 后请求体包含当前 package。
- 点击 `导出账户数据` 后 `账户数据导出 JSON` 出现 `worlddock.account-export.v1`。
- 勾选删除确认后点击 `删除账户`，发出账户删除请求。

## 任务 6：补齐 Phase 10 验收测试缺口

**文件：**
- 修改：`apps/api/test/exports.integration-spec.ts`
- 修改：`apps/web/tests/e2e/import-export.spec.ts`
- 可选创建：`apps/worker/test/export-jobs.test.ts`

- [ ] **步骤 1：确认 API integration 覆盖权限和 round trip**

`apps/api/test/exports.integration-spec.ts` 的主用例应包含这些断言：

```ts
const created = await request(app.getHttpServer())
  .post(`/v1/worlds/${world.id}/export`)
  .set("authorization", "Bearer session_user_1")
  .expect(201);
expect(created.body.export).toMatchObject({ kind: "world", status: "ready" });

await request(app.getHttpServer())
  .get(`/v1/exports/${created.body.export.id}`)
  .set("authorization", "Bearer session_user_2")
  .expect(403);

const loaded = await request(app.getHttpServer())
  .get(`/v1/exports/${created.body.export.id}`)
  .set("authorization", "Bearer session_user_1")
  .expect(200);
expect(loaded.body.package).toMatchObject({
  format: "worlddock.world-package.v1",
  world: { name: "Export World", maturity: 66 },
});
expect(loaded.body.package.assets.map((asset: any) => asset.kind)).toEqual(["setting", "seed", "conflict"]);

const imported = await request(app.getHttpServer())
  .post("/v1/worlds/import")
  .set("authorization", "Bearer session_user_1")
  .send({ package: loaded.body.package })
  .expect(201);
expect(imported.body.world).toMatchObject({ name: "Export World", archive: 1, seeds: 1, conflicts: 1, visibility: "private" });

const accountExport = await request(app.getHttpServer())
  .post("/v1/account/data-export")
  .set("authorization", "Bearer session_user_1")
  .expect(201);
const accountData = await request(app.getHttpServer())
  .get(`/v1/account/data-export/${accountExport.body.export.id}`)
  .set("authorization", "Bearer session_user_1")
  .expect(200);
expect(accountData.body.data).toMatchObject({
  format: "worlddock.account-export.v1",
  user: { id: "user_1", email: "user_1@example.com" },
});
expect(accountData.body.data.worlds).toHaveLength(2);
```

- [ ] **步骤 2：确认 E2E 覆盖产品入口**

`apps/web/tests/e2e/import-export.spec.ts` 的主流程应包含：

```ts
await gotoApp(page, { installMocks: false });
await page.getByText("Export World").click();
await page.getByLabel("设置").click();
await page.getByRole("button", { name: "导入导出" }).click();

await page.getByRole("button", { name: "导出世界包" }).click();
await expect(page.getByLabel("世界包 JSON")).toHaveValue(/worlddock\.world-package\.v1/);

await page.getByRole("button", { name: "导入世界包" }).click();
await expect.poll(() => importedPackages.length).toBe(1);
expect(importedPackages[0].world.name).toBe("Export World");

await page.getByRole("button", { name: "导出账户数据" }).click();
await expect(page.getByLabel("账户数据导出 JSON")).toHaveValue(/worlddock\.account-export\.v1/);

await page.getByLabel("我已完成数据导出并理解删除会排期处理").check();
await page.getByRole("button", { name: "删除账户" }).click();
await expect.poll(() => accountDeletionRequested).toBe(true);
```

- [ ] **步骤 3：运行定向测试**

运行：

```bash
pnpm --filter @worlddock/api test:integration -- exports.integration-spec.ts
pnpm --filter @worlddock/web test:e2e -- import-export.spec.ts
```

预期：两条命令都 PASS。

## 任务 7：更新 Phase 10 完成记录

**文件：**
- 修改：`docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [x] **步骤 1：替换 Phase 10 未完成段落**

把 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 中 `## Phase 10: 文件、导入导出和数据权利` 到 `## Phase 11` 前的内容替换为：

```md
## Phase 10: 文件、导入导出和数据权利

完成状态：已完成。

完成依据：

- `packages/domain/src/worlds/world-package.ts` 已定义 `worlddock.world-package.v1`，覆盖世界 metadata、资产列表和 release 摘要。
- `apps/api/src/modules/exports/*` 已提供世界导出、export 读取、世界导入、账户数据导出和账户数据 export 读取 API，并复用认证 scope 和 owner 权限校验。
- `apps/worker/src/export-jobs.ts` 已提供 `exports` BullMQ 队列、`account-data-export` job name、重试策略和 worker factory，保留账户导出异步化入口。
- `apps/web/src/features/worlds/import-export-panel.tsx` 已在设置页提供世界包导出、JSON 预览和粘贴 JSON 导入。
- `apps/web/src/features/account/data-rights-page.tsx` 已提供账户数据导出、导出 JSON 预览和删除账户前的确认流程。
- `apps/web/src/features/worlddock/view-settings.tsx` 已把导入导出和数据权利接入 `导入导出` tab。
- `apps/api/test/exports.integration-spec.ts` 和 `apps/web/tests/e2e/import-export.spec.ts` 已覆盖 Phase 10 主路径。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/domain lint`：通过。
- `pnpm --filter @worlddock/api test:integration -- exports.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/worker lint`：通过。
- `pnpm --filter @worlddock/web test:e2e -- import-export.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。
- `rg -n "后端接入后|占位|待接入|待补充" apps/api/src/modules/exports apps/web/src/features/account apps/web/src/features/worlds apps/web/src/features/worlddock/view-settings.tsx`：通过，无命中。

剩余说明：

- Phase 10 不实现批量附件压缩包、长期对象存储下载页、数据可携带性异步通知或硬删除执行器。
- Alpha 账户删除仍是软删除排期；用户必须先生成账户数据导出，Beta 后再补正式数据保留、恢复窗口和硬删除审计流程。
```

- [x] **步骤 2：运行全量回归门禁**

运行：

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/domain lint
pnpm --filter @worlddock/api test:integration -- exports.integration-spec.ts
pnpm --filter @worlddock/worker lint
pnpm --filter @worlddock/web test:e2e -- import-export.spec.ts
pnpm lint
pnpm test
pnpm build
```

预期：全部 PASS。若某个全量命令失败，先判断是否为 Phase 10 相关；相关则修复后重跑，非相关则在最终说明中记录失败命令和错误摘要。

## 自查清单

- [x] Phase 10 主计划的文件、API、Web 入口和测试均有任务覆盖。
- [x] 世界导入只创建私有 Cloud 世界，不覆盖现有世界，不发布公开仓库。
- [x] Export 读取检查 `record.userId === subject.user.id`，其他用户返回 403。
- [x] 账户数据导出只列当前用户的 worlds。
- [x] 删除账户按钮需要 `confirmed && accountExport`。
- [x] 产品源码没有 `后端接入后`、`占位`、`待接入` 或 `待补充`。
- [x] `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 10 完成记录只在验收命令通过后更新。
