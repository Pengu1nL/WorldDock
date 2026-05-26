# Phase 1: Monorepo 与共享领域契约实施计划

## 目标

把当前前端单应用迁移为 pnpm workspace，并建立后端后续 Phase 依赖的共享包：

- `apps/web` 保留现有 Next.js 前端体验、脚本和测试行为；
- `packages/domain` 承载 WorldDock 领域 Zod schema 与类型；
- `packages/config` 统一运行环境与环境变量校验；
- `packages/logger` 提供 pino logger、request id helper 和敏感字段 redaction 规则。

## 范围

本 Phase 只做工程结构迁移和共享契约抽取，不接入数据库、不新增 API 服务、不改变产品行为。

## 涉及文件

- 根目录：`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`
- Web：`apps/web/package.json`、`apps/web/tsconfig.json`、`apps/web/next.config.ts`、`apps/web/vitest.config.ts`、`apps/web/playwright.config.ts`、`apps/web/src/**`、`apps/web/tests/**`
- Domain：`packages/domain/src/**`、`packages/domain/test/**`
- Config：`packages/config/src/**`、`packages/config/test/**`
- Logger：`packages/logger/src/**`、`packages/logger/test/**`

## 数据模型

本 Phase 不新增数据库模型。领域契约只覆盖前端 Mock MVP 已有模型：

- `World`
- `WorldSuggestion`
- `AgentSeed`
- `ConsistencyIssue`
- `PublicRepository`
- `Release`
- `ApiError`

## API

本 Phase 不新增 HTTP API。只定义后续 API 共享使用的错误结构 schema。

## 前端接入点

- `apps/web/src/features/worlddock/state.ts`
- `apps/web/src/features/worlddock/mock-data.ts`
- `apps/web/src/features/worlddock/fixtures.ts`
- `apps/web/src/features/worlddock/view-community.tsx`
- `apps/web/src/features/worlddock/view-settings.tsx`
- `apps/web/src/features/worlddock/view-publish.tsx`
- `apps/web/src/features/worlddock/__tests__/domain.test.ts`

这些文件应从 `@worlddock/domain` 引入共享类型和 schema。

## Task 清单

- [x] 新增 Phase 1 实施计划文档。
- [x] 新增 `pnpm-workspace.yaml`，声明 `apps/*` 和 `packages/*`。
- [x] 新增根级 `tsconfig.base.json`，统一 strict TypeScript 配置。
- [x] 将当前 Next.js 前端迁移到 `apps/web`，保留页面、样式、测试和脚本行为。
- [x] 调整根级 `package.json` scripts，支持 workspace 级 lint/test/build 和 `@worlddock/web` filter。
- [x] 新增 `packages/domain`，迁移 world、suggestion、repository、release、error schema。
- [x] 新增 `packages/config`，提供 env schema 与运行环境枚举。
- [x] 新增 `packages/logger`，提供 pino logger、request id helper 和 redaction 规则。
- [x] 更新前端 import，让前端从 `@worlddock/domain` 读取共享类型。
- [x] 保留现有前端 E2E 测试路径，确保迁移后行为不变。

## 测试命令

```bash
pnpm install
pnpm --filter @worlddock/domain test
pnpm --filter @worlddock/config test
pnpm --filter @worlddock/logger test
pnpm --filter @worlddock/web lint
pnpm --filter @worlddock/web test
pnpm --filter @worlddock/web build
pnpm --filter @worlddock/web test:e2e
```

## 验收标准

- `pnpm install` 成功；
- `pnpm --filter @worlddock/domain test` 通过；
- `pnpm --filter @worlddock/config test` 通过；
- `pnpm --filter @worlddock/logger test` 通过；
- `pnpm --filter @worlddock/web lint` 通过；
- `pnpm --filter @worlddock/web test` 通过；
- `pnpm --filter @worlddock/web build` 通过；
- `pnpm --filter @worlddock/web test:e2e` 通过；
- 前端核心路径仍可运行，页面内容和当前 Mock 行为不回退。

## 实际验收结果

- `pnpm install`：通过。
- `pnpm --filter @worlddock/domain test`：通过，1 个测试文件、5 条测试。
- `pnpm --filter @worlddock/config test`：通过，1 个测试文件、3 条测试。
- `pnpm --filter @worlddock/logger test`：通过，1 个测试文件、4 条测试。
- `pnpm --filter @worlddock/web lint`：通过。
- `pnpm --filter @worlddock/web test`：通过，2 个测试文件、5 条测试。
- `pnpm --filter @worlddock/web build`：通过，Next.js 静态构建成功。
- `pnpm --filter @worlddock/web test:static-export`：通过，静态导出校验 9 个 assets、1 个 CSS bundle。
- `pnpm --filter @worlddock/web test:e2e`：通过，5 条 Playwright E2E。
- `pnpm lint`、`pnpm test`、`pnpm build`：均通过。

## 未完成项与风险

- 本 Phase 未接入真实后端服务，API、数据库、认证与 Worker 将在后续 Phase 实现。
- `pnpm install` 仍提示 `sharp`、`unrs-resolver` build scripts 未批准，这是 pnpm 安全提示；当前 Phase 的 build/test/e2e 不受影响。
