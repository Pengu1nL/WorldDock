# WorldDock 前端完善计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将界坞 WorldDock 前端原型补齐到“可演示、可验收、可继续接后端”的高保真 Web MVP。

**Architecture:** 继续保留单页高保真原型的交互速度，同时把领域对象、Mock 数据、页面视图、状态 reducer 和验收脚本分层。短期以可信 Mock 闭环覆盖核心体验，后续用相同类型边界接入真实 API、模型流和社区服务。

**Tech Stack:** Next.js App Router、React、TypeScript、Zod、Vitest、Playwright、CSS Modules / 全局 CSS、lucide-react、Radix UI Primitives。

---

## 1. 当前结论

前端原型距离需求的主要差距已经从“核心页面缺失”收敛为“浏览器级验收与真实服务接入前的收口”。

当前已经基本覆盖：

- 创作闭环：从灵感创建世界、确认世界雏形、进入工作台、Mock Agent 流式输出、保存设定、保存故事种子、查看一致性提醒。
- 社区闭环：Explore、公开世界仓库、Overview、公开档案、故事种子、冲突池、Star、Fork、Releases、举报。
- 发布 / Push 闭环：发布入口、公开范围、不会公开内容、实体级 diff、更新说明、授权方式、确认发布、发布后状态变化。
- Local / Cloud 表达：余额、本次消耗、余额不足、模型连接状态、社区 Access Token、Local Push 公开快照说明。
- 工程骨架：领域 schema、状态 reducer、单元测试、静态导出验证、E2E 用例文件。

当前验收已经闭合：

- 标准脚本 `pnpm test:e2e` 已在解除 Codex 沙箱限制后通过：构建成功，Playwright 5 条 E2E 通过，覆盖创作、社区、发布、设置与移动端响应式。
- 直连命令 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(node scripts/resolve-playwright-chromium.mjs)" ./node_modules/.bin/playwright test --project=chromium --workers=1 --reporter=line` 也已通过 5 条 E2E。
- 移动端 `390x844` 无横向溢出已由 `tests/e2e/responsive.spec.ts` 在直连 Playwright 命令中验证通过，桌面 / 移动端截图已生成到 `artifacts/frontend-verification/`。
- 现阶段仍是 Mock 前端闭环，真实登录、真实发布、真实模型连接、真实计费、真实内容审核不属于本轮原型完成范围，但需要保留清晰接入点。
- 部分页面组件仍偏原型实现，后续进入生产化时需要继续拆分通用 UI、Query API 层和持久化 store。

## 2. 完善目标

本轮前端完善以“需求可演示”为第一目标，而不是提前完成后端生产化。

完成后应满足：

- 用户能完整演示一个世界从灵感、推演、沉淀、归档到发布的路径。
- 用户能理解 Local 与 Cloud 的差异，尤其是模型连接、余额消耗、社区 Token 与 Push 边界。
- 用户能像浏览 GitHub 仓库一样浏览公开世界、查看版本、Star、Fork、举报。
- 所有 Mock 行为都有真实产品状态感，包括加载、成功、失败、禁用、余额不足、连接异常和 Toast 反馈。
- 前端类型、状态和测试足够稳，后续接入 API 时不用推倒重写。

## 3. 范围边界

### 本轮必须完成

- 产品路径完整性：创作、档案、社区、发布、设置五个主要路径都可点击、可反馈、可回退。
- 领域类型：世界、Agent 建议、故事种子、冲突、公开仓库、Release、错误类型使用 TypeScript + Zod 表达。
- Mock 真实感：Agent 流式输出、保存后数量变化、Fork 后生成私有世界、发布后状态更新、余额不足阻止运行。
- 响应式：移动端不出现关键路径横向溢出，窄屏下导航、状态栏、页面头部和主要网格能重排。
- 验收命令：`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:static-export`、`pnpm test:e2e`。

### 本轮不做

- 真实后端、数据库、登录注册和权限系统。
- 真实 LLM 调用、真实计费、真实模型 Key 校验。
- 真实发布到远端仓库、真实审核队列和管理员后台。
- 完整设计系统组件库重构。
- 多路由生产 IA 重构，当前仍允许单页原型承载主要体验。

## 4. 分阶段计划

### Phase 1: 领域与状态基线

目标：让 Mock 数据和交互状态有清晰边界，避免原型继续靠隐式对象字段增长。

- [x] 新增 `src/features/worlddock/domain.ts`，定义世界、Agent 建议、公开仓库、Release、错误类型 schema。
- [x] 新增 `src/features/worlddock/state.ts`，沉淀打开世界、保存建议、Fork、Publish、Push 的 reducer。
- [x] 移除 WorldDock 业务文件中的 `@ts-nocheck`。
- [x] 新增 `src/features/worlddock/__tests__/domain.test.ts`。
- [x] 新增 `src/features/worlddock/__tests__/state.test.ts`。
- [x] 运行 `pnpm test`，确认领域和 reducer 行为通过。

验收标准：

- Mock 数据能被 schema 校验。
- 保存 setting / seed / conflict 后，当前世界的档案、种子、冲突数量正确变化。
- Fork 公开仓库后生成私有 draft 世界。

### Phase 2: 创作工作台完善

目标：工作台不只是聊天，而是“推演、挑刺、收束、生成故事种子”的协作现场。

- [x] 在 `src/features/worlddock/view-workbench.tsx` 展示 Agent 模式按钮组。
- [x] 模式切换后给出可见反馈。
- [x] 后续 Agent run 根据模式产出对应的可保存建议。
- [x] 保存设定后进入档案可见。
- [x] 保存故事种子后进入故事种子池可见。
- [x] 支持一致性提醒、上下文引用和待处理建议入口。

验收标准：

- 从“一个世界里，记忆可以被买卖。”创建世界后，可以看到至少 3 条设定、1 条一致性提醒、3 个故事种子。
- 用户必须手动保存，Agent 不会自动修改世界档案。
- 保存成功有 Toast 和数量变化反馈。

### Phase 3: 发布 / Push 闭环

目标：用户在公开世界前明确知道“会公开什么、不会公开什么、版本变化是什么”。

- [x] 新增 `src/features/worlddock/view-publish.tsx`。
- [x] 从状态栏发布按钮进入发布 / Push 视图。
- [x] 展示公开范围与不会公开内容。
- [x] 展示实体级差异预览。
- [x] 填写更新说明并选择授权方式。
- [x] Cloud 发布后世界变为公开。
- [x] Local 未连接社区 Token 时禁用 Push。
- [x] Local Push 明确说明是公开快照，不包含本地敏感信息。

验收标准：

- 发布前能看到“原始对话记录”“API Key”等不会公开内容。
- 发布成功后世界状态从 draft / unpublished 变为 published / public。
- Local 模式未连接 Token 时不能 Push，并能看到明确原因。

### Phase 4: 界仓社区闭环

目标：公开世界仓库要形成 GitHub-like 心智，而不是普通卡片列表。

- [x] 新增 `src/features/worlddock/fixtures.ts`，提供公开仓库、Release、授权、统计数据。
- [x] 新增 `src/features/worlddock/view-community.tsx`。
- [x] Explore 列表支持打开公开仓库详情。
- [x] 仓库详情支持 Overview、Releases、Archive、Seeds、Conflicts、Forks 标签。
- [x] 支持 Star、Fork、举报。
- [x] Fork 后生成私有世界并进入工作台。

验收标准：

- 用户可以快速理解公开世界的亮点、版本、授权和 Fork 来源。
- Star 有即时数量变化。
- 举报提交后有成功反馈。
- Fork 生成的世界默认 private / draft。

### Phase 5: 设置、错误与 Local / Cloud

目标：把“本地 World IDE”和“云端社区”的差异前端化。

- [x] 新增 `src/features/worlddock/view-settings.tsx`。
- [x] Cloud 显示余额、本次消耗和余额不足状态。
- [x] Local 显示模型连接状态、模型测试按钮和社区 Access Token 状态。
- [x] 支持保存 / 断开社区 Token。
- [x] 支持 Mock Failure 开关，覆盖模型不可用、余额不足、保存失败等异常。
- [x] 关键禁用态和错误态有用户可读提示。

验收标准：

- 余额不足时 Agent Run 被阻止。
- 模型不可用时不会假装继续生成。
- 保存失败不会把建议标记为已保存。
- 设置页能解释 Local / Cloud 当前能力差异。

### Phase 6: 响应式与视觉收口

目标：让原型在桌面和移动端都能完成核心路径，避免布局在窄屏下破裂。

- [x] 为状态栏、侧边 rail、页面头部、滚动容器、社区详情网格补充移动端规则。
- [x] 将固定宽度输入和网格改为响应式宽度。
- [x] 静态导出脚本检查移动端 CSS 规则存在。
- [x] 在真实浏览器中执行 `tests/e2e/responsive.spec.ts`，确认 `390x844` 无横向溢出。
- [x] 生成桌面和移动端截图，确认导航、弹层、按钮文字没有遮挡。

截图证据：

- `artifacts/frontend-verification/desktop-workbench.png`
- `artifacts/frontend-verification/mobile-create-390x844.png`

验收标准：

- `390x844` 视口下可以进入“我的世界 -> 新建世界 -> 创建世界”。
- `document.documentElement.scrollWidth <= window.innerWidth + 1`。
- 状态栏和页面头部不会遮挡主体内容。

### Phase 7: 验收与交付

目标：把“能跑”变成“有证据地可验收”。

- [x] `pnpm lint` 通过。
- [x] `pnpm test` 通过。
- [x] `pnpm build` 通过。
- [x] `pnpm test:static-export` 通过。
- [x] 直连运行 Playwright E2E，确认 5 条浏览器用例通过。
- [x] 解除沙箱限制后运行 `pnpm test:e2e`，确认 5 条浏览器用例通过。
- [x] 更新 `docs/frontend_completion_checklist.md`，记录直连 E2E 与移动端响应式结果。
- [x] 标准脚本已通过，无需继续按启动环境阻断处理。

当前解除限制说明：

- 之前的失败来自 Codex 受限沙箱对 Chromium Mach port 的限制。
- 当前环境切换为无文件系统沙箱并允许网络后，`pnpm test:e2e` 已可正常启动 Chromium 并完成页面用例。
- 普通本机环境可先运行 `pnpm exec playwright install chromium`，再运行 `pnpm test:e2e`。

## 5. 文件清单

核心实现文件：

- `src/features/worlddock/domain.ts`
- `src/features/worlddock/state.ts`
- `src/features/worlddock/fixtures.ts`
- `src/features/worlddock/world-dock-app.tsx`
- `src/features/worlddock/view-worlds.tsx`
- `src/features/worlddock/view-workbench.tsx`
- `src/features/worlddock/view-archive.tsx`
- `src/features/worlddock/view-community.tsx`
- `src/features/worlddock/view-publish.tsx`
- `src/features/worlddock/view-settings.tsx`
- `src/features/worlddock/components.tsx`
- `src/features/worlddock/tweaks-panel.tsx`
- `src/styles/base.css`

测试与验证文件：

- `src/features/worlddock/__tests__/domain.test.ts`
- `src/features/worlddock/__tests__/state.test.ts`
- `tests/e2e/creation-flow.spec.ts`
- `tests/e2e/community-flow.spec.ts`
- `tests/e2e/publish-flow.spec.ts`
- `tests/e2e/settings-flow.spec.ts`
- `tests/e2e/responsive.spec.ts`
- `tests/e2e/helpers.ts`
- `scripts/verify-static-export.mjs`
- `playwright.config.ts`

文档文件：

- `docs/frontend_design_requirements.md`
- `docs/frontend_tech_stack.md`
- `docs/frontend_completion_checklist.md`
- `docs/frontend_completion_plan.md`
- `docs/superpowers/plans/2026-05-26-frontend-completion.md`

## 6. 验收命令

日常质量门：

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:static-export
```

浏览器级验收：

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

当前 Codex 沙箱可用的直连验收命令：

```bash
pnpm build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(node scripts/resolve-playwright-chromium.mjs)" ./node_modules/.bin/playwright test --project=chromium --workers=1 --reporter=line
```

单独验证响应式：

```bash
pnpm build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(node scripts/resolve-playwright-chromium.mjs)" ./node_modules/.bin/playwright test tests/e2e/responsive.spec.ts --project=chromium
```

## 7. 风险与后续接入点

- 真实 API 接入时，优先把 `fixtures.ts` 替换为 feature API 层，不要让页面组件直接请求后端。
- Agent 流式协议需要独立定义事件格式，不能只把文本流塞进 message。
- 发布 / Push 后续需要后端返回真实 release id、diff、审核状态和公开 URL。
- Local 模式需要清晰区分“模型 Key 存在”“模型连接可用”“社区 Token 可用”三种状态。
- 生产化前应继续拆分 UI primitives，减少页面文件中的内联样式。
- 管理后台是需求中的 P0 方向，但当前原型尚未实现；如果下轮要补，应单独写管理员视图计划。

## 8. 完成定义

本计划完成的定义是：

- `docs/frontend_completion_checklist.md` 全部勾选。
- `pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:static-export`、`pnpm test:e2e` 全部通过。
- 桌面与 `390x844` 移动端截图确认核心路径没有明显遮挡；`390x844` 无横向溢出已由 E2E 用例验证。
- 创作、社区、发布、设置四条 E2E 路径均有测试覆盖。
- 已知剩余项全部属于后端真实能力或生产化重构，而不是前端原型缺口。
