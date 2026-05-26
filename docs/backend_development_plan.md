# WorldDock 后端开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将界坞 WorldDock 从前端 Mock MVP 推进到可上线云端版本，完成生产级后端主干、真实数据持久化、Agent 流式推演、公开世界仓库、计费用量、搜索审核与运维基线。

**Architecture:** 采用模块化单体后端：Next.js 前端、NestJS API、BullMQ Worker、PostgreSQL 事实源、Redis 队列与缓存、Meilisearch 搜索投影、S3 兼容对象存储。前后端通过 `packages/domain` 共享 Zod schema 和 API 契约；Agent 只产生事件与建议，用户确认后才写入世界资产。

**Tech Stack:** Node.js、TypeScript、NestJS、Fastify Adapter、PostgreSQL、Prisma、Redis、BullMQ、Better Auth、Vercel AI SDK server-side、SSE、Meilisearch、S3-compatible Object Storage、Zod、Vitest、Supertest、Testcontainers、pino、Sentry、OpenTelemetry。

---

## 1. 开发流程约束

本计划是后端总计划，只定义 Phase、里程碑和验收边界。任何 Phase 进入实现前，都必须先撰写该 Phase 的具体计划文档，把本轮目标拆分为若干可执行 Task，再按 Task 推进。

每个 Phase 的开发流程：

1. 开发前撰写 Phase 计划文档，建议命名为 `docs/backend_phase_<n>_<slug>_plan.md`。
2. Phase 计划文档必须写清目标、范围、涉及文件、数据模型、API、前端接入点、测试命令和验收标准。
3. Phase 计划文档必须把实现拆成若干 Task，每个 Task 使用 checkbox 表示状态，并包含明确的测试或验证方式。
4. 开发过程中按 Task 执行，不跳过未完成 checkbox；如果范围变化，先更新 Phase 计划文档，再继续实现。
5. 开发过程中不允许为 Phase 新建分支；必须在当前工作区和当前分支上连续推进，除非用户明确要求切换策略。
6. 每个 Phase 开发结束后，必须检查该 Phase 计划文档中的所有 checkbox 和对应任务完成情况。
7. 每个 Phase 收尾时必须记录实际验收结果，包括通过的命令、未完成项、风险和后续补救安排。
8. 每个 Phase 结束后必须提交一次 commit，提交内容应只包含该 Phase 的计划、实现、测试和文档变更。
9. Phase commit 前必须检查 `git config user.name` 和 `git config user.email`；如包含真实姓名或个人邮箱，应先改为不会暴露个人身份的提交信息。
10. Phase commit 后必须用 `git log --format=fuller -1` 复核 Author 和 Committer，再把该 Phase 视为完成。
11. 所有 Phase 开发结束后，必须回到本文档检查全部 Milestone，逐项验证是否达成。

Phase 完成定义：

- Phase 计划文档存在；
- Phase 计划文档中的 Task checkbox 已复核；
- 对应实现、测试、文档和前端接入已经完成或明确记录为延期；
- 该 Phase 的验收标准有实际验证证据；
- Phase 变更已经在当前分支提交，且提交身份已经复核；
- 本文档中的相关 Milestone 状态可被追溯到具体 Phase 结果。

最终完成定义：

- Phase 1 到 Phase 12 均完成 Phase 级复核；
- 所有 Milestone 均已验证；
- 未达成的 Milestone 必须有明确原因、影响范围和补救计划；
- 后端总体验收命令、前端关键 E2E、生产 readiness 和运维 checklist 均有记录。

## 2. 当前结论

前端原型已经完成“可演示、可验收、可继续接后端”的高保真 Mock MVP，覆盖：

- 创作闭环：创建世界、Agent Mock 流式输出、保存设定、保存故事种子、查看一致性提醒；
- 社区闭环：Explore、公开世界仓库、Overview、Archive、Seeds、Conflicts、Releases、Star、Fork、举报；
- 发布闭环：公开范围、不会公开内容、实体级 diff、更新说明、授权方式、发布后状态；
- Local / Cloud 表达：余额、本次消耗、模型连接、社区 Access Token、Local Push 边界；
- 工程基线：TypeScript、Zod、Vitest、Playwright、静态导出验证。

后端技术栈已经在 `docs/backend_tech_stack.md` 中定稿：

```txt
Node.js + TypeScript
NestJS + Fastify Adapter
PostgreSQL + Prisma
Redis + BullMQ
Better Auth
Vercel AI SDK server-side + SSE
Meilisearch
S3-compatible Object Storage
Zod shared domain package
pino + Sentry + OpenTelemetry
```

本计划的核心目标是把前端 Mock 状态逐段替换为真实服务，同时保留当前产品体验和领域边界。

## 3. 开发目标

后端完成后应满足：

- 用户可以注册、登录、退出，并拥有稳定 session；
- 用户可以创建、查看、更新、归档自己的世界；
- 用户可以保存 Agent 建议为设定、故事种子或冲突；
- Agent Run 可以通过 SSE 流式返回 WorldDock 自定义事件；
- 每次 Agent Run 有可审计记录、上下文引用、建议、token usage 和费用流水；
- 用户可以发布世界到公开仓库，并生成不可变 Release Snapshot；
- 公开仓库支持搜索、Star、Fork、举报和审核状态；
- Local 客户端可以使用受限 Access Token Push 公开快照；
- Cloud 计费以内部 usage ledger 为准，可支持余额不足拦截和后续支付接入；
- 搜索索引、审核扫描、发布快照、用量结算等副作用由 Worker 异步处理；
- API、Worker、数据库、搜索、对象存储和日志监控具备生产上线基线。

## 4. 范围边界

### 4.1 本轮必须完成

- Monorepo 结构与共享领域契约；
- NestJS API 与 BullMQ Worker 工程骨架；
- PostgreSQL + Prisma schema、migration、seed；
- Better Auth 登录、session、用户模型和 Local Access Token；
- 世界资产 CRUD；
- Agent Run、SSE、AgentEvent、suggestion 保存链路；
- Publish、Release Snapshot、Repository、Star、Fork；
- Usage Ledger 基础计费流水与余额拦截；
- Meilisearch 搜索投影；
- 举报、审核状态和基础管理员操作；
- S3 兼容对象存储适配；
- 前端从 Mock 切换到真实 API 的最小生产路径；
- 单元测试、集成测试、E2E 与生产健康检查。

### 4.2 本轮不做

- 多人实时协作编辑；
- 复杂团队空间与组织权限；
- 完整管理员数据分析后台；
- 多支付渠道和复杂订阅套餐；
- 公开 OpenAPI SDK 发布；
- 移动端或桌面端客户端；
- 微服务拆分；
- 完整向量记忆系统和高级 RAG 编排。

这些能力可以在后端主干稳定后增量接入，不影响本轮架构选择。

## 5. 目标工程结构

当前仓库是前端单应用结构。后端开发第一阶段应尽早改造成 pnpm workspace，避免后期再迁移。

目标结构：

```txt
apps/
  web/
    src/
      app/
      features/
      styles/
    tests/
    public/
    package.json
    next.config.ts
    playwright.config.ts

  api/
    src/
      main.ts
      app.module.ts
      modules/
      common/
      config/
    test/
    package.json

  worker/
    src/
      main.ts
      queues/
      processors/
      jobs/
    test/
    package.json

packages/
  domain/
    src/
      world/
      archive/
      seed/
      conflict/
      repository/
      agent/
      billing/
      moderation/
      auth/
      api/
    package.json

  db/
    prisma/
      schema.prisma
      migrations/
      seed.ts
    src/
      prisma-client.ts
      repositories/
      mappers/
    package.json

  config/
    src/
      env.ts
      constants.ts
    package.json

  logger/
    src/
      logger.ts
      tracing.ts
    package.json

docs/
  backend_tech_stack.md
  backend_development_plan.md
```

责任边界：

- `apps/web`：前端应用，不直接访问数据库；
- `apps/api`：HTTP API、认证、权限、业务编排；
- `apps/worker`：异步副作用、搜索投影、审核扫描、发布快照、用量结算；
- `packages/domain`：Zod schema、共享类型、API 契约、AgentEvent；
- `packages/db`：Prisma schema、migration、repository、mapper；
- `packages/config`：环境变量校验和跨应用配置；
- `packages/logger`：结构化日志、request id、trace 适配。

## 6. 数据模型基线

首批数据库表按业务主干分组。

认证与用户：

```txt
users
accounts
sessions
access_tokens
```

世界资产：

```txt
worlds
archive_entries
story_seeds
conflicts
consistency_issues
```

Agent：

```txt
agent_runs
agent_events
agent_suggestions
context_refs
```

公开社区：

```txt
repositories
releases
release_snapshots
stars
forks
```

计费与审核：

```txt
billing_accounts
usage_ledger
reports
moderation_actions
```

异步投影：

```txt
outbox_events
```

关键规则：

- `worlds` 是用户工作态资产；
- `repositories` 是公开仓库身份；
- `releases` 是发布记录；
- `release_snapshots` 是不可变公开快照；
- `agent_events` 保存可审计事件；
- `agent_suggestions` 保存待用户确认的结构化建议；
- `usage_ledger` 使用 append-only 记录；
- `outbox_events` 负责驱动搜索、审核、通知、快照生成等副作用。

## 7. API 基线

P0 API 使用 REST + SSE。

认证与用户：

```txt
GET    /v1/me
POST   /v1/auth/logout
GET    /v1/access-tokens
POST   /v1/access-tokens
DELETE /v1/access-tokens/:tokenId
```

世界资产：

```txt
GET    /v1/worlds
POST   /v1/worlds
GET    /v1/worlds/:worldId
PATCH  /v1/worlds/:worldId
DELETE /v1/worlds/:worldId

GET    /v1/worlds/:worldId/archive
POST   /v1/worlds/:worldId/archive
PATCH  /v1/archive/:entryId

GET    /v1/worlds/:worldId/seeds
POST   /v1/worlds/:worldId/seeds
PATCH  /v1/seeds/:seedId

GET    /v1/worlds/:worldId/conflicts
POST   /v1/worlds/:worldId/conflicts
PATCH  /v1/conflicts/:conflictId
```

Agent：

```txt
POST   /v1/worlds/:worldId/agent-runs
GET    /v1/agent-runs/:runId/events
POST   /v1/agent-runs/:runId/cancel
POST   /v1/agent-suggestions/:suggestionId/save
POST   /v1/agent-suggestions/:suggestionId/discard
```

公开社区：

```txt
GET    /v1/repositories
GET    /v1/repositories/:owner/:slug
POST   /v1/worlds/:worldId/publish
GET    /v1/repositories/:repositoryId/releases
POST   /v1/repositories/:repositoryId/star
DELETE /v1/repositories/:repositoryId/star
POST   /v1/repositories/:repositoryId/fork
POST   /v1/repositories/:repositoryId/reports
```

计费与系统：

```txt
GET    /v1/billing/balance
GET    /v1/billing/usage
GET    /v1/system/health
GET    /v1/system/readiness
```

错误结构：

```ts
type ApiError = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
};
```

## 8. 分阶段开发计划

### Phase 1: Monorepo 与共享领域契约

目标：把当前前端单应用迁移成可承载 Web、API、Worker 和共享包的工程结构。

任务：

- [x] 新增 `pnpm-workspace.yaml`，声明 `apps/*` 和 `packages/*`。
- [x] 新增根级 `tsconfig.base.json`，统一 strict TypeScript 配置。
- [x] 将当前 Next.js 前端迁移到 `apps/web`，保留现有页面、样式、测试和脚本行为。
- [x] 调整根级 `package.json` scripts，支持 `pnpm --filter @worlddock/web dev`、`build`、`test`、`lint`。
- [x] 新增 `packages/domain`，从 `src/features/worlddock/domain.ts` 迁移 world、suggestion、repository、release、error schema。
- [x] 新增 `packages/config`，提供 env schema 与运行环境枚举。
- [x] 新增 `packages/logger`，提供 pino logger、request id helper 和 redaction 规则。
- [x] 更新前端 import，让前端从 `@worlddock/domain` 读取共享类型。
- [x] 保留现有前端 E2E 测试路径，确保迁移后行为不变。

验收标准：

- `pnpm install` 成功；
- `pnpm --filter @worlddock/web lint` 通过；
- `pnpm --filter @worlddock/web test` 通过；
- `pnpm --filter @worlddock/web build` 通过；
- `pnpm --filter @worlddock/web test:e2e` 通过；
- 前端核心路径仍可运行，页面内容和当前 Mock 行为不回退。

### Phase 2: API 与数据库骨架

目标：建立 NestJS API、Prisma、PostgreSQL、本地开发容器和基础健康检查。

任务：

- [ ] 新增 `apps/api`，使用 NestJS + Fastify Adapter。
- [ ] 新增 `packages/db`，配置 Prisma、PostgreSQL provider、Prisma Client 导出。
- [ ] 新增 `docker-compose.yml`，提供本地 PostgreSQL、Redis、Meilisearch、S3 兼容服务。
- [ ] 新增 `.env.example`，列出 API、数据库、Redis、搜索、对象存储、Auth、模型供应商配置。
- [ ] 实现 `GET /v1/system/health`，返回进程健康状态。
- [ ] 实现 `GET /v1/system/readiness`，检查数据库和 Redis 连接。
- [ ] 建立 API 全局错误过滤器，将异常转换为统一 `ApiError`。
- [ ] 建立 request id middleware / interceptor。
- [ ] 建立 Zod validation pipe，统一校验 request body、params、query。
- [ ] 增加 API 单元测试和 Supertest 集成测试。

验收标准：

- `pnpm --filter @worlddock/api test` 通过；
- `pnpm --filter @worlddock/api build` 通过；
- `docker compose up -d postgres redis meilisearch storage` 后 readiness 返回可用；
- 错误响应始终包含 `code`、`message`、`requestId`。

### Phase 3: 认证、用户与 Access Token

目标：完成云端用户身份和 Local Push 所需的受限 token 能力。

任务：

- [ ] 接入 Better Auth，使用 PostgreSQL 持久化用户、账号和 session。
- [ ] 实现 `GET /v1/me`，返回当前用户基础资料。
- [ ] 实现 API auth guard，区分匿名、登录用户、管理员、Access Token subject。
- [ ] 实现 Local Access Token 创建、列表、撤销。
- [ ] 为 Access Token 增加 scope：`world:read`、`world:write`、`repository:push`。
- [ ] 存储 token hash，不保存明文 token。
- [ ] 增加 token 最后使用时间、过期时间和撤销时间。
- [ ] 前端设置页接入真实 token 创建和撤销接口。
- [ ] 增加认证集成测试：未登录、已登录、token scope 不足、token 撤销。

验收标准：

- Web 登录后可以调用 `/v1/me`；
- 未登录访问私有 API 返回 `AUTH_REQUIRED`；
- scope 不足返回 `PERMISSION_DENIED`；
- 撤销后的 token 不能继续使用；
- 设置页能展示真实 token 状态。

### Phase 4: 世界资产与前端 Mock 替换

目标：让“我的世界、世界详情、档案、故事种子、冲突池”使用真实数据库。

任务：

- [ ] 设计并迁移 `worlds` 表，包含 owner、name、type、summary、tags、status、visibility、mode、maturity。
- [ ] 设计并迁移 `archive_entries` 表，承载设定条目。
- [ ] 设计并迁移 `story_seeds` 表，承载故事种子。
- [ ] 设计并迁移 `conflicts` 表，承载世界冲突。
- [ ] 设计并迁移 `consistency_issues` 表，承载一致性提醒。
- [ ] 实现 world repository 和 domain mapper。
- [ ] 实现 world CRUD API。
- [ ] 实现 archive / seed / conflict 列表和创建 API。
- [ ] 实现 owner 权限检查，私有世界仅 owner 可读写。
- [ ] 建立 seed 数据，覆盖当前前端 Mock 中的示例世界。
- [ ] 前端 `view-worlds`、`view-archive`、工作台资产计数接入真实 API。
- [ ] 用 TanStack Query 管理 worlds、archive、seeds、conflicts server state。

验收标准：

- 登录用户可以创建世界；
- 创建后世界出现在“我的世界”；
- 保存设定后档案页可见；
- 保存故事种子后故事种子池可见；
- 保存冲突后冲突池可见；
- 其他用户无法访问私有世界；
- 前端创作和档案 E2E 从真实 API 通过。

### Phase 5: Agent Run、SSE 与建议沉淀

目标：把 Mock Agent 流替换成真实 Agent Run 协议，同时保持“用户确认后才写入资产”的产品原则。

任务：

- [ ] 在 `packages/domain` 定义 `AgentEvent`、`AgentRun`、`AgentSuggestion`、`ContextRef`、`TokenUsage` schema。
- [ ] 设计并迁移 `agent_runs`、`agent_events`、`agent_suggestions`、`context_refs` 表。
- [ ] 实现 `POST /v1/worlds/:worldId/agent-runs`，创建 run 并返回 run id。
- [ ] 实现 `GET /v1/agent-runs/:runId/events`，以 SSE 输出 WorldDock AgentEvent。
- [ ] 接入 server-side Vercel AI SDK，先支持一个默认模型供应商。
- [ ] 将模型文本流转换为 `message.delta` 事件。
- [ ] 将结构化输出转换为 `suggestion.created` 事件，并通过 Zod 校验。
- [ ] 将上下文引用转换为 `context.used` 事件。
- [ ] 实现 `POST /v1/agent-runs/:runId/cancel`。
- [ ] 实现 suggestion save / discard API。
- [ ] suggestion save 根据 kind 写入 archive / seed / conflict。
- [ ] 记录 run completed、failed、cancelled 状态。
- [ ] 前端工作台接入真实 SSE，保留停止、错误、余额不足、模型不可用反馈。

验收标准：

- Agent 输出通过 SSE 渐进显示；
- Agent 事件可在数据库中回放；
- suggestion 未保存前不会进入世界资产；
- 保存 suggestion 后资产数量变化；
- 取消 run 后前端停止接收增量事件；
- 模型失败返回 `MODEL_UNAVAILABLE` 或明确错误；
- Agent E2E 覆盖成功、取消、失败和保存建议。

### Phase 6: Usage Ledger 与余额拦截

目标：建立 Cloud 用量事实源，支持 Agent Run 余额预检查、结算和退款。

任务：

- [ ] 设计并迁移 `billing_accounts` 和 `usage_ledger` 表。
- [ ] 定义 ledger entry 类型：`credit_granted`、`model_run_reserved`、`model_run_settled`、`model_run_refunded`、`admin_adjusted`。
- [ ] 实现余额聚合查询。
- [ ] 在新用户创建时发放初始免费额度。
- [ ] 在 Agent Run 启动前执行余额预检查。
- [ ] Agent Run 启动时写入 reserve ledger。
- [ ] Agent Run 完成时按真实 token usage 写入 settle ledger。
- [ ] Agent Run 失败或取消时写入 refund 或 partial settle ledger。
- [ ] 实现 `GET /v1/billing/balance` 和 `GET /v1/billing/usage`。
- [ ] 前端设置页接入真实余额和最近一次 Agent Run 用量。

验收标准：

- 余额不足时不能启动 Agent Run；
- run 成功后 ledger 可追踪 reserve 和 settle；
- run 失败后 ledger 可追踪 refund；
- 余额接口与 ledger 聚合一致；
- 前端余额不足路径 E2E 通过。

### Phase 7: 发布、Release Snapshot 与公开仓库

目标：把发布 / Push 从 Mock 状态变成真实公开仓库系统。

任务：

- [ ] 设计并迁移 `repositories`、`releases`、`release_snapshots` 表。
- [ ] 实现 world 到 public repository 的首次发布。
- [ ] 实现后续发布生成新 release。
- [ ] 实现发布隐私过滤，排除原始私密对话、模型配置、API Key、未选择公开资产。
- [ ] 实现实体级 diff：新增设定、修改设定、移除设定、新增故事种子。
- [ ] 将 release snapshot 保存为数据库 JSONB，并支持大附件写入 S3。
- [ ] 实现 `GET /v1/repositories/:owner/:slug`。
- [ ] 实现 `GET /v1/repositories/:repositoryId/releases`。
- [ ] 前端发布页接入真实 diff、授权、更新说明和发布结果。
- [ ] 公开仓库详情页接入真实 repository 和 release 数据。

验收标准：

- 私有世界可以发布为公开仓库；
- 发布后生成 release 和 immutable snapshot；
- 公开页只能读取 snapshot 中的公开内容；
- 发布前后 diff 与保存资产一致；
- 发布页 E2E 从真实 API 通过。

### Phase 8: Star、Fork、Local Push 与社区闭环

目标：完成公开世界社区的核心互动和 Local 客户端上传边界。

任务：

- [ ] 设计并迁移 `stars` 和 `forks` 表。
- [ ] 实现 Star / Unstar API，使用唯一约束保证幂等。
- [ ] 实现 Fork API，从指定 repository release 生成私有 draft world。
- [ ] Fork 记录 source repository、source release、target world、license snapshot。
- [ ] 实现 Local Push API，要求 Access Token 具备 `repository:push` scope。
- [ ] Local Push 只接收明确上传的公开快照，不读取本地私有数据。
- [ ] 实现授权规则校验，禁止 Fork 的仓库不可 Fork。
- [ ] 前端社区页接入真实 Star、Fork、举报入口。
- [ ] 设置页 token 状态与 Local Push 禁用态接入真实 API。

验收标准：

- Star 数量可见且幂等；
- Fork 后生成私有 draft world；
- Fork 来源和授权快照可追踪；
- 无 token 或 scope 不足时 Local Push 被拒绝；
- 社区 E2E 从真实 API 通过。

### Phase 9: Meilisearch 搜索投影

目标：建立公开世界搜索体验，并保证搜索索引可重建、可下架、可最终一致。

任务：

- [ ] 新增 `outbox_events` 表和 outbox repository。
- [ ] 在 repository 发布、更新、Star、Fork、审核状态变化时写入 outbox。
- [ ] 新增 `apps/worker`，接入 BullMQ。
- [ ] 实现 `search-indexing` queue。
- [ ] 定义 Meilisearch `world_repositories` index。
- [ ] 实现 repository document mapper。
- [ ] 实现 upsert、delete、full rebuild 命令。
- [ ] API 搜索接口读取 Meilisearch，并对权限敏感结果回查 PostgreSQL。
- [ ] 前端 Explore 搜索接入真实搜索接口。

验收标准：

- 新发布仓库最终出现在搜索结果中；
- 下架仓库从搜索结果中消失；
- 全量重建索引后搜索结果可恢复；
- 搜索接口支持关键词、标签、排序；
- Explore E2E 从真实搜索通过。

### Phase 10: 审核、举报与管理员最小闭环

目标：让公开内容具备上线所需的基础治理能力。

任务：

- [ ] 设计并迁移 `reports` 和 `moderation_actions` 表。
- [ ] 实现 repository report API。
- [ ] 实现管理员列表举报接口。
- [ ] 实现管理员处理举报：保留、限制、下架。
- [ ] 审核状态变更写入 `moderation_actions`。
- [ ] 审核状态变更写入 outbox，触发搜索索引更新。
- [ ] 发布后触发 `moderation-scan` queue，先实现规则型审核扫描：敏感词、空内容、重复举报阈值。
- [ ] 前端公开仓库举报接入真实 API。
- [ ] 提供最小管理员接口或内部脚本处理举报。

验收标准：

- 用户可以举报公开仓库；
- 管理员可以下架公开仓库；
- 下架后公开页不可访问或显示受限状态；
- 下架后搜索结果移除；
- 审核操作有操作者、原因、时间和目标记录。

### Phase 11: 对象存储与导入导出

目标：完成 S3 兼容存储适配，为封面、快照附件和导入导出打基础。

任务：

- [ ] 新增 storage module，封装 S3-compatible client。
- [ ] 定义 `storage_objects` 或在业务表中保存 object metadata。
- [ ] 实现 signed upload URL。
- [ ] 实现 signed download URL。
- [ ] 为用户头像和世界封面接入对象存储。
- [ ] 为 release snapshot 大附件接入对象存储。
- [ ] 实现 storage cleanup worker，清理孤儿对象。
- [ ] 增加文件大小、mime type、owner、visibility 校验。

验收标准：

- 私有文件只能通过短期 signed URL 访问；
- 公开资源可以生成稳定公开 URL 或 CDN URL；
- 无权限用户不能访问私有对象；
- 删除业务记录后对象清理任务可追踪。

### Phase 12: 生产运维、安全与发布基线

目标：让后端达到可上线和可排障状态。

任务：

- [ ] 接入 pino 结构化日志和敏感字段 redaction。
- [ ] 接入 Sentry，覆盖 API 和 Worker。
- [ ] 接入 OpenTelemetry trace，串联 request id、run id、job id。
- [ ] 增加 API rate limit。
- [ ] 增加 request body size limit。
- [ ] 增加 CORS 和 trusted origin 配置。
- [ ] 增加 security headers。
- [ ] 增加数据库备份和恢复演练文档。
- [ ] 增加 migration 发布流程文档。
- [ ] 增加 worker 失败告警。
- [ ] 增加 health、readiness、metrics 基线。
- [ ] 增加 staging 环境部署配置。
- [ ] 编写生产发布 checklist。

验收标准：

- API 与 Worker 错误进入 Sentry；
- Agent Run 可通过 trace 串联模型调用、数据库写入、ledger 和 SSE；
- 生产环境不会记录 API Key、Access Token、模型密钥和私密正文；
- readiness 能准确反映数据库、Redis、搜索依赖；
- staging 可以完整跑通创作、Agent、发布、搜索、Fork、举报路径。

## 9. 前端接入顺序

前端不应等所有后端完成后一次性切换。推荐逐段替换 Mock：

1. 认证和 `/v1/me`。
2. 世界列表和世界详情。
3. 档案、故事种子、冲突池。
4. Agent Run SSE。
5. suggestion save / discard。
6. 余额和用量。
7. Publish 和 Release。
8. 公开仓库详情。
9. Star / Fork / Report。
10. Explore 搜索。
11. Local Access Token 和 Local Push。

前端状态边界：

- 服务端数据进入 TanStack Query；
- 工作台临时 UI 状态保留 Zustand；
- Mock fixtures 逐步退到测试 fixture；
- API client 统一放在 feature API 层；
- 页面组件不直接拼 fetch。

## 10. 测试与验收命令

根级质量门：

```bash
pnpm lint
pnpm test
pnpm build
```

前端质量门：

```bash
pnpm --filter @worlddock/web lint
pnpm --filter @worlddock/web test
pnpm --filter @worlddock/web build
pnpm --filter @worlddock/web test:e2e
```

API 质量门：

```bash
pnpm --filter @worlddock/api lint
pnpm --filter @worlddock/api test
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/api build
```

Worker 质量门：

```bash
pnpm --filter @worlddock/worker lint
pnpm --filter @worlddock/worker test
pnpm --filter @worlddock/worker build
```

数据库质量门：

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/db prisma:migrate:deploy
pnpm --filter @worlddock/db seed
```

端到端验收：

```bash
docker compose up -d postgres redis meilisearch storage
pnpm test:e2e
```

每个后端阶段的最低验收：

- schema 有单元测试；
- service 有单元测试；
- repository 有集成测试；
- API 有 Supertest 测试；
- 前端对应路径有 Playwright E2E；
- 失败路径和权限路径有覆盖。

## 11. 里程碑

### Milestone A: 后端骨架可运行

包含 Phase 1-2。

交付结果：

- Monorepo 完成；
- Web 原型迁移后行为不变；
- API 服务可启动；
- 数据库和 Redis readiness 可用；
- 基础错误和日志链路可用。

### Milestone B: 登录用户可以真实创建世界

包含 Phase 3-4。

交付结果：

- 用户可以登录；
- 世界、档案、种子、冲突使用真实数据库；
- 前端主要创作资产路径脱离 Mock。

### Milestone C: Agent 真实流式推演

包含 Phase 5-6。

交付结果：

- 工作台接入真实 SSE；
- AgentEvent 可审计；
- suggestion 保存真实写入资产；
- 用量 ledger 和余额拦截可用。

### Milestone D: 公开社区主链路上线

包含 Phase 7-9。

交付结果：

- Publish 生成公开仓库和 Release Snapshot；
- Star、Fork、Local Push 可用；
- Explore 使用 Meilisearch；
- 搜索投影由 Worker 维护。

### Milestone E: 生产上线基线

包含 Phase 10-12。

交付结果：

- 举报和审核闭环可用；
- S3 存储接入；
- API、Worker、Agent Run 可观测；
- staging 全链路验收通过；
- 具备上线 checklist。

## 12. 风险与控制

### 12.1 Monorepo 迁移影响前端稳定

控制方式：

- Phase 1 只做结构迁移和共享 schema，不改产品行为；
- 每次移动文件后运行现有前端测试；
- 迁移完成前不开始后端业务实现。

### 12.2 Prisma 抽象遮蔽 PostgreSQL 能力

控制方式：

- 常规 CRUD 使用 Prisma Client；
- 复杂索引、JSONB、全文搜索、pgvector、批量同步使用 SQL migration 和 queryRaw；
- 对外 API 类型来自 `packages/domain`，不直接暴露 Prisma model。

### 12.3 Agent 输出污染世界资产

控制方式：

- Agent 只写 `agent_events` 和 `agent_suggestions`；
- 用户点击保存后才写入 `archive_entries`、`story_seeds`、`conflicts`；
- suggestion save API 具备幂等保护。

### 12.4 搜索索引与事实源不一致

控制方式：

- PostgreSQL 是唯一事实源；
- 搜索写入通过 outbox + BullMQ；
- 提供全量重建索引命令；
- 权限敏感结果回查 PostgreSQL。

### 12.5 计费状态不一致

控制方式：

- 使用 append-only usage ledger；
- reserve、settle、refund 都是独立流水；
- 余额展示由 ledger 聚合；
- Agent Run 与 ledger 写入使用事务或可补偿任务。

### 12.6 发布隐私泄漏

控制方式：

- Release Snapshot 只从白名单资产生成；
- 发布前后都有隐私过滤测试；
- API Key、模型配置、原始私密对话不进入 snapshot；
- Local Push 只接收客户端显式上传的公开快照。

## 13. 开发节奏建议

推荐按里程碑推进，每个 Phase 完成后再进入下一阶段。

单个 Phase 的标准工作流：

1. 先写 domain schema 和测试。
2. 再写数据库 migration 和 repository 测试。
3. 再写 service 单元测试。
4. 再写 API 集成测试。
5. 实现最小业务代码。
6. 接入前端对应路径。
7. 补齐 E2E。
8. 更新文档和验收记录。

每个 Phase 完成定义：

- 所有新增接口有 schema；
- 所有关键写操作有权限检查；
- 所有关键状态变更有测试；
- 前端对应路径不再依赖 Mock；
- 错误态在 UI 中可见；
- 验收命令通过；
- 文档反映真实行为。
