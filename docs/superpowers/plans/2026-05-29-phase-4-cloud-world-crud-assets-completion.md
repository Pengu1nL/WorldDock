# Phase 4 Cloud World CRUD Assets Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 Cloud Alpha 的世界 CRUD 与统一世界资产编辑链路收束到可验收状态：创建、复制、删除、保存、搜索、编辑、删除、排序、关联资产都走云端 API，并在刷新和重新登录后保持一致。

**Architecture:** 后端以 `WorldRepository` 管理世界生命周期和复制语义，以 `WorldAssetsService` 统一映射 `ArchiveEntry`、`StorySeed`、`Conflict` 三类资产。前端继续保留当前 `WorldDockApp` 壳层，但资产读取、保存和编辑全部改为统一 `/v1/worlds/:worldId/assets` API，旧 `/archive`、`/seeds`、`/conflicts` 端点只作为兼容 API 保留，不再驱动 Cloud 主路径。

**Tech Stack:** NestJS + Fastify + Prisma + Zod + Vitest + Supertest；Next.js + React + TanStack Query + Playwright；pnpm workspace。

---

## 当前快照

来自 `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 4 缺口已经有部分被填上：`apps/api/src/modules/world-assets/*`、`packages/domain/src/assets/index.ts`、`apps/web/src/features/worlds/worlds-api.ts`、`apps/web/src/features/world-assets/*`、`apps/api/test/world-assets.integration-spec.ts`、`apps/web/tests/e2e/cloud-world-crud.spec.ts` 均已存在。

但当前实现仍不足以把 Phase 4 标成完成：

- `DELETE /v1/worlds/:worldId` 仍复用 `archiveWorld`，只把 `status` 改为 `unpublished`；`listWorlds` 仍会返回这些世界，刷新后会重新出现。
- `POST /v1/worlds/:worldId/duplicate` 只复制世界元数据，没有复制档案、种子、冲突和资产关系。
- `world-dock-app.tsx` 仍用 `/archive`、`/seeds`、`/conflicts` 三组旧端点读取 Cloud 主路径资产，没有统一到 `/assets`。
- `handleSave` 调用 `createWorldAsset` 后丢弃后端返回的真实 asset id，继续把本地建议对象塞进 UI 状态，刷新前后 id 和字段形状可能不一致。
- `asset-editor.tsx` 和 `asset-search.tsx` 只是孤立组件，没有接入档案、种子、冲突页面的创建、编辑、删除和搜索流程。
- `cloud-world-crud.spec.ts` 只覆盖“创建世界 + 保存一个 Agent 建议”，没有覆盖复制、删除、资产搜索、编辑、删除、排序、关联和刷新后资产仍存在。

## Files

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260529090000_phase4_world_delete_semantics/migration.sql`
- Modify: `packages/domain/src/assets/index.ts`
- Modify: `apps/api/src/modules/worlds/world.repository.ts`
- Modify: `apps/api/src/modules/worlds/prisma-world.repository.ts`
- Modify: `apps/api/src/modules/worlds/worlds.controller.ts`
- Modify: `apps/api/src/modules/worlds/world.mapper.ts`
- Modify: `apps/api/test/worlds.integration-spec.ts`
- Modify: `apps/api/test/world-assets.integration-spec.ts`
- Modify: `apps/web/src/features/worlddock/api.ts`
- Modify: `apps/web/src/features/worlds/worlds-api.ts`
- Modify: `apps/web/src/features/world-assets/asset-editor.tsx`
- Modify: `apps/web/src/features/world-assets/asset-search.tsx`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`
- Modify: `apps/web/src/features/worlddock/view-archive.tsx`
- Modify: `apps/web/tests/e2e/cloud-world-crud.spec.ts`
- Modify after verification: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

---

### Task 1: 写后端失败测试锁定 Phase 4 语义

**Files:**
- Modify: `apps/api/test/worlds.integration-spec.ts`
- Modify: `apps/api/test/world-assets.integration-spec.ts`

- [x] **Step 1: 将世界删除测试从 archive 语义改为“删除后列表和详情不可见”**

Replace the final DELETE assertion in `apps/api/test/worlds.integration-spec.ts` first test with:

```ts
await request(app.getHttpServer())
  .delete(`/v1/worlds/${worldId}`)
  .set("authorization", "Bearer session_user_1")
  .expect(200);

await request(app.getHttpServer())
  .get(`/v1/worlds/${worldId}`)
  .set("authorization", "Bearer session_user_1")
  .expect(404);

const afterDelete = await request(app.getHttpServer())
  .get("/v1/worlds")
  .set("authorization", "Bearer session_user_1")
  .expect(200);

expect(afterDelete.body.worlds).toHaveLength(0);
```

- [x] **Step 2: 在世界测试中新增“复制世界会复制资产计数”**

Append this test to `apps/api/test/worlds.integration-spec.ts`:

```ts
it("duplicates a cloud world with its persisted assets", async () => {
  const auth = createInMemoryAuthRepository();
  const worlds = createInMemoryWorldRepository();
  addSession(auth, "session_user_1", "user_1");
  app = await createTestApp(auth, worlds);

  const { body } = await request(app.getHttpServer())
    .post("/v1/worlds")
    .set("authorization", "Bearer session_user_1")
    .send({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "cloud",
    })
    .expect(201);

  await request(app.getHttpServer())
    .post(`/v1/worlds/${body.world.id}/archive`)
    .set("authorization", "Bearer session_user_1")
    .send({
      title: "《记忆交易法》",
      category: "世界规则",
      summary: "确立记忆资产交易制度。",
      body: "只有认证机构可以主持记忆交易。",
    })
    .expect(201);

  const duplicate = await request(app.getHttpServer())
    .post(`/v1/worlds/${body.world.id}/duplicate`)
    .set("authorization", "Bearer session_user_1")
    .expect(201);

  expect(duplicate.body.world).toMatchObject({
    name: "回忆所 · 副本",
    archive: 1,
    seeds: 0,
    conflicts: 0,
  });
});
```

- [x] **Step 3: 在资产测试中新增权限和 relation 404 行为**

Append this test to `apps/api/test/world-assets.integration-spec.ts`:

```ts
it("rejects cross-user access and missing relation targets", async () => {
  const auth = createInMemoryAuthRepository();
  const worlds = createInMemoryWorldRepository();
  const assets = createInMemoryWorldAssetsService();
  addSession(auth, "session_user_1", "user_1");
  addSession(auth, "session_user_2", "user_2");
  app = await createTestApp(auth, worlds, assets);

  const createdWorld = await request(app.getHttpServer())
    .post("/v1/worlds")
    .set("authorization", "Bearer session_user_1")
    .send({ name: "回忆所", type: "近未来", summary: "记忆可以被买卖。", tags: ["记忆"], mode: "cloud" })
    .expect(201);

  await request(app.getHttpServer())
    .get(`/v1/worlds/${createdWorld.body.world.id}/assets`)
    .set("authorization", "Bearer session_user_2")
    .expect(403);

  const setting = await request(app.getHttpServer())
    .post(`/v1/worlds/${createdWorld.body.world.id}/assets`)
    .set("authorization", "Bearer session_user_1")
    .send({
      kind: "setting",
      title: "《记忆交易法》",
      category: "世界规则",
      summary: "确立记忆资产交易制度。",
      body: "只有认证机构可以主持记忆交易。",
    })
    .expect(201);

  await request(app.getHttpServer())
    .post(`/v1/worlds/${createdWorld.body.world.id}/assets/${setting.body.asset.id}/relations`)
    .set("authorization", "Bearer session_user_1")
    .send({ targetAssetId: "missing_asset" })
    .expect(404);
});
```

- [x] **Step 4: 运行后端目标测试并确认失败点**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- worlds.integration-spec.ts world-assets.integration-spec.ts
```

Expected: FAIL. Failures should point to deleted worlds still being readable/listed, duplicate worlds lacking copied assets, or in-memory relation helper not returning null for missing target assets.

---

### Task 2: 补齐删除语义、复制语义和资产关系 domain contract

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260529090000_phase4_world_delete_semantics/migration.sql`
- Modify: `packages/domain/src/assets/index.ts`

- [x] **Step 1: 给 `World` 添加明确的软删除字段**

In `packages/db/prisma/schema.prisma`, add `deletedAt` to `model World`:

```prisma
  deletedAt DateTime?
```

Keep existing `status` values unchanged. `status` remains release visibility state; `deletedAt` becomes creator dashboard deletion state.

- [x] **Step 2: Add the migration SQL**

Create `packages/db/prisma/migrations/20260529090000_phase4_world_delete_semantics/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "worlds" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "worlds_ownerId_deletedAt_idx" ON "worlds"("ownerId", "deletedAt");
```

- [x] **Step 3: Extend asset relation schemas**

In `packages/domain/src/assets/index.ts`, add relation contracts below `worldAssetSchema`:

```ts
export const worldAssetRelationSchema = z.object({
  worldId: z.string().min(1),
  sourceAssetId: z.string().min(1),
  targetAssetId: z.string().min(1),
  createdAt: z.string().datetime().optional(),
});

export const worldAssetListSchema = z.object({
  assets: z.array(worldAssetSchema),
  nextCursor: z.string().min(1).nullable(),
});

export type WorldAssetRelation = z.infer<typeof worldAssetRelationSchema>;
export type WorldAssetList = z.infer<typeof worldAssetListSchema>;
```

- [x] **Step 4: Validate Prisma schema**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
```

Expected: PASS. Prisma accepts the new `deletedAt` field, index, and existing Phase 4 relation table.

---

### Task 3: 实现后端世界删除和资产复制

**Files:**
- Modify: `apps/api/src/modules/worlds/world.repository.ts`
- Modify: `apps/api/src/modules/worlds/prisma-world.repository.ts`
- Modify: `apps/api/src/modules/worlds/worlds.controller.ts`
- Modify: `apps/api/src/modules/worlds/world.mapper.ts`
- Modify: `apps/api/test/worlds.integration-spec.ts`

- [x] **Step 1: Extend repository types**

In `apps/api/src/modules/worlds/world.repository.ts`, add `deletedAt` to `WorldRecord`:

```ts
  deletedAt?: Date | null;
```

Replace the `archiveWorld` method in `WorldRepository` with:

```ts
  deleteWorld(id: string): Promise<WorldRecord | null>;
  duplicateWorldAssets(input: { sourceWorldId: string; targetWorldId: string }): Promise<void>;
```

- [x] **Step 2: Filter deleted worlds and hide deleted detail records**

In `apps/api/src/modules/worlds/prisma-world.repository.ts`, update `listWorlds` and `findWorldById`:

```ts
async listWorlds(ownerId: string) {
  return this.prisma.world.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  }) as ReturnType<WorldRepository["listWorlds"]>;
}

async findWorldById(id: string) {
  return this.prisma.world.findFirst({ where: { id, deletedAt: null } }) as ReturnType<WorldRepository["findWorldById"]>;
}
```

- [x] **Step 3: Implement soft delete**

Replace `archiveWorld` in `PrismaWorldRepository` with:

```ts
async deleteWorld(id: string) {
  return this.updateWorld(id, { status: "unpublished", deletedAt: new Date() });
}
```

Update the `updateWorld` input type in `WorldRepository` to include `"deletedAt"`:

```ts
updateWorld(
  id: string,
  input: Partial<Pick<WorldRecord, "name" | "type" | "summary" | "tags" | "status" | "visibility" | "mode" | "maturity" | "coverObjectId" | "deletedAt">>,
): Promise<WorldRecord | null>;
```

- [x] **Step 4: Implement asset duplication in Prisma repository**

Add this method to `PrismaWorldRepository`:

```ts
async duplicateWorldAssets(input: { sourceWorldId: string; targetWorldId: string }) {
  const { sourceWorldId, targetWorldId } = input;
  await this.prisma.$transaction(async (tx) => {
    const [archiveEntries, storySeeds, conflicts, relations] = await Promise.all([
      tx.archiveEntry.findMany({ where: { worldId: sourceWorldId } }),
      tx.storySeed.findMany({ where: { worldId: sourceWorldId } }),
      tx.conflict.findMany({ where: { worldId: sourceWorldId } }),
      tx.worldAssetRelation.findMany({ where: { worldId: sourceWorldId } }),
    ]);

    const idMap = new Map<string, string>();

    for (const entry of archiveEntries) {
      const created = await tx.archiveEntry.create({
        data: {
          worldId: targetWorldId,
          title: entry.title,
          category: entry.category,
          summary: entry.summary,
          body: entry.body,
          relations: entry.relations,
          position: entry.position,
        },
      });
      idMap.set(entry.id, created.id);
    }

    for (const seed of storySeeds) {
      const created = await tx.storySeed.create({
        data: {
          worldId: targetWorldId,
          title: seed.title,
          hook: seed.hook,
          trigger: seed.trigger,
          conflict: seed.conflict,
          protagonists: seed.protagonists,
          questions: seed.questions,
          position: seed.position,
        },
      });
      idMap.set(seed.id, created.id);
    }

    for (const conflict of conflicts) {
      const created = await tx.conflict.create({
        data: {
          worldId: targetWorldId,
          title: conflict.title,
          summary: conflict.summary,
          body: conflict.body,
          related: conflict.related,
          derivedSeeds: conflict.derivedSeeds,
          position: conflict.position,
        },
      });
      idMap.set(conflict.id, created.id);
    }

    for (const relation of relations) {
      const sourceAssetId = idMap.get(relation.sourceAssetId);
      const targetAssetId = idMap.get(relation.targetAssetId);
      if (!sourceAssetId || !targetAssetId) continue;
      await tx.worldAssetRelation.create({
        data: { worldId: targetWorldId, sourceAssetId, targetAssetId },
      });
    }
  });
}
```

- [x] **Step 5: Update controller delete and duplicate handlers**

In `apps/api/src/modules/worlds/worlds.controller.ts`, replace the duplicate body with:

```ts
const original = await this.requireOwnedWorld(subject, worldId);
const record = await this.worlds.createWorld({
  ownerId: subject.user.id,
  name: `${original.name} · 副本`,
  type: original.type,
  summary: original.summary,
  tags: original.tags,
  mode: original.mode,
  maturity: original.maturity,
});
await this.worlds.duplicateWorldAssets({ sourceWorldId: original.id, targetWorldId: record.id });
return { world: await this.toWorld(record) };
```

Replace the DELETE handler body with:

```ts
await this.requireOwnedWorld(subject, worldId);
const record = await this.worlds.deleteWorld(worldId);
if (!record) throw this.notFound();
return { world: mapWorld(record, { archive: 0, seeds: 0, conflicts: 0 }) };
```

- [x] **Step 6: Update in-memory world repository helpers**

In both `apps/api/test/worlds.integration-spec.ts` and `apps/api/test/world-assets.integration-spec.ts`, update the in-memory `WorldRecord` factory with `deletedAt: null`, change `listWorlds` to filter `!world.deletedAt`, change `findWorldById` to return null for deleted worlds, replace `archiveWorld` with `deleteWorld`, and add:

```ts
async duplicateWorldAssets() {
  return;
}
```

The `worlds.integration-spec.ts` helper stores archive, seed, and conflict maps; in that file, implement `duplicateWorldAssets` by copying records from `sourceWorldId` to `targetWorldId` and preserving content fields.

- [x] **Step 7: Run backend tests**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- worlds.integration-spec.ts world-assets.integration-spec.ts
```

Expected: PASS. Deleted worlds are hidden from list/detail, duplicate worlds include copied asset counts, world asset routes still enforce ownership.

---

### Task 4: 统一前端资产读取和保存状态

**Files:**
- Modify: `apps/web/src/features/worlddock/api.ts`
- Modify: `apps/web/src/features/worlds/worlds-api.ts`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`

- [x] **Step 1: Ensure API client exposes all Phase 4 calls**

Confirm `apps/web/src/features/worlddock/api.ts` exports these functions:

```ts
listWorldAssets
createWorldAsset
updateWorldAsset
deleteWorldAsset
reorderWorldAssets
relateWorldAssets
unrelateWorldAssets
```

If `unrelateWorldAssets` is missing, add:

```ts
export async function unrelateWorldAssets(
  worldId: string,
  sourceAssetId: string,
  targetAssetId: string,
  options: ApiClientOptions,
) {
  return requestJson(`/v1/worlds/${worldId}/assets/${sourceAssetId}/relations/${targetAssetId}`, {
    method: "DELETE",
    sessionToken: options.sessionToken,
    fetcher: options.fetcher,
    baseUrl: options.baseUrl,
    signal: options.signal,
  });
}
```

- [x] **Step 2: Keep the feature wrapper thin and exported**

`apps/web/src/features/worlds/worlds-api.ts` already wraps the shared request functions. Keep that shape; if any wrapper is missing, add it in this form:

```ts
export function duplicateCloudWorld(worldId: string, options: ApiClientOptions) {
  return duplicateWorld(worldId, options);
}
```

Keep the wrapper thin; do not duplicate request code outside `worlddock/api.ts`.

- [x] **Step 3: Replace legacy asset hydration queries**

In `apps/web/src/features/worlddock/world-dock-app.tsx`, import `listWorldAssets`, `updateWorldAsset`, `deleteWorldAsset`, `reorderWorldAssets`, `relateWorldAssets`, and `unrelateWorldAssets`.

Replace the three Cloud asset queries with one unified query:

```ts
const assetsQuery = useQuery({
  queryKey: ["world-assets", sessionToken, currentWorld?.id],
  queryFn: async () => listWorldAssets(currentWorld.id, { sessionToken }),
  enabled: Boolean(sessionToken && currentWorld?.id),
  retry: false,
});

useEffect(() => {
  if (!assetsQuery.data?.assets) return;
  const assets = assetsQuery.data.assets;
  setSavedSettings(assets.filter((asset: any) => asset.kind === "setting").map(fromWorldAsset));
  setSavedSeeds(assets.filter((asset: any) => asset.kind === "seed").map(fromWorldAsset));
  setSavedConflicts(assets.filter((asset: any) => asset.kind === "conflict").map(fromWorldAsset));
  setSavedIds((prev: any[]) => [...new Set([...prev, ...assets.map((asset: any) => asset.id)])]);
}, [assetsQuery.data]);
```

Add mapper near `toWorldAssetInput`:

```ts
function fromWorldAsset(asset: any) {
  if (asset.kind === "seed") {
    return {
      ...asset,
      hook: asset.payload?.hook ?? asset.summary,
      trigger: asset.payload?.trigger,
      conflict: asset.payload?.conflict ?? asset.body,
      protagonists: asset.payload?.protagonists,
      questions: asset.payload?.questions ?? [],
    };
  }
  if (asset.kind === "conflict") {
    return {
      ...asset,
      related: asset.payload?.related ?? [],
      derivedSeeds: asset.payload?.derivedSeeds ?? [],
    };
  }
  return {
    ...asset,
    relations: asset.payload?.relations ?? [],
  };
}
```

- [x] **Step 4: Use server-returned assets when saving suggestions**

In `handleSave`, the Cloud path now distinguishes two persistence contracts:

```ts
let savedItem = item;
let appendSavedItem = true;
if (sessionToken && item.agentSuggestionId) {
  try {
    const saved = await saveAgentSuggestion(item.agentSuggestionId, { sessionToken });
    const returnedAsset = saved.asset ?? saved.savedAsset ?? saved.suggestion?.asset ?? saved.suggestion?.savedAsset;
    if (returnedAsset) savedItem = fromWorldAsset(returnedAsset);
    else appendSavedItem = false;
    worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", sessionToken, currentWorld.id] });
  } catch {
    pushToast({ kind: "warn", text: "云端保存失败 · 请检查网络后重试" });
    return;
  }
} else if (sessionToken && currentWorld?.id && isCloudPersistedWorldId(currentWorld.id)) {
  try {
    const created = await createWorldAsset(currentWorld.id, toWorldAssetInput(item), { sessionToken });
    savedItem = fromWorldAsset(created.asset);
    worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", sessionToken, currentWorld.id] });
  } catch {
    pushToast({ kind: "warn", text: "云端资产保存失败 · 请检查网络后重试" });
    return;
  }
}
```

For ordinary manual asset creation, the UI appends the server-returned asset immediately. For Agent suggestion saves, the real API currently returns `suggestion.savedAssetId` rather than an embedded asset, so the UI records the suggestion key, invalidates the unified assets query, and waits for `/v1/worlds/:worldId/assets` to hydrate the persisted row. This prevents a temporary suggestion id from being editable, deletable, or relatable as if it were a real asset id.

Use `savedItem` rather than `item` for local append paths, toast text, and count updates. Only append to `setSavedSettings`, `setSavedSeeds`, or `setSavedConflicts` when `appendSavedItem` is true.

- [x] **Step 5: Update count derivation from unified assets**

Replace the current count effect that reads `archiveQuery`, `seedsQuery`, and `conflictsQuery` with:

```ts
useEffect(() => {
  if (!currentWorld || !sessionToken || !assetsQuery.data?.assets) return;
  const nextCounts = {
    archive: assetsQuery.data.assets.filter((asset: any) => asset.kind === "setting").length,
    seeds: assetsQuery.data.assets.filter((asset: any) => asset.kind === "seed").length,
    conflicts: assetsQuery.data.assets.filter((asset: any) => asset.kind === "conflict").length,
  };
  const nextWorld = { ...currentWorld, ...nextCounts };
  setCurrentWorld(nextWorld);
  setWorlds((prev: any[]) => prev.map((world: any) => world.id === nextWorld.id ? nextWorld : world));
}, [assetsQuery.data, currentWorld, sessionToken]);
```

- [x] **Step 6: Run frontend unit tests**

Run:

```bash
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
```

Expected: PASS. Runtime code still uses shared session helpers and the API client still serializes query params correctly.

---

### Task 5: 接入资产编辑器、搜索、删除、排序和关联

**Files:**
- Modify: `apps/web/src/features/world-assets/asset-editor.tsx`
- Modify: `apps/web/src/features/world-assets/asset-search.tsx`
- Modify: `apps/web/src/features/worlddock/view-archive.tsx`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`

- [x] **Step 1: Expand `AssetEditor` into a submit-capable form**

Replace `AssetEditor` props with:

```ts
type AssetEditorProps = {
  asset: Partial<WorldAsset> & { kind: WorldAsset["kind"] };
  saving?: boolean;
  onChange: (asset: Partial<WorldAsset> & { kind: WorldAsset["kind"] }) => void;
  onSubmit: () => void;
  onDelete?: () => void;
};
```

Add controls for `kind`, `category`, `title`, `summary`, and `body`, then render actions:

```tsx
<div className="row gap-2" style={{ justifyContent: "flex-end" }}>
  {onDelete && (
    <button className="btn ghost danger" type="button" onClick={onDelete} disabled={saving}>
      删除
    </button>
  )}
  <button className="btn primary" type="submit" disabled={saving || !asset.title || !asset.summary}>
    {saving ? "保存中..." : "保存资产"}
  </button>
</div>
```

- [x] **Step 2: Keep `AssetSearch` presentational but support empty state**

In `apps/web/src/features/world-assets/asset-search.tsx`, keep client-side filtering and add:

```tsx
{filtered.length === 0 && (
  <div role="status" className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
    没有匹配资产
  </div>
)}
```

- [x] **Step 3: Add edit callbacks to archive, seed, and conflict views**

In `apps/web/src/features/worlddock/view-archive.tsx`, add props to `ArchiveView`, `SeedsView`, and `ConflictsView`:

```ts
onCreateAsset,
onEditAsset,
onDeleteAsset,
onReorderAssets,
onRelateAssets,
```

Wire the existing “新建设定” button:

```tsx
<button className="btn" onClick={() => onCreateAsset?.("setting")}>
  <Icon name="plus" size={12}/><span>新建设定</span>
</button>
```

For each asset card, keep the existing click-to-detail behavior, and add a small edit action:

```tsx
<button
  className="btn ghost sm"
  type="button"
  onClick={(event: any) => {
    event.stopPropagation();
    onEditAsset?.(s);
  }}
>
  <Icon name="eye" size={11}/>
</button>
```

- [x] **Step 4: Add asset editor drawer state to `WorldDockApp`**

In `world-dock-app.tsx`, add handlers:

```ts
const openAssetEditor = (kind: "setting" | "seed" | "conflict", asset?: any) => {
  setDrawerOpen({
    kind: "asset-editor",
    item: asset ?? {
      kind,
      title: "",
      category: kind === "setting" ? "世界规则" : kind === "seed" ? "故事种子" : "冲突",
      summary: "",
      body: "",
      payload: {},
    },
  });
};

const saveEditedAsset = async (draft: any) => {
  if (!sessionToken || !currentWorld?.id) return;
  try {
    const saved = draft.id
      ? await updateWorldAsset(currentWorld.id, draft.id, toWorldAssetInput(draft), { sessionToken })
      : await createWorldAsset(currentWorld.id, toWorldAssetInput(draft), { sessionToken });
    worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", sessionToken, currentWorld.id] });
    setDrawerOpen(null);
    pushToast({ kind: "save", text: `已保存资产 · ${saved.asset.title}` });
  } catch {
    pushToast({ kind: "warn", text: "资产保存失败 · 请稍后重试" });
  }
};

const removeEditedAsset = async (asset: any) => {
  if (!sessionToken || !currentWorld?.id || !asset.id) return;
  try {
    await deleteWorldAsset(currentWorld.id, asset.id, { sessionToken });
    worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", sessionToken, currentWorld.id] });
    setDrawerOpen(null);
    pushToast({ kind: "warn", text: `已删除资产 · ${asset.title}` });
  } catch {
    pushToast({ kind: "warn", text: "资产删除失败 · 请稍后重试" });
  }
};
```

Render drawer content:

```tsx
{drawerOpen?.kind === "asset-editor" && drawerOpen.item && (
  <AssetEditor
    asset={drawerOpen.item}
    onChange={(item) => setDrawerOpen({ kind: "asset-editor", item })}
    onSubmit={() => saveEditedAsset(drawerOpen.item)}
    onDelete={drawerOpen.item.id ? () => removeEditedAsset(drawerOpen.item) : undefined}
  />
)}
```

- [x] **Step 5: Wire relation and reorder calls from UI handlers**

Add minimal handlers:

```ts
const reorderAssets = async (assetIds: string[]) => {
  if (!sessionToken || !currentWorld?.id) return;
  await reorderWorldAssets(currentWorld.id, assetIds, { sessionToken });
  worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", sessionToken, currentWorld.id] });
};

const relateAssets = async (sourceAssetId: string, targetAssetId: string) => {
  if (!sessionToken || !currentWorld?.id) return;
  await relateWorldAssets(currentWorld.id, sourceAssetId, targetAssetId, { sessionToken });
  worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", sessionToken, currentWorld.id] });
};
```

Use these handlers in the archive/seed/conflict views before adding richer drag-and-drop. For Phase 4 acceptance, buttons that move an item one position up/down and a relation picker using `AssetSearch` are enough.

- [x] **Step 6: Run targeted web tests**

Run:

```bash
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
```

Expected: PASS. Component wiring compiles, shared API helpers still satisfy unit coverage.

---

### Task 6: Expand Cloud CRUD E2E coverage

**Files:**
- Modify: `apps/web/tests/e2e/cloud-world-crud.spec.ts`

- [x] **Step 1: Extend mocked API state**

At the top of the test, track duplicate, delete, update, reorder, and relation calls:

```ts
const deletedWorldRequests: string[] = [];
const duplicatedWorldRequests: string[] = [];
const updatedAssetRequests: any[] = [];
const deletedAssetRequests: string[] = [];
const reorderRequests: string[][] = [];
const relationRequests: any[] = [];
```

- [x] **Step 2: Mock world detail, delete, and duplicate routes**

Add routes:

```ts
await page.route("**/v1/worlds/world_cloud_1", async (route) => {
  if (route.request().method() === "DELETE") {
    deletedWorldRequests.push("world_cloud_1");
    const world = worlds.find((item) => item.id === "world_cloud_1");
    if (world) world.deletedAt = new Date().toISOString();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ world }) });
    return;
  }
  await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "NOT_FOUND" }) });
});

await page.route("**/v1/worlds/world_cloud_1/duplicate", async (route) => {
  duplicatedWorldRequests.push("world_cloud_1");
  const world = { ...worlds[0], id: "world_cloud_2", name: `${worlds[0].name} · 副本`, archive: assets.length };
  worlds.unshift(world);
  await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ world }) });
});
```

- [x] **Step 3: Mock asset update, delete, reorder, and relations**

Add routes:

```ts
await page.route("**/v1/worlds/world_cloud_1/assets/asset_1", async (route) => {
  if (route.request().method() === "PATCH") {
    const input = route.request().postDataJSON();
    updatedAssetRequests.push(input);
    assets[0] = { ...assets[0], ...input, updatedAt: new Date().toISOString() };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ asset: assets[0] }) });
    return;
  }
  if (route.request().method() === "DELETE") {
    deletedAssetRequests.push("asset_1");
    assets.splice(0, assets.length);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ asset: { id: "asset_1" } }) });
    return;
  }
  await route.fallback();
});

await page.route("**/v1/worlds/world_cloud_1/assets/reorder", async (route) => {
  reorderRequests.push(route.request().postDataJSON().assetIds);
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({ assets, nextCursor: null }) });
});

await page.route("**/v1/worlds/world_cloud_1/assets/asset_1/relations", async (route) => {
  relationRequests.push(route.request().postDataJSON());
  await route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      relation: {
        worldId: "world_cloud_1",
        sourceAssetId: "asset_1",
        targetAssetId: route.request().postDataJSON().targetAssetId,
        createdAt: new Date().toISOString(),
      },
    }),
  });
});
```

- [x] **Step 4: Add browser assertions for full Phase 4 flow**

After the existing save assertion, add assertions for refresh, search, edit, duplicate, and delete:

```ts
await page.reload();
await expect(page.getByText("回忆所")).toBeVisible();
await page.getByText("回忆所").click();
await page.getByRole("button", { name: /世界档案|档案/ }).click();
await expect(page.getByText("《记忆交易法》")).toBeVisible();

await page.getByPlaceholder("搜索档案…").fill("交易法");
await expect(page.getByText("《记忆交易法》")).toBeVisible();

await page.getByRole("button", { name: /新建设定/ }).click();
await page.getByLabel("标题").fill("记忆托管机构");
await page.getByLabel("摘要").fill("认证机构托管记忆资产。");
await page.getByRole("button", { name: /保存资产/ }).click();
await expect.poll(() => createdAssetRequests.length).toBeGreaterThan(1);

await page.getByRole("button", { name: /我的世界|worlds/ }).click();
await page.getByTitle("更多").first().click();
await page.getByText("复制为新世界").click();
await expect.poll(() => duplicatedWorldRequests.length).toBe(1);
await expect(page.getByText("回忆所 · 副本")).toBeVisible();

page.once("dialog", (dialog) => dialog.accept());
await page.getByTitle("更多").last().click();
await page.getByText("删除世界").click();
await expect.poll(() => deletedWorldRequests.length).toBe(1);
```

Adjust selectors only to match actual visible labels introduced in Task 5; keep each assertion tied to a real user-visible control.

- [x] **Step 5: Run E2E**

Run:

```bash
pnpm --filter @worlddock/web test:e2e -- cloud-world-crud.spec.ts
```

Expected: PASS. The test covers cloud create, asset save, asset refresh, asset search, asset create/edit path, world duplicate, and world delete.

---

### Task 7: Final verification and Phase 4 documentation update

**Files:**
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [x] **Step 1: Run targeted verification**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- worlds.integration-spec.ts world-assets.integration-spec.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- cloud-world-crud.spec.ts
```

Expected: all commands PASS.

- [x] **Step 2: Run workspace verification**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: all commands PASS.

- [x] **Step 3: Update incomplete task record**

In `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`, replace Phase 4 status with:

```md
## Phase 4: 云端世界 CRUD 和资产编辑器

完成状态：已完成。

完成依据：

- `packages/domain/src/assets/index.ts` 定义统一 `WorldAsset`、资产列表和资产关系 schema。
- `packages/db/prisma/schema.prisma` 和 Phase 4 迁移支持资产排序、资产关系和世界软删除。
- `apps/api/src/modules/world-assets/*` 提供 `/v1/worlds/:worldId/assets` 查询、详情、创建、更新、删除、排序和关系 API；查询和详情会把关系表回填到 `payload.relationLabels/relationTargets`，不污染旧 `relations/related` 字段，并复用 owner 权限校验。
- `apps/api/src/modules/worlds/*` 支持 Cloud 世界创建、详情、更新、删除隐藏和带资产复制。
- `apps/web/src/features/worlddock/api.ts` 与 `apps/web/src/features/worlds/worlds-api.ts` 提供 Cloud 世界和统一资产 API client。
- `apps/web/src/features/world-assets/asset-editor.tsx`、`asset-search.tsx` 和 `world-dock-app.tsx` 接入 Cloud 主路径资产创建、搜索、编辑、删除、排序、关系操作和真实 Agent suggestion 保存响应。
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
```

- [x] **Step 4: Self-review**

Check the implementation against these Phase 4 requirements:

```txt
GET    /v1/worlds/:worldId/assets?kind=&q=&cursor=
POST   /v1/worlds/:worldId/assets
GET    /v1/worlds/:worldId/assets/:assetId
PATCH  /v1/worlds/:worldId/assets/:assetId
DELETE /v1/worlds/:worldId/assets/:assetId
POST   /v1/worlds/:worldId/assets/reorder
POST   /v1/worlds/:worldId/assets/:assetId/relations
DELETE /v1/worlds/:worldId/assets/:assetId/relations/:targetAssetId
POST   /v1/worlds/:worldId/duplicate
DELETE /v1/worlds/:worldId
```

Expected: every endpoint is covered by an API test or E2E assertion, and every Cloud-authenticated frontend path avoids local-only CRUD.
