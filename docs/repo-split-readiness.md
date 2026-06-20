# 界坞 WorldDock 脱离 monorepo · 面向用户测试就绪度评审

状态：修复后核验稿 | 日期：2026-06-20 | 评审对象：当前工作树（HEAD `57a5d16b`）

> 术语约定：这里的"脱离 monorepo"指**把界坞从原来界坞+界仓合并的代码库里彻底切干净，成为一个能独立交付、独立测试的产品仓库**。界坞内部仍然是一个 pnpm workspace（`apps/* + packages/*`），这是 `docs/repo-split-plan.md` 既定结构，不需要拍平。

---

## 0. TL;DR

结构性拆分已经基本完成。源码层面这个仓库已经是**纯界坞**了：模块、Web feature、Prisma 模型、docker-compose、契约包、CLI 和协作 UI 都在界坞边界内。本修复分支已经补齐本地数据忽略、构建清理、contract/CLI 可消费 tarball、首跑脚本、CI/release workflow 和公开文档边界。

按优先级，离"可以发给外部测试者"还差三类外部证据/发布动作：

1. **P0｜可信度与分发**：当前 HEAD 已有本机 `pnpm verify` 通过证据；仍需 `pnpm verify:ci` / CI 归档证据、重新打 `worlddock-v0.1.x` release tag，并验证 `@worlddock/contract` 与 `@worlddock/cli` 的 npm 包可安装、可导入、可执行。
2. **P1｜发布闭环**：需要推送 `contract-v0.1.1`、`cli-v0.1.1`、`worlddock-v0.1.1` 并确认 GitHub Actions 与 npm registry 结果。
3. **P2｜端到端边界**：界坞↔界仓 push/pull 在线 E2E 仍依赖 WorldHub URL + PAT，需要在发布后复核。

---

## 1. 已经做对的部分（先确认基线）

| 维度 | 现状 | 证据 |
|---|---|---|
| API 模块 | 仅界坞域：`agent, agent-sessions, connections, consistency, exports, local-storage, official-assets, potential-assets, pull-client, push-client, system, world-assets, worlds`。无 community/moderation/notifications/billing/auth/repositories/S3-storage。 | `apps/api/src/modules/` |
| Web feature | 仅 `agent, agent-sessions, consistency, world-assets, worlddock, worlds`。无 community/account/billing/auth。 | `apps/web/src/features/` |
| Prisma 模型 | 仅界坞域（World/资产/Agent/AgentSession/OfficialAsset/HubConnection/LocalStorageObject…）。无 User/Session/PublicRepository/Billing 表。 | `packages/db/prisma/schema.prisma` |
| 本地依赖 | `docker-compose.yml` 只有 postgres，已砍掉 Redis/BullMQ/Meili/MinIO。 | `docker-compose.yml` |
| 契约包 | `@worlddock/contract` 已抽出，`private:false`，多 subpath exports，`publishConfig.access=public`。 | `packages/contract/package.json` |
| 协作 UI | 界仓连接（保存/测试/断开）+ 发布向导已接到 UI；源码里**没有硬编码界仓 URL**（走 connections/PAT 配置）。 | `apps/web/src/features/worlddock/view-settings.tsx`, `view-publish.tsx` |
| 首跑 | `(app)/onboarding` 路由存在；无本地登录路由。 | `apps/web/src/app/` |
| CLI 命令 | 已实现 `login / push / pull / worlds list|export|import|pull`。 | `packages/worlddock-cli/src/main.ts` |
| Git 归档 | tag `monorepo-final`、`contract-v0.1.0`、`worlddock-v0.1.0` 都在。 | `git tag` |
| CI | `ci.yml` 运行 `pnpm verify:ci`；`contract-release.yml` 发布前跑 contract `test:pack`；`cli-release.yml` 负责 `cli-v*` tag 发布。 | `.github/workflows/` |

结论：**架构切割是干净的**，下面的问题都不需要再动模块归属。

---

## 2. P0 — 挡住"能发给测试者"的硬问题

### 2.1 当前修复分支已有本机绿色验证，但还缺 CI 归档证据和新 release tag

- 当前修复分支已执行本机 `pnpm verify`，覆盖 Prisma validate、lint、unit test 和 build。
- `pnpm verify:ci` 已接入 CI workflow，并包含 API integration 与 Web E2E；但还需要 GitHub Actions run 作为可共享归档证据。
- `worlddock-v0.1.0` 仍是旧 tag，不能代表当前修复后的代码。

**动作**：在当前 HEAD 跑 `pnpm verify:ci` / GitHub Actions → 归档真实日志 → 重新打 `worlddock-v0.1.1`。没有当前 HEAD 的 CI 证据，不建议把 tag 当作外部测试版本。

### 2.2 契约包已发布，但 0.1.0 npm 包不可作为普通 Node ESM 依赖消费

- `npm view @worlddock/contract version` 当前返回 `0.1.0`，说明包已经发布。
- 但 `@worlddock/contract@0.1.0` tarball 只包含 `src/**/*.ts`，`exports` 指向 TS 源文件；普通 Node ESM consumer 执行 `import('@worlddock/contract')` 会报 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。
- 当前本地 contract 已新增 `agent-sessions`、`consistency`、`potential-assets` 子路径，npm 上的 `0.1.0` 还没有这些 exports。

**动作**：发布 `@worlddock/contract@0.1.1`，将 `exports` 指向 `dist/*.js`，同时提供 `dist/*.d.ts`；发布前运行 `pnpm --filter @worlddock/contract test:pack`，在临时 consumer 项目里验证主入口和所有 subpath 都能导入。

### 2.3 CLI 需要发布为真正的 npm 二进制包

- `packages/worlddock-cli/package.json` 已改为发布包 `@worlddock/cli`，`bin.worlddock` 指向 `dist/main.js`。
- 发布前必须验证 tarball 安装后 `node_modules/.bin/worlddock` 能启动并输出 usage。
- README 的 CLI 命令需要与源码一致：拉取仓库使用 `worlddock pull owner/slug` 或 `worlddock worlds pull owner slug`，不是 `worlddock repositories pull owner/slug`。

**动作**：发布 `@worlddock/cli@0.1.1`，并在 `cli-v0.1.1` release workflow 中运行 `pnpm --filter @worlddock/cli test:pack`。

---

## 3. P1 — 首跑/测试体验摩擦

### 3.1 首跑已收敛为依赖安装、setup、dev

当前首跑路径已改为：

```bash
pnpm install
pnpm run setup
pnpm dev
```

`pnpm run setup` 会复制 `.env.example`、启动本地 postgres、生成 Prisma Client 并执行 migration。这里刻意使用 `pnpm run setup`，因为裸 `pnpm setup` 是 pnpm 自己的 shell 配置命令，不会执行仓库脚本。`pnpm dev` 已改为同时启动 API 和 Web。

**剩余动作**：找一台没有现成 3000/4000 端口占用的机器做一次外部测试者首跑录像或日志归档。

### 3.2 本地运行时数据已被 gitignore 覆盖

`.gitignore` 已增加：

```gitignore
.worlddock/
apps/*/.worlddock/
```

已验证 `.worlddock/` 与 `apps/api/.worlddock/` 下的文件会显示为 ignored，不再污染公开仓库。

### 3.3 首跑"打开即用"需实测确认

`repo-split-plan §8` 定的是界坞彻底无登录、首跑直接进工作台。`(app)/onboarding` 在，但需手动过一遍：确认向导里没有残留注册/云账号/计费等界仓概念的文案或跳转。（本项为低置信，建议人工走查一遍。）

---

## 4. P2 — 卫生与解耦收尾

### 4.1 stale `dist` 残留已通过 clean/build 固定

根命令已新增 `pnpm clean`，并让 `pnpm build` 先清理 `apps/*/dist`、`packages/*/dist`、`.next`、test results、coverage 等产物后再重建。已验证旧 API auth/billing/repositories dist 和旧 Prisma repository model 不会在 build 后回来。

### 4.2 `docs/*` 公开边界已收紧

`.gitignore` 继续保持：

```gitignore
docs/*
!docs/contract-rfc.md
```

除 `docs/contract-rfc.md` 外，内部 docs 已从 Git 索引移除但保留在本地磁盘。后续如需公开新增文档，应显式调整白名单或 `git add -f`。

### 4.3 README / 文档与现状已对齐到公开边界

README 的 docs 段落现在只链接 `docs/contract-rfc.md`；CLI 段落已改为 `@worlddock/cli`、`worlddock pull owner/slug` 与 `worlddock worlds pull owner slug`，并补上 `pnpm --filter @worlddock/cli test:pack`。

### 4.4 契约变更流程落地

契约变更流程已落到发布前验证：`contract-release.yml` 会运行 `pnpm --filter @worlddock/contract test:pack`，`cli-release.yml` 会先验证 contract tarball，再验证 CLI tarball 和二进制 usage。主 CI 已切到 `pnpm verify:ci`，覆盖 integration 与 E2E。

---

## 5. 建议执行顺序（最小路径到"可外部测试"）

1. 在本机或 CI 跑 `pnpm verify:ci`，归档真实日志。
2. 创建 `contract-v0.1.1`、`cli-v0.1.1`、`worlddock-v0.1.1` release tag。
3. 推送分支和 tags，确认 GitHub Actions 的 `ci`、`Contract Release`、`CLI Release` 全绿。
4. 验证 npm 上 `@worlddock/contract@0.1.1` 与 `@worlddock/cli@0.1.1` 可安装、可导入、可执行。
5. 用在线 WorldHub URL + PAT 复核界坞↔界仓 push/pull E2E。

做完 1–4，界坞具备"自洽、可复现、可分发"的底座；做完 5，就到了"可以发给外部测试者"的状态。

---

## 附：本次评审的边界

- 本机已执行 `pnpm verify` 并通过；`pnpm verify:ci`、GitHub Actions run、npm 发布后的在线安装验证、界坞↔界仓 push/pull 端到端仍需按本修复计划完成后复核。
- 未实跑界坞↔界仓 push/pull 端到端（需要在线 WorldHub URL + PAT），与 `p5/final-verification.md` 的 "Push/Pull E2E: BLOCKED" 一致。
