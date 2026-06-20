# WorldDock

WorldDock 是面向个人世界观创作者的本地优先世界资产工作台。当前仓库把角色、地点、组织、事件、规则、故事种子、冲突和发布快照沉淀为结构化资产，并通过可解释的 Agent 推演、公开仓库、Fork、Star、反馈和导入导出形成最小闭环。

WorldDock is local-first.
No login is required.
AI calls run through the pi provider.
Telemetry is disabled by default.

Alpha 阶段不把真实支付、邮件投递、管理后台和模板库包装成当前可用能力。

## 功能范围

- 本地世界创建、编辑、删除、复制、导入导出。
- 世界资产管理：设定档案、故事种子、冲突池、一致性提醒和资产关系。
- pi-backed Agent Run：SSE 流式事件、上下文引用、工具调用、建议保存和丢弃。
- 公开世界仓库：发布快照、仓库详情、Explore 搜索、Star、Fork、Fork 同步和创作者主页。
- Alpha 账本：创作点余额、price book、用量流水、低余额拦截和支付占位。
- 治理与运维：举报、审核 runbook、通知、反馈入口、Sentry / OpenTelemetry 基线。
- 开发者入口：Personal Access Token、世界包 JSON、仓库 pull 和 `worlddock` CLI。

## 技术栈

- Web：Next.js App Router、React、TypeScript、Tailwind CSS v4、Radix UI、lucide-react、TanStack Query、Zustand、Vitest、Playwright。
- API：NestJS、Fastify Adapter、TypeScript、Prisma、Zod、Vercel AI SDK / pi-agent-core、SSE。
- 数据与基础设施：PostgreSQL、pino、Sentry、OpenTelemetry。
- 工作区：pnpm monorepo，前后端共享 `packages/domain` 的 Zod schema 与类型契约。

## 目录结构

```txt
apps/
  web/        Next.js Web 应用，包含营销页、本地工作台、公开社区和 E2E
  api/        NestJS API 服务，统一挂载在 /v1

packages/
  config/     环境变量解析、运行配置和常量
  db/         Prisma schema、migration、seed 和 Prisma client
  domain/     共享领域 schema、API 契约、Agent 事件和世界包格式
  logger/     日志适配
  worlddock-cli/  Alpha API 命令行工具

docs/
  product/    产品范围、API、权限、定价、数据和 IP 策略
  operations/ 运维 runbook、发布检查和备份恢复
```

`legacy-prototype/` 只保留迁移前的静态原型，正式入口已经迁到 `apps/web`。

## 本地启动

准备 Node.js、Docker 和 pnpm。仓库声明的包管理器版本是 `pnpm@10.33.0`。

首次启动必须先准备包管理器、依赖、环境变量、数据库和 Prisma Client：

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm --filter @worlddock/db prisma:generate
pnpm --filter @worlddock/db prisma:migrate:deploy
```

之后分别在两个终端启动 API 和 Web。终端一：

```bash
pnpm --filter @worlddock/api dev
```

终端二：

```bash
pnpm --filter @worlddock/web dev
```

如需一次性灌入演示世界数据，只在可丢弃的本地数据库执行：

```bash
ALLOW_DEMO_SEED=true pnpm --filter @worlddock/db seed
```

默认地址：

- Web：`http://localhost:3000`
- API：`http://localhost:4000/v1`

本地工作台无需登录；连接 WorldHub 的发布、拉取等可选能力需要 Personal Access Token。根目录 `pnpm dev` 目前只启动 Web。完整本地联调需要另开终端启动 API。

## 常用命令

```bash
pnpm dev                         # 启动 Web
pnpm --filter @worlddock/api dev # 启动 API
pnpm build                       # 构建所有 workspace
pnpm lint                        # 类型检查 / lint
pnpm test                        # 单元测试
pnpm verify                      # Prisma validate + lint + test + build
pnpm verify:ci                   # CI 级验证，包含 API integration 和 Web E2E
pnpm test:e2e                    # Web E2E
```

数据库命令：

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/db prisma:migrate:deploy
pnpm --filter @worlddock/db seed
```

## 环境变量

以 `.env.example` 为准。核心本地变量包括：

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`
- `DATABASE_URL=postgresql://worlddock:worlddock@localhost:5432/worlddock`
- `AI_PROVIDER=pi`

生产环境必须配置 Sentry，并提供 `PI_MODEL_PROVIDER`、`PI_MODEL_ID`、`PI_PROVIDER_API_KEY`。

## CLI

Alpha CLI 输出 JSON，适合导出 `.worlddock.json` 文件或接入脚本。发布包名为 `@worlddock/cli`，安装后提供 `worlddock` 命令：

```bash
npm install -g @worlddock/cli
WORLD_DOCK_API_URL=http://localhost:4000 worlddock worlds list

worlddock worlds export world_123
worlddock worlds import ./memory-market.worlddock.json
worlddock pull owner/slug
worlddock worlds pull owner slug
```

本仓库内验证 CLI：

```bash
pnpm --filter @worlddock/cli test
pnpm --filter @worlddock/cli build
pnpm --filter @worlddock/cli test:pack
```

连接 WorldHub 的 Personal Access Token 范围见当前 WorldHub API 文档。

## 文档入口

- 产品定位：`docs/product/positioning.md`
- Cloud Alpha 范围：`docs/product/cloud-release-scope.md`
- Alpha API：`docs/product/api.md`
- 前端技术栈：`docs/frontend_tech_stack.md`
- 后端技术栈：`docs/backend_tech_stack.md`
- 后端验收报告：`docs/backend_final_validation_report.md`
- 生产发布检查：`docs/operations/production_release_checklist.md`
- 事故处理：`docs/operations/incident_runbook.md`
- 数据备份恢复：`docs/operations/database_backup_restore.md`

## 验收状态

后端阶段验收报告记录了已通过的主命令：

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/web test:e2e
```

P3 本地运行只依赖 Docker 中的 PostgreSQL。生产环境检查保留为历史运维文档，不作为本地启动或验收前置条件。
