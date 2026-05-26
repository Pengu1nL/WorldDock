# 界坞 WorldDock 前端技术栈文档

文档版本：v0.1
更新日期：2026-05-26
适用阶段：Web MVP / 生产化前端
关联文档：`docs/frontend_design_requirements.md`、`docs/jiewu_worlddock_prd.pdf`

## 1. 文档目标

本文档用于确定界坞 WorldDock 的 Web 前端技术栈、工程边界与关键取舍。

本阶段明确不考虑 Desktop / Tauri / Electron 形态。界坞前端先以浏览器 Web 应用为唯一交付形态，重点支撑：

- 创作者工作台；
- Agent 流式推演；
- 世界档案、故事种子、冲突池与一致性问题处理；
- 类 GitHub 的公开世界仓库页；
- 登录、发布、Star、Fork、搜索与基础社区浏览；
- 后续接入真实后端、计费、模型调用与内容审核。

## 2. 总体结论

界坞前端推荐采用：

```txt
Next.js App Router
React
TypeScript
Tailwind CSS v4
Radix UI Primitives
lucide-react
Zustand
TanStack Query
Vercel AI SDK
Zod
Vitest
Playwright
```

一句话判断：

界坞不是普通 AI 聊天页，也不是营销站，而是“创作者工作台 + 公开世界仓库 + Agent 协作系统”。技术栈应优先服务复杂交互、长会话状态、流式输出、公开页 SEO 与可持续产品迭代。

## 3. 技术选型原则

### 3.1 Web 优先

不为桌面端预留额外运行时，不引入 Tauri / Electron / Capacitor。

如果未来要做移动或桌面，应先验证 Web 版的信息架构、资产模型和 Agent 交互是否成立，再另行评估，不在本阶段技术栈中提前支付复杂度。

### 3.2 产品气质优先

界坞需要专业、克制、可长时间使用的工作台气质，不应直接套用重型后台组件库。

优先使用低层 UI primitives 和自定义设计系统，保留当前原型中的：

- IDE 状态栏心智；
- 世界仓库心智；
- 对话优先工作台；
- 内联沉淀建议；
- 冲突、种子、档案等领域对象的独立视觉语言。

### 3.3 类型与边界优先

前端需要长期承载复杂领域对象。所有跨网络、跨存储、跨 Agent 输出的结构化数据，都必须有明确 schema。

推荐用 TypeScript 类型表达内部开发约束，用 Zod 校验外部输入边界。

### 3.4 流式体验优先

Agent 输出不是普通文本响应，而是包含：

- 消息正文流；
- tool calls；
- 上下文引用；
- 可保存设定；
- 潜在冲突；
- 故事种子；
- 一致性问题；
- 保存、丢弃、暂存等用户确认动作。

因此 Agent SDK 只能作为通信与流式基础，界坞必须定义自己的 Agent 事件协议和前端状态模型。

## 4. 核心技术栈

### 4.1 应用框架：Next.js App Router

选择：`Next.js App Router`

使用理由：

- 支持公开世界仓库页的 SSR / SEO；
- 支持工作台等高交互页面使用 Client Components；
- 支持 API Route / Route Handler 承接 BFF 层；
- 支持流式渲染、Suspense、Server Components 等现代 React 能力；
- 适合同时承载“公开社区页面”和“登录后应用页面”。

使用边界：

- 公开世界页、世界仓库详情页、SEO 页面优先使用 Server Components；
- 工作台、抽屉、对话流、编辑器、命令面板等交互密集区域使用 Client Components；
- 不把所有组件都写成 Client Components；
- 不在组件层直接写业务请求，统一通过 feature 层 API 封装。

推荐路由分组：

```txt
src/app/
  (public)/
    page.tsx
    worlds/[worldId]/page.tsx
    explore/page.tsx
  (auth)/
    login/page.tsx
    register/page.tsx
  (workspace)/
    worlds/page.tsx
    worlds/[worldId]/workbench/page.tsx
    worlds/[worldId]/archive/page.tsx
    worlds/[worldId]/seeds/page.tsx
    worlds/[worldId]/conflicts/page.tsx
  api/
    agent/route.ts
```

### 4.2 语言：TypeScript

选择：`TypeScript strict mode`

使用理由：

- 世界、设定、冲突、种子、Agent 事件等对象结构复杂；
- 前后端和 Agent 输出之间需要稳定类型契约；
- 后续多人协作时，类型能降低重构风险。

要求：

- `strict: true`；
- 禁止在领域模型里使用宽泛 `any`；
- API 返回值、Agent 事件、表单输入必须有显式类型；
- 类型文件按领域归属放置，不集中堆在一个 `types.ts`。

### 4.3 样式系统：Tailwind CSS v4 + CSS Variables

选择：`Tailwind CSS v4` + 自定义设计 tokens

使用理由：

- 当前原型已经有清晰的 `tokens.css` 思路；
- Tailwind 适合高密度工作台界面快速迭代；
- CSS variables 适合承载主题、密度、色板和语义 token；
- 不会像重型组件库那样压平界坞自己的气质。

要求：

- 设计 token 用 CSS variables 表达；
- Tailwind 负责布局、间距、响应式、状态样式；
- 复杂组件样式沉淀为本地 UI 组件，不在业务页面里堆长 class；
- 继续保留 light / dark、density、title font 等可配置方向。

建议 token 分层：

```txt
基础 token：颜色、字号、圆角、阴影、间距
语义 token：bg、surface、fg、border、sage、amber、brick、violet
组件 token：statusbar、rail、drawer、chat、card、tag、badge
产品 token：setting、conflict、seed、issue、cloud、local
```

### 4.4 UI primitives：Radix UI + 自建 WorldDock UI

选择：`Radix UI Primitives` + `lucide-react` + 自建组件层

使用理由：

- Radix 提供可访问性较好的底层交互 primitives；
- 适合构建 Dialog、Popover、Dropdown、Tabs、Tooltip、ScrollArea、Toast 等工作台常用组件；
- lucide-react 覆盖大多数工具按钮图标；
- 自建组件层能保留界坞的专业工作台视觉。

推荐组件分层：

```txt
src/components/ui/
  button.tsx
  icon-button.tsx
  input.tsx
  textarea.tsx
  dialog.tsx
  drawer.tsx
  popover.tsx
  tabs.tsx
  toast.tsx
  tooltip.tsx
  badge.tsx
  tag.tsx

src/components/worlddock/
  app-shell.tsx
  status-bar.tsx
  side-rail.tsx
  world-card.tsx
  agent-message.tsx
  suggestion-card.tsx
  context-drawer.tsx
```

不推荐：

- Ant Design；
- Material UI；
- Bootstrap；
- 大面积 shadcn/ui 原样照搬。

shadcn/ui 可以作为代码参考或局部脚手架来源，但最终组件应被改造成 WorldDock 自己的视觉语言。

### 4.5 客户端状态：Zustand

选择：`Zustand`

适用范围：

- 当前世界；
- 工作台视图状态；
- Agent 运行状态；
- 抽屉、弹层、toast；
- 待处理建议；
- 临时草稿；
- 当前上下文选择；
- tweak / density / theme 等 UI 偏好。

使用理由：

- 比 Redux 更轻；
- 对高交互工作台状态足够直接；
- 与 React Client Components 配合简单；
- 适合拆成多个领域 store。

建议 store 分层：

```txt
src/stores/
  app-shell-store.ts
  workbench-store.ts
  agent-run-store.ts
  draft-store.ts
  ui-preferences-store.ts
```

不应放入 Zustand 的内容：

- 服务端世界列表；
- 用户信息；
- Star / Fork 状态；
- 公开世界搜索结果；
- 后端分页数据。

这些属于 server state，应交给 TanStack Query。

### 4.6 服务端状态：TanStack Query

选择：`TanStack Query`

适用范围：

- 世界列表；
- 世界详情；
- 档案列表；
- 种子列表；
- 冲突列表；
- 社区公开世界；
- Star / Fork / Publish；
- 用户账户与用量；
- 后端搜索结果。

使用理由：

- 解决服务端状态缓存、失效、重试、分页和乐观更新；
- 能减少手写 loading / error / refetch 逻辑；
- 适合工作台里“保存后数量立即变化、后台再同步”的体验。

要求：

- query key 统一由 feature 层导出；
- mutation 成功后显式 invalidate 或更新缓存；
- 对保存设定、保存种子、Star、Fork 等动作使用乐观更新；
- 不用 Zustand 复制一份服务端数据。

示例 query key 命名：

```ts
export const worldKeys = {
  all: ["worlds"] as const,
  list: (filters: WorldListFilters) => ["worlds", "list", filters] as const,
  detail: (worldId: string) => ["worlds", "detail", worldId] as const,
  archive: (worldId: string) => ["worlds", "detail", worldId, "archive"] as const,
  seeds: (worldId: string) => ["worlds", "detail", worldId, "seeds"] as const,
  conflicts: (worldId: string) => ["worlds", "detail", worldId, "conflicts"] as const,
};
```

### 4.7 Agent 流式层：Vercel AI SDK + 自定义事件协议

选择：`Vercel AI SDK`

使用方式：

- AI SDK 负责流式响应基础设施；
- 界坞自定义 Agent event schema；
- 前端使用 `agentClient` 适配 SDK 输出，不在 UI 组件里直接依赖 SDK 事件细节。

Agent event 初步建议：

```ts
type AgentEvent =
  | { type: "run.started"; runId: string; worldId: string; mode: AgentMode }
  | { type: "tool.started"; runId: string; toolCallId: string; label: string }
  | { type: "tool.completed"; runId: string; toolCallId: string; summary: string }
  | { type: "message.delta"; runId: string; text: string }
  | { type: "suggestion.created"; runId: string; suggestion: WorldSuggestion }
  | { type: "context.used"; runId: string; refs: ContextRef[] }
  | { type: "run.completed"; runId: string; usage?: TokenUsage }
  | { type: "run.failed"; runId: string; error: AgentError };
```

关键原则：

- UI 不直接假设 Agent 一次性返回完整 JSON；
- 建议卡片可以随流式过程渐进出现；
- 保存、丢弃、暂存必须由用户动作触发；
- Agent 不能直接写入世界资产；
- Agent 输出必须经过 Zod 校验再进入可保存建议池。

### 4.8 Schema 校验：Zod

选择：`Zod`

适用范围：

- API request / response；
- Agent structured output；
- 表单提交；
- URL search params；
- 本地缓存恢复；
- 导入 / 导出世界数据。

使用理由：

- TypeScript 只能约束编译期；
- Agent 输出、后端返回、用户导入文件都属于不可信输入；
- Zod 能让运行时校验与类型推导保持一致。

建议目录：

```txt
src/domain/
  world/
    world.schema.ts
    world.types.ts
  archive/
    archive.schema.ts
    archive.types.ts
  agent/
    agent-event.schema.ts
    agent-event.types.ts
```

### 4.9 表单：React Hook Form + Zod Resolver

选择：`React Hook Form` + `Zod Resolver`

适用范围：

- 创建世界；
- 编辑设定；
- 发布设置；
- 用户资料；
- 模型配置；
- 举报与内容审核入口。

使用理由：

- 表单状态轻；
- 与 Zod 校验配合成熟；
- 对长表单和抽屉内编辑体验更稳定。

简单输入可以直接用受控组件，不需要所有输入都套表单库。

### 4.10 图标：lucide-react

选择：`lucide-react`

使用理由：

- 图标覆盖面广；
- 线性风格适合界坞的工具型工作台；
- 易于统一 stroke、size、颜色；
- 比手写 SVG 更利于维护。

要求：

- 工具按钮优先用图标；
- 不熟悉的图标必须有 tooltip；
- 同一含义只使用一个图标，不在不同页面随意更换。

### 4.11 富文本与 Markdown

P0 推荐：

- 工作台输入使用 textarea；
- Agent 输出使用受控 Markdown-ish 渲染；
- 档案正文使用普通 textarea + preview；
- 公开世界页使用 Markdown 渲染。

暂不引入复杂富文本编辑器。

后续当出现以下需求时再评估 Lexical 或 TipTap：

- 档案正文需要块级编辑；
- 设定之间需要内联引用；
- 需要评论、批注、版本 diff；
- 需要类似 Notion 的结构化文档体验。

P0 可选依赖：

```txt
react-markdown
remark-gfm
rehype-sanitize
```

### 4.12 测试：Vitest + Testing Library + Playwright

选择：

- 单元测试：`Vitest`
- 组件测试：`Testing Library`
- E2E / 视觉回归：`Playwright`

测试重点：

- 创建世界流程；
- Agent 流式输出；
- 保存设定 / 种子 / 冲突；
- 一致性问题三选一；
- 公开世界页展示；
- Star / Fork / Publish；
- 移动端布局；
- 抽屉、弹层、菜单的键盘可用性。

最低验收：

- 核心流程有 Playwright E2E；
- 领域 schema 有单元测试；
- 关键 UI 状态有组件测试；
- 每次发布前跑桌面与移动视口截图检查。

## 5. 推荐工程结构

```txt
src/
  app/
    (public)/
    (auth)/
    (workspace)/
    api/
  components/
    ui/
    worlddock/
  domain/
    world/
    archive/
    seed/
    conflict/
    agent/
    user/
  features/
    worlds/
    workbench/
    archive/
    seeds/
    conflicts/
    community/
    publish/
    billing/
  lib/
    api/
    auth/
    query/
    stream/
    analytics/
  stores/
  styles/
    globals.css
    tokens.css
  tests/
    fixtures/
    factories/
```

分层规则：

- `domain` 放领域模型、schema、纯函数；
- `features` 放业务 UI、hooks、query、mutation；
- `components/ui` 放通用基础组件；
- `components/worlddock` 放界坞产品级组件；
- `lib` 放基础设施适配；
- `stores` 放客户端 UI 状态；
- `app` 只负责路由、布局、数据入口与页面组合。

## 6. 页面渲染策略

### 6.1 适合 Server Components 的页面

- 首页；
- 探索页；
- 公开世界详情页；
- 用户公开主页；
- 公开标签页；
- SEO landing 页；
- 静态文档页。

### 6.2 适合 Client Components 的模块

- 工作台对话流；
- 输入框 composer；
- Agent streaming renderer；
- 建议卡片；
- 抽屉；
- toast；
- 命令面板；
- 拖拽、排序、筛选、局部编辑；
- 实时 token / balance 状态。

### 6.3 混合页面

世界工作台页面可以由 Server Component 拉取初始世界数据，再把必要数据传给 Client Workbench。

公开世界页可以 Server Render 概览内容，Star / Fork 按钮局部 Client 化。

## 7. 数据与 API 边界

### 7.1 前端不直接绑定数据库

前端通过 API / BFF 访问数据，不在组件中直接操作数据库 SDK。

即使使用 Next.js Route Handler，也应保持：

```txt
UI -> feature hooks -> API client -> Route Handler / Backend -> Database
```

### 7.2 API client 统一封装

建议：

```txt
src/lib/api/http-client.ts
src/lib/api/errors.ts
src/features/worlds/worlds.api.ts
src/features/workbench/agent.api.ts
```

要求：

- 统一处理错误；
- 统一处理鉴权；
- 统一处理 JSON parse；
- 统一做 Zod response 校验；
- 不在页面组件里裸写 `fetch("/api/...")`。

### 7.3 Agent 与普通 API 分离

普通 API：

- 获取世界；
- 保存设定；
- 发布；
- Star / Fork；
- 获取用户信息。

Agent API：

- 开始推演；
- 停止推演；
- 流式返回 AgentEvent；
- 记录上下文引用；
- 返回 token usage。

两类 API 不混在同一个 client 中。

## 8. 不采用的方案

### 8.1 不采用纯 Vite SPA 作为主框架

原因：

- 公开世界仓库页需要 SEO；
- 社区浏览和公开分享需要服务端渲染能力；
- 后续鉴权、API、OG image、metadata 会更适合 Next.js；
- Vite SPA 更适合作为纯后台或原型，不适合作为界坞完整 Web 产品主框架。

### 8.2 不采用重型 UI 框架

不采用：

- Ant Design；
- Material UI；
- Bootstrap。

原因：

- 视觉气质过强，容易变成通用后台；
- 工作台密度、仓库心智、文学气质都需要定制；
- 与现有原型风格不匹配。

### 8.3 不采用 Redux 作为默认状态管理

原因：

- 界坞大部分复杂远程数据应交给 TanStack Query；
- 本地 UI 状态用 Zustand 足够；
- Redux 的模板与约束对当前阶段偏重。

### 8.4 不在 P0 引入富文本编辑器

原因：

- 会显著增加编辑模型、复制粘贴、schema、协作和测试复杂度；
- 当前核心风险在 Agent 推演和沉淀流程，不在富文本能力；
- P0 用 textarea + Markdown preview 更稳。

## 9. 版本与依赖策略

### 9.1 包管理器

推荐使用 `pnpm`。

原因：

- 安装快；
- lockfile 稳定；
- monorepo 友好；
- 适合后续拆 `packages/ui`、`packages/domain`。

### 9.2 版本策略

- 使用当前稳定主线；
- 不追 alpha / beta；
- 框架升级单独开任务；
- 依赖升级需要跑完整测试；
- `package.json` 使用明确 semver range，最终以 lockfile 为准。

建议初始化后锁定：

```txt
Node.js LTS
pnpm
Next.js stable
React stable
TypeScript stable
Tailwind CSS v4
TanStack Query v5
Zod v4
```

## 10. 性能与可访问性要求

### 10.1 性能

重点关注：

- 工作台长对话性能；
- Agent 流式渲染频率；
- 大量档案卡片；
- 公开世界页首屏；
- 移动端布局；
- 抽屉和弹层动画。

要求：

- Agent delta 合并节流渲染；
- 长列表后续使用虚拟滚动；
- 公开页图片走 Next Image；
- 大型组件按路由或交互懒加载；
- 避免把全局 store 更新绑定到每个 token delta。

### 10.2 可访问性

要求：

- 所有 icon-only button 必须有 accessible name；
- Dialog / Drawer / Popover 使用 Radix primitives；
- 支持键盘关闭弹层；
- focus ring 不移除；
- 表单错误有文本提示；
- 颜色不能作为唯一状态提示。

## 11. P0 实施顺序

### 11.1 第一阶段：工程骨架

- 初始化 Next.js + TypeScript + Tailwind；
- 建立 `tokens.css`；
- 建立 App Shell、StatusBar、Rail；
- 建立基础 UI 组件；
- 建立路由分组。

### 11.2 第二阶段：核心工作台

- 实现世界列表；
- 实现创建世界；
- 实现 Workbench；
- 实现 Agent streaming mock；
- 实现内联建议、待处理抽屉；
- 实现保存设定 / 种子 / 冲突的前端状态。

### 11.3 第三阶段：数据接入

- 引入 TanStack Query；
- 定义 API client；
- 定义 Zod schema；
- 接入真实世界列表和详情；
- 接入保存、发布、Star、Fork。

### 11.4 第四阶段：Agent 接入

- 定义 AgentEvent；
- 接入 AI SDK streaming；
- 支持 tool calls；
- 支持 stop run；
- 支持 token usage；
- 支持上下文引用；
- 校验 structured suggestions。

### 11.5 第五阶段：质量门槛

- Vitest 覆盖 schema 和纯函数；
- Playwright 覆盖核心用户路径；
- 移动端布局修正；
- 可访问性检查；
- 首屏与工作台性能检查。

## 12. 官方参考

- Next.js App Router：https://nextjs.org/docs/app
- React：https://react.dev/
- Tailwind CSS：https://tailwindcss.com/docs
- Radix UI Primitives：https://www.radix-ui.com/primitives/docs/overview/introduction
- Zustand：https://zustand.docs.pmnd.rs/
- TanStack Query：https://tanstack.com/query/latest/docs/framework/react/overview
- Vercel AI SDK：https://ai-sdk.dev/docs
- Zod：https://zod.dev/
- Vitest：https://vitest.dev/guide/
- Playwright：https://playwright.dev/docs/intro
