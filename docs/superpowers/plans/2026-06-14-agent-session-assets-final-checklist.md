# Agent Session Assets 最终验收清单

日期：2026-06-20（Asia/Shanghai）

## 已通过命令

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `rg -n "ArchiveView|SeedsView|ConflictsView|suggestion-utils|saveAgentSuggestion|discardAgentSuggestion|agent-suggestions|可保存设定|故事种子|冲突池" apps/web/src apps/web/tests` | PASS | 旧页面、旧工具、save/discard client wrapper 和运行时旧文案已无命中；剩余命中仅为测试中的负向断言。 |
| `pnpm --filter @worlddock/web test` | PASS | 19 files, 77 tests passed。 |
| `pnpm --filter @worlddock/web lint` | PASS | 无错误、无警告。 |
| `pnpm --filter @worlddock/web build` | PASS | Next.js production build passed。 |
| `pnpm --filter @worlddock/api test` | PASS | 21 files, 121 tests passed。 |
| `pnpm --filter @worlddock/api test:integration` | PASS | 14 files passed, 1 skipped；109 tests passed, 1 skipped。 |
| `pnpm --filter @worlddock/api build` | PASS | `tsc -p tsconfig.build.json` passed。 |
| `pnpm verify` | PASS | Prisma validate、整仓 lint、整仓 test、整仓 build passed。 |
| `pnpm --filter @worlddock/web test:e2e -- creation-flow.spec.ts session-assets-flow.spec.ts` | PASS | 验证创建世界的 session 主路径不调用 legacy `/v1/worlds/:worldId/agent-runs`。 |
| `pnpm --filter @worlddock/web test:e2e -- session-assets-flow.spec.ts creation-flow.spec.ts consistency-flow.spec.ts responsive.spec.ts` | PASS | 4 Playwright specs passed，用作最终 smoke 证据。 |

## 本轮退场范围

- 删除 `apps/web/src/features/worlddock/view-archive.tsx`，主 bundle 不再导入旧 `ArchiveView`/`SeedsView`/`ConflictsView`。
- 删除 `apps/web/src/features/worlddock/suggestion-utils.ts`。
- 删除独立旧 reducer `apps/web/src/features/worlddock/state.ts` 及其只覆盖旧 `savedIds` 流程的测试。
- `AssetLibraryWorkspace` 不再使用 `officialAssetsUnavailable` 回退到旧档案页；资产库加载失败时由 `OfficialAssetLibraryPage` 自身错误态承接。
- 前端 API client 删除 `saveAgentSuggestion` / `discardAgentSuggestion` wrapper；E2E helper 删除 `/v1/agent-suggestions/:id/save|discard` mock。
- `world-navigation.tsx` 不再把 `archive`、`seeds`、`conflicts` 作为兼容导航 id 映射到主导航；未知旧 id 回落到 `worlds`。

## 未删除的 legacy endpoint 列表

这些 endpoint 仍保留在后端或兼容读写层，本轮只移除前端旧主路径引用：

- `POST /v1/worlds/:worldId/agent-runs`
- `GET /v1/agent-runs/:runId/events`（SSE）
- `POST /v1/agent-suggestions/:suggestionId/save`
- `PATCH /v1/agent-suggestions/:suggestionId`
- `POST /v1/agent-suggestions/:suggestionId/discard`
- `GET /v1/worlds/:worldId/archive`
- `POST /v1/worlds/:worldId/archive`
- `GET /v1/worlds/:worldId/seeds`
- `POST /v1/worlds/:worldId/seeds`
- `GET /v1/worlds/:worldId/conflicts`
- `POST /v1/worlds/:worldId/conflicts`

## 数据迁移未覆盖范围

- 未迁移或删除既有 `ArchiveEntry`、`StorySeed`、`Conflict`、`AgentSuggestion` 数据。
- 未删除 Prisma 旧表模型，也未执行数据库 schema 破坏性迁移。
- 未改动 export/import、pull/push、PI tool、world-assets service 对旧三池数据的读取兼容。
- 未关闭后端 legacy suggestion endpoint；前端主路径已停止调用 save/discard wrapper。

## 人工 smoke 场景结果

- 资产库路径：通过 E2E `session-assets-flow.spec.ts` 验证潜在资产沉淀为 official asset，并可在资产库打开详情。
- 创建路径：通过 E2E `creation-flow.spec.ts` 验证创建世界后进入 session/potential asset 流程。
- 一致性路径：通过 E2E `consistency-flow.spec.ts` 验证一致性问题查看和修复入口。
- 移动端路径：通过 E2E `responsive.spec.ts` 验证核心创建路径无水平溢出。
- 旧页面退场：静态扫描确认 `ArchiveView`、`SeedsView`、`ConflictsView`、`suggestion-utils`、`saveAgentSuggestion`、`discardAgentSuggestion`、`agent-suggestions` 以及旧 suggestion UI 文案在前端运行时代码中已移除；剩余命中仅为负向断言。
- Legacy run 退场：`creation-flow.spec.ts` 和 `session-assets-flow.spec.ts` 计数 legacy `POST /v1/worlds/:worldId/agent-runs`，确认 session 主路径创建世界后未触发旧 agent run。
