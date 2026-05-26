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
- [x] `pnpm test:static-export` 通过
- [x] `pnpm test:e2e` 通过
- [x] 移动端 390x844 无横向溢出

## 当前验证记录

- 完整质量门：`pnpm lint && pnpm test && pnpm test:static-export && pnpm test:e2e` 已通过。
- `pnpm lint`：通过。
- `pnpm test`：通过，2 个测试文件、5 个测试。
- `pnpm build`：通过，使用 webpack 构建以避开当前沙箱中的 Turbopack 端口绑定限制。
- `pnpm test:static-export`：通过，确认 `out/index.html`、相对 Next 静态资源、初始页面内容与移动端 CSS 规则均存在。
- 直连 Playwright：通过，命令为 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(node scripts/resolve-playwright-chromium.mjs)" ./node_modules/.bin/playwright test --project=chromium --workers=1 --reporter=line`，5 条浏览器用例全部通过，覆盖创作、社区、发布、设置与 `390x844` 移动端无横向溢出；最新复验为 5 passed。
- 截图验收：已生成 `artifacts/frontend-verification/desktop-workbench.png` 与 `artifacts/frontend-verification/mobile-create-390x844.png`，用于桌面工作台和移动端创建路径的视觉复核。
- `pnpm test:e2e`：解除 Codex 沙箱限制后通过；构建阶段通过，Playwright 5 条浏览器用例全部通过，最新耗时 24.8s。
