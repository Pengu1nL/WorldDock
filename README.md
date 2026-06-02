# WorldDock

WorldDock 是面向个人世界观创作者的云端世界资产工作台。当前仓库承载 WorldDock Cloud Alpha：把角色、地点、组织、事件、规则、故事种子、冲突和发布快照沉淀为结构化资产，并通过可解释的 Agent 推演、公开仓库、Fork、Star、反馈和导入导出形成最小闭环。

Alpha 阶段以云端工作流为主，不把本地部署、真实支付、邮件投递、管理后台和模板库包装成当前可用能力。

## 功能范围

- 云端世界创建、编辑、删除、复制、导入导出。
- 世界资产管理：设定档案、故事种子、冲突池、一致性提醒和资产关系。
- pi-backed Agent Run：SSE 流式事件、上下文引用、工具调用、建议保存和丢弃。
- 公开世界仓库：发布快照、仓库详情、Explore 搜索、Star、Fork、Fork 同步和创作者主页。
- Alpha 账本：创作点余额、price book、用量流水、低余额拦截和支付占位。
- 治理与运维：举报、审核 runbook、通知、反馈入口、对象存储、搜索投影、队列、Sentry / OpenTelemetry 基线。
- 开发者入口：Personal Access Token、世界包 JSON、仓库 pull 和 `worlddock` CLI。

## 技术栈

- Web：Next.js App Router、React、TypeScript、Tailwind CSS v4、Radix UI、lucide-react、TanStack Query、Zustand、Vitest、Playwright。
- API：NestJS、Fastify Adapter、TypeScript、Better Auth、Prisma、Zod、Vercel AI SDK / pi-agent-core、SSE。
- 数据与基础设施：PostgreSQL、Redis、BullMQ、Meilisearch、S3-compatible Object Storage、pino、Sentry、OpenTelemetry。
- 工作区：pnpm monorepo，前后端和 Worker 共享 `packages/domain` 的 Zod schema 与类型契约。

## 目录结构

```txt
apps/
  web/        Next.js Web 应用，包含营销页、登录注册、工作台、公开社区和 E2E
  api/        NestJS API 服务，统一挂载在 /v1
  worker/     BullMQ Worker，负责搜索索引、审核扫描和运维任务

packages/
  config/     环境变量解析、运行配置和常量
  db/         Prisma schema、migration、seed 和 Prisma client
  domain/     共享领域 schema、API 契约、Agent 事件和世界包格式
  logger/     日志适配
  worlddock-cli/  Alpha API 命令行工具

docs/
  product/    产品范围、API、权限、定价、数据和 IP 策略
  operations/ 运维 runbook、发布检查、备份恢复和队列告警
```

`legacy-prototype/` 只保留迁移前的静态原型，正式入口已经迁到 `apps/web`。

## 本地启动

准备 Node.js、Docker 和 pnpm。仓库声明的包管理器版本是 `pnpm@10.33.0`。

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres redis meilisearch storage
pnpm --filter @worlddock/db prisma:generate
pnpm --filter @worlddock/db prisma:migrate:deploy
```

如需一次性灌入演示世界数据，只在可丢弃的本地数据库执行：

```bash
ALLOW_DEMO_SEED=true pnpm --filter @worlddock/db seed
```

分别启动 API 和 Web：

```bash
pnpm --filter @worlddock/api dev
pnpm --filter @worlddock/web dev
```

默认地址：

- Web：`http://localhost:3000`
- API：`http://localhost:4000/v1`
- Meilisearch：`http://localhost:7700`
- MinIO API：`http://localhost:9000`
- MinIO Console：`http://localhost:9001`

根目录 `pnpm dev` 目前只启动 Web。完整本地联调需要另开终端启动 API；需要搜索队列或审核队列时，再构建并启动 Worker。

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

Worker 命令：

```bash
pnpm --filter @worlddock/worker exec tsx src/main.ts work-search
pnpm --filter @worlddock/worker exec tsx src/main.ts work-moderation
pnpm --filter @worlddock/worker exec tsx src/main.ts enqueue-search
pnpm --filter @worlddock/worker exec tsx src/main.ts enqueue-moderation
pnpm --filter @worlddock/worker exec tsx src/main.ts rebuild-search
```

## 环境变量

以 `.env.example` 为准。核心本地变量包括：

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`
- `DATABASE_URL=postgresql://worlddock:worlddock@localhost:5432/worlddock`
- `REDIS_URL=redis://localhost:6379`
- `MEILISEARCH_HOST=http://localhost:7700`
- `S3_ENDPOINT=http://localhost:9000`
- `BETTER_AUTH_SECRET` 至少 32 位
- `AI_PROVIDER=openai | pi | vercel-ai`

生产环境必须使用 `WORLD_DOCK_EDITION=cloud`，并配置 Sentry；`AI_PROVIDER=mock` 不允许用于生产。

## CLI

Alpha CLI 输出 JSON，适合导出 `.worlddock.json` 文件或接入脚本。当前源码仓库先以 `packages/worlddock-cli` 的测试和构建验证 CLI contract；发布或链接成 `worlddock` 命令后，命令形态如下：

```bash
WORLD_DOCK_API_URL=http://localhost:4000 \
WORLD_DOCK_TOKEN=wdl_... \
worlddock worlds list

worlddock worlds export world_123
worlddock worlds import ./memory-market.worlddock.json
worlddock repositories pull owner/slug
```

本仓库内验证 CLI：

```bash
pnpm --filter @worlddock-cli test
pnpm --filter @worlddock-cli build
```

Personal Access Token 范围见 `docs/product/api.md`。

## 文档入口

- 产品定位：`docs/product/positioning.md`
- Cloud Alpha 范围：`docs/product/cloud-release-scope.md`
- Alpha API：`docs/product/api.md`
- 前端技术栈：`docs/frontend_tech_stack.md`
- 后端技术栈：`docs/backend_tech_stack.md`
- 后端验收报告：`docs/backend_final_validation_report.md`
- 生产发布检查：`docs/operations/production_release_checklist.md`
- 事故处理：`docs/operations/incident_runbook.md`
- 队列运维：`docs/operations/queue_runbook.md`
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

本地真实依赖验收依赖 Docker 中的 PostgreSQL、Redis、Meilisearch 和 MinIO。生产环境还需要按 `docs/operations/production_release_checklist.md` 验证云端数据库、缓存、对象存储、搜索、Sentry、OpenTelemetry、备份和告警。
