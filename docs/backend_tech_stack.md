# 界坞 WorldDock 后端技术栈文档

文档版本：v0.1
更新日期：2026-05-26
适用阶段：云端生产版 / 后端 MVP 到生产化
关联文档：`docs/frontend_tech_stack.md`、`docs/frontend_design_requirements.md`、`docs/jiewu_worlddock_prd.pdf`

## 1. 文档目标

本文档用于确定界坞 WorldDock 云端版本的生产级后端技术栈、工程边界与关键取舍。

后端阶段的目标不是搭一个临时 Demo API，而是从一开始建立可以长期演进的云端主干，重点支撑：

- 用户、会话、OAuth 与 Access Token；
- 世界、档案、故事种子、冲突池、一致性问题等长期资产；
- Agent 流式推演、工具调用、上下文引用与建议沉淀；
- 类 GitHub 的公开世界仓库、Star、Fork、Release 与发布快照；
- Cloud 用量、余额、计费流水与模型调用成本控制；
- Local Push 到云端社区的权限与公开边界；
- 公开内容搜索、审核、举报、下架与管理员操作；
- 后续开放公开 API、本地客户端、导入导出与生态扩展。

核心约束：

界坞后端应按生产云端系统设计，避免先依赖临时 BaaS 或前端框架内置 API，导致后续在认证、权限、Agent 运行、计费、搜索和审核上做大规模技术迁移。

## 2. 总体结论

界坞云端生产版后端推荐采用：

```txt
Node.js
TypeScript
NestJS
Fastify Adapter
PostgreSQL
Prisma
Redis
BullMQ
Better Auth
Vercel AI SDK server-side
SSE / Event Stream
Meilisearch
S3-compatible Object Storage
Zod
pino
Sentry
OpenTelemetry
```

一句话判断：

界坞不是普通内容社区，也不是简单 AI Chat 应用，而是“世界资产系统 + Agent 协作系统 + 公开世界仓库”。后端技术栈必须优先服务稳定领域模型、可审计状态变更、可追踪 Agent 运行、可演进公开 API 与长期生产运维。

推荐架构形态：

```txt
apps/
  web/        Next.js 前端、SSR、公开页 SEO、轻量 BFF
  api/        NestJS API 服务，承载核心业务接口
  worker/     BullMQ Worker，承载异步任务和投影同步

packages/
  domain/     Zod schema、共享类型、AgentEvent 协议
  db/         Prisma schema、migration、seed、数据库工具
  config/     环境变量、运行配置、常量
  logger/     日志、trace、错误上报适配
```

关键边界：

- `PostgreSQL` 是唯一事实源。
- `Meilisearch` 是搜索投影，不保存业务事实。
- `Redis` 只用于队列、缓存、限流和短生命周期状态，不保存核心业务事实。
- `S3` 只保存文件、封面、附件、导入导出包和发布快照附件，业务索引仍在 PostgreSQL。
- `Agent` 只能产生事件和建议，不能直接修改世界资产。
- 用户确认保存后，建议才进入档案、故事种子或冲突池。
- 发布必须生成不可变 Release Snapshot。
- 计费以内部 append-only usage ledger 为准，支付平台只是结算入口。

## 3. 技术选型原则

### 3.1 生产云端优先

后端主干直接按线上云端版本设计，不采用只能支撑原型的临时架构。

要求：

- API 服务和 Worker 服务可独立部署；
- 数据库、缓存、对象存储、搜索服务使用生产级托管或可替换部署；
- 认证、计费、审核、发布和 Agent 运行都有审计记录；
- 不把关键业务逻辑绑死在 Next.js Route Handlers 或第三方 BaaS 规则里。

### 3.2 TypeScript 端到端契约优先

界坞前端已经使用 TypeScript 和 Zod 描述领域对象。后端继续选择 Node.js / TypeScript 的核心理由，是让前端那套 schema 能沉淀到 `packages/domain`，成为前后端共享的类型契约。

要求：

- API request / response 使用 Zod 校验；
- Agent event 使用 Zod 校验；
- Web、API、Worker 共享领域类型；
- 不把 Prisma model 类型直接暴露给前端；
- 对外 API 类型以 `packages/domain` 为准，而不是以数据库表结构为准。

### 3.3 模块化单体优先

不一开始拆微服务，但从第一天就按模块边界组织代码。

推荐模块：

```txt
auth
users
worlds
archive
seeds
conflicts
repositories
releases
stars
forks
agent-runs
billing
moderation
search
storage
access-tokens
admin
```

这样可以在早期保持开发速度，也能在后期把高负载模块独立拆出，而不推倒重来。

### 3.4 PostgreSQL 事实源优先

所有核心业务事实必须落在 PostgreSQL：

- 用户与权限；
- 世界资产；
- 发布状态；
- Release 快照元数据；
- Star / Fork 关系；
- Agent Run 与 Agent Event；
- usage ledger；
- 举报与审核记录；
- outbox events。

搜索、缓存、对象存储、模型服务都只是围绕 PostgreSQL 的基础设施，不应成为事实源。

### 3.5 Agent 可审计优先

Agent 运行不是一次普通文本请求，而是一组可追踪、可恢复、可计费、可审核的事件。

因此后端必须记录：

- run id；
- world id；
- user id；
- Agent 模式；
- 使用的上下文引用；
- tool call；
- message delta；
- suggestion；
- token usage；
- cost estimate；
- error；
- cancellation；
- completed state。

用户保存前，Agent 输出只能停留在 `suggestions` 或 `agent_events` 中，不能自动写入世界资产。

## 4. 核心技术栈

### 4.1 运行时：Node.js + TypeScript

选择：`Node.js` + `TypeScript strict mode`

使用理由：

- 与 Next.js 前端共享语言和工程生态；
- 可复用现有 Zod schema；
- 适合构建 HTTP API、SSE、Worker、Webhook 和队列任务；
- 与 Vercel AI SDK、Better Auth、Prisma、BullMQ 等工具链契合；
- 方便未来开放 TypeScript SDK。

要求：

- 所有后端包启用 `strict: true`；
- 禁止核心领域层使用宽泛 `any`；
- API 边界必须有运行时校验；
- Worker 与 API 共享 `packages/domain`，避免重复定义事件结构。

### 4.2 后端框架：NestJS + Fastify Adapter

选择：`NestJS` + `Fastify Adapter`

使用理由：

- NestJS 的 Module / Provider / Guard / Pipe / Interceptor 适合长期维护的业务后端；
- 认证、权限、队列、配置、日志、OpenAPI 和测试生态成熟；
- Fastify Adapter 在性能和插件生态上优于默认 Express 适配；
- 适合把 WorldDock 组织为清晰的领域模块，而不是一组散乱 route。

使用边界：

- Controller 只处理 HTTP 输入输出；
- Service 承载业务编排；
- Repository / DAO 承载数据库访问；
- Guard 处理认证和权限；
- Pipe 处理 Zod 或 DTO 校验；
- Interceptor 处理日志、trace、响应包装、错误映射；
- 不在 Controller 里直接写 Prisma 查询。

推荐模块结构：

```txt
apps/api/src/
  main.ts
  app.module.ts
  modules/
    auth/
    users/
    worlds/
    archive/
    seeds/
    conflicts/
    repositories/
    releases/
    agent-runs/
    billing/
    moderation/
    search/
    storage/
    admin/
  common/
    guards/
    pipes/
    interceptors/
    errors/
    pagination/
```

### 4.3 数据库：PostgreSQL

选择：`PostgreSQL`

使用理由：

- 适合承载关系数据、版本历史、权限关系、发布快照、审计日志；
- JSONB 可承载 Agent event payload、发布快照摘要、结构化元数据；
- 索引、事务、约束、锁和查询优化能力成熟；
- 后续可使用全文搜索、trigram、pgvector 等能力；
- 生态稳定，托管选择多。

首批核心表建议：

```txt
users
accounts
sessions
access_tokens

worlds
archive_entries
story_seeds
conflicts
consistency_issues

repositories
releases
release_snapshots
stars
forks

agent_runs
agent_events
agent_suggestions
context_refs

usage_ledger
billing_accounts

reports
moderation_actions

outbox_events
```

关键数据库原则：

- 重要状态变更使用事务；
- 金额、用量、发布、审核等记录使用 append-only ledger 或 audit log；
- 对外展示 slug 需要唯一约束；
- Star / Fork 等关系表需要幂等约束；
- Release Snapshot 一旦生成，不允许原地修改；
- 删除优先使用软删除或状态标记，避免破坏审计链路。

### 4.4 ORM 与 Migration：Prisma

选择：`Prisma`

使用理由：

- 类型提示好，团队协作成本低；
- 常规 CRUD 和关系查询效率高；
- migration、seed、schema review 体验成熟；
- 与 PostgreSQL、NestJS、测试环境配合稳定。

使用边界：

```txt
普通 CRUD / 关系查询：Prisma Client
复杂统计 / 批量同步 / 高级索引：SQL migration + queryRaw
全文搜索 / pgvector / 特殊索引：显式 SQL
对外 API 类型：packages/domain
内部数据库类型：Prisma model
```

明确不做：

- 不把 Prisma model 当 API response 类型直接返回；
- 不把数据库 schema 当唯一领域模型；
- 不为迎合 Prisma 放弃 PostgreSQL 约束、索引和事务能力；
- 不在业务代码里到处散落 `prisma.*` 调用。

推荐边界：

```txt
packages/db/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    prisma-client.ts
    repositories/
      world.repository.ts
      repository.repository.ts
      agent-run.repository.ts
      billing.repository.ts
```

### 4.5 领域契约：Zod + packages/domain

选择：`Zod`

使用理由：

- 前端原型已经使用 Zod 描述核心领域对象；
- Agent 输出、API 输入、导入文件、Webhook payload 都是不可信输入；
- TypeScript 只能提供编译期约束，Zod 能提供运行时校验；
- 共享 schema 能降低前后端契约漂移。

推荐目录：

```txt
packages/domain/src/
  world/
    world.schema.ts
    world.types.ts
  archive/
    archive-entry.schema.ts
  seed/
    story-seed.schema.ts
  conflict/
    conflict.schema.ts
  repository/
    repository.schema.ts
    release.schema.ts
  agent/
    agent-event.schema.ts
    agent-run.schema.ts
    suggestion.schema.ts
  billing/
    usage-ledger.schema.ts
  moderation/
    report.schema.ts
  api/
    pagination.schema.ts
    error.schema.ts
```

迁移原则：

- 当前 `src/features/worlddock/domain.ts` 中的 schema 应逐步迁到 `packages/domain`；
- 前端 feature 层从 `packages/domain` 导入类型；
- 后端 API 层使用同一份 schema 做请求与响应校验；
- 数据库 model 到 domain object 的转换由 mapper 明确完成。

### 4.6 鉴权：Better Auth

选择：`Better Auth`

使用理由：

- 适合 Node.js / TypeScript 项目；
- 支持 session、OAuth、邮箱登录、API token 等常见能力；
- 比完全自研认证更安全，也比外部 BaaS 更可控；
- 便于把用户、session、access token 与 WorldDock 自己的权限模型放在 PostgreSQL 中统一治理。

WorldDock 需要的认证能力：

- Web 用户登录；
- OAuth 登录；
- Session 管理；
- Local 客户端 Access Token；
- Local Push Token；
- 管理员角色；
- Token 撤销；
- 设备与会话管理；
- 敏感操作二次确认，后续可扩展。

权限原则：

- 世界私有资产只能由 owner 或协作者访问；
- 公开仓库只能展示 Release Snapshot 中明确公开的内容；
- Local Push Token 只能执行限定范围的发布和同步操作；
- 管理员操作必须写入 `moderation_actions` 或审计日志；
- 所有写操作必须有明确 user id 或 token subject。

### 4.7 缓存与队列底座：Redis

选择：`Redis`

适用范围：

- BullMQ 队列；
- API 限流；
- 短期幂等 key；
- Agent run 心跳；
- SSE 连接状态；
- 热点公开仓库缓存；
- 搜索同步去重；
- Webhook 处理去重。

不适用范围：

- 不保存核心世界资产；
- 不保存计费事实；
- 不保存发布状态；
- 不保存审核事实；
- 不作为用户权限唯一来源。

### 4.8 异步任务：BullMQ

选择：`BullMQ`

使用理由：

- 基于 Redis，Node.js 生态成熟；
- 支持重试、延迟任务、并发控制、失败队列和任务状态；
- 适合把 API 写路径和后台副作用拆开；
- 与 NestJS 模块化集成自然。

首批队列建议：

```txt
agent-postprocess
search-indexing
release-snapshot
moderation-scan
usage-settlement
notification
storage-cleanup
embedding-indexing
```

任务设计原则：

- API 请求只完成核心事务写入；
- 副作用通过 `outbox_events` 进入 BullMQ；
- Worker 消费任务时必须幂等；
- 任务失败必须可重试、可观察、可人工补偿；
- 发布、计费、审核这类任务不允许静默失败。

推荐 outbox 流程：

```txt
业务事务写 PostgreSQL
  -> 写 outbox_events
  -> worker 扫描或触发队列
  -> BullMQ 执行副作用
  -> 更新 outbox 状态
```

### 4.9 Agent 流式层：Vercel AI SDK server-side + SSE

选择：`Vercel AI SDK` server-side + 自定义 `SSE / Event Stream`

使用理由：

- AI SDK 能简化模型调用、流式文本、tool calling 和 provider 抽象；
- SSE 适合浏览器端稳定接收增量事件；
- 自定义 AgentEvent 能保持产品协议稳定，不被底层模型 SDK 绑死；
- 便于未来支持不同模型供应商、本地模型代理或私有模型网关。

Agent event 初步协议：

```ts
type AgentEvent =
  | { type: "run.started"; runId: string; worldId: string; mode: AgentMode }
  | { type: "context.used"; runId: string; refs: ContextRef[] }
  | { type: "tool.started"; runId: string; toolCallId: string; label: string }
  | { type: "tool.completed"; runId: string; toolCallId: string; summary: string }
  | { type: "message.delta"; runId: string; text: string }
  | { type: "suggestion.created"; runId: string; suggestion: WorldSuggestion }
  | { type: "usage.updated"; runId: string; usage: TokenUsage }
  | { type: "run.completed"; runId: string; usage: TokenUsage }
  | { type: "run.cancelled"; runId: string; reason?: string }
  | { type: "run.failed"; runId: string; error: AgentError };
```

关键原则：

- SSE 传输的是 WorldDock 自己的 AgentEvent；
- UI 不直接依赖 AI SDK 的原始事件；
- 每个 run 都必须有数据库记录；
- 重要事件写入 `agent_events`；
- suggestion 必须经过 Zod 校验；
- 余额不足、权限不足、模型不可用必须在 run 启动前拦截；
- 用户取消 run 后，后端应尽量终止模型调用并记录 cancellation；
- usage 写入 `usage_ledger`，不只停留在 run 结果里。

推荐接口：

```txt
POST /v1/worlds/:worldId/agent-runs
GET  /v1/agent-runs/:runId/events
POST /v1/agent-runs/:runId/cancel
POST /v1/agent-suggestions/:suggestionId/save
POST /v1/agent-suggestions/:suggestionId/discard
```

### 4.10 搜索：Meilisearch

选择：`Meilisearch`

使用理由：

- 适合公开世界搜索、标签筛选、作者搜索和 search-as-you-type；
- 查询体验比直接使用数据库全文搜索更适合社区浏览；
- 运维复杂度低于 Elasticsearch；
- 支持排序、过滤、同义词和 typo tolerance。

使用边界：

- Meilisearch 是搜索投影，不是事实源；
- 所有搜索文档从 PostgreSQL 生成；
- 审核下架、私有状态、删除状态必须由 worker 同步到索引；
- API 返回搜索结果后，如涉及权限敏感信息，应回查 PostgreSQL；
- 索引重建必须可从 PostgreSQL 全量恢复。

推荐索引：

```txt
world_repositories
users
tags
```

推荐同步流程：

```txt
repositories / releases / stars / forks / moderation 状态变化
  -> outbox_events
  -> search-indexing queue
  -> Meilisearch upsert / delete
```

### 4.11 对象存储：S3-compatible Object Storage

选择：S3 兼容对象存储

适用范围：

- 世界封面；
- 用户头像；
- 导入文件；
- 导出包；
- Release Snapshot 附件；
- 大型公开资产；
- 审核证据附件；
- 未来多媒体素材。

使用原则：

- 数据库保存 object key、mime type、size、checksum、owner、visibility；
- 私有文件通过短期 signed URL 访问；
- 公开资源可以走 CDN；
- 上传必须限制大小、类型和权限；
- 删除业务记录时，对象清理由 worker 异步完成；
- 不把关键业务字段只保存在对象 JSON 中。

### 4.12 计费与用量：Usage Ledger

选择：内部 `usage_ledger` 作为计费事实源

使用理由：

- WorldDock 的成本来自模型调用、搜索、存储和后续高级能力；
- 支付平台只负责收款，不应该决定产品余额和用量事实；
- append-only ledger 便于审计、补偿和对账；
- 可以同时支持免费额度、充值余额、订阅、赠送额度和管理员调整。

建议 ledger 类型：

```txt
model_run_reserved
model_run_settled
model_run_refunded
credit_granted
credit_purchased
credit_adjusted
storage_charged
admin_adjusted
```

关键原则：

- Agent run 启动前做余额预检查；
- 长 run 可先 reserve，再 settle；
- 失败或取消需要 refund 或 partial settle；
- 所有金额和用量变更不可原地覆盖；
- 对外展示余额由 ledger 聚合得到，必要时使用 materialized balance 表加速。

### 4.13 内容审核与风控

选择：业务内建审核模块，模型审核和人工审核分阶段接入

需要覆盖：

- 用户举报；
- 公开仓库审核状态；
- Release 审核状态；
- 管理员下架；
- 模型调用暂停；
- 用户封禁；
- 敏感内容标记；
- 审核操作日志。

首批状态建议：

```txt
visible
pending_review
limited
takedown
deleted
```

原则：

- 私有创作和公开发布使用不同审核策略；
- 发布到公开社区前可以先异步扫描；
- 举报不会立即删除内容，但会进入审核队列；
- 管理员操作必须可追踪；
- 搜索索引必须及时响应下架状态。

### 4.14 日志、错误与可观测性

选择：

```txt
pino
Sentry
OpenTelemetry
```

使用范围：

- API request 日志；
- Worker job 日志；
- Agent run trace；
- 模型供应商调用耗时；
- token usage；
- 队列失败；
- 搜索同步失败；
- 发布快照失败；
- 审核操作；
- webhook 处理。

关键要求：

- 每个请求有 request id；
- 每个 Agent run 有 run id；
- 每个 BullMQ job 有 job id；
- 日志中不记录 API Key、Access Token、模型密钥、私密世界正文；
- 错误对用户友好，对内部可定位；
- Agent run 的 trace 必须能串起 API、模型调用、数据库写入、ledger 和 worker 副作用。

## 5. 推荐工程结构

```txt
apps/
  web/
    src/
      app/
      features/
      components/
      lib/

  api/
    src/
      main.ts
      app.module.ts
      modules/
      common/
      config/

  worker/
    src/
      main.ts
      queues/
      processors/
      jobs/

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
      api/

  db/
    prisma/
      schema.prisma
      migrations/
      seed.ts
    src/
      prisma-client.ts
      repositories/
      mappers/

  config/
    src/
      env.ts
      constants.ts

  logger/
    src/
      logger.ts
      tracing.ts
```

分层规则：

- `packages/domain` 放领域 schema、API 契约、AgentEvent、错误类型；
- `packages/db` 放 Prisma schema、migration、数据库 repository、domain mapper；
- `apps/api` 放 HTTP、认证、权限、业务编排；
- `apps/worker` 放异步副作用；
- `apps/web` 不直接接触数据库；
- 前端请求只通过 API client；
- Worker 不直接绕过业务规则写核心状态，必要时复用 service 或 repository。

## 6. API 设计原则

### 6.1 REST 为主，SSE 为辅

P0 API 使用 REST 风格，清晰表达资源关系：

```txt
GET    /v1/worlds
POST   /v1/worlds
GET    /v1/worlds/:worldId
PATCH  /v1/worlds/:worldId

GET    /v1/worlds/:worldId/archive
POST   /v1/worlds/:worldId/archive

GET    /v1/worlds/:worldId/seeds
POST   /v1/worlds/:worldId/seeds

GET    /v1/repositories
GET    /v1/repositories/:owner/:slug
POST   /v1/repositories/:repositoryId/star
DELETE /v1/repositories/:repositoryId/star
POST   /v1/repositories/:repositoryId/fork

POST   /v1/worlds/:worldId/publish
GET    /v1/repositories/:repositoryId/releases

POST   /v1/worlds/:worldId/agent-runs
GET    /v1/agent-runs/:runId/events
POST   /v1/agent-runs/:runId/cancel
```

Agent 流式输出使用 SSE。后续如出现多人协作、实时 presence 或多人编辑，再评估 WebSocket。

### 6.2 版本化公开 API

所有稳定接口使用 `/v1` 前缀。

原则：

- 破坏性变化进入新版本；
- 公开 API 和内部 API 分开；
- Local 客户端使用明确 token scope；
- API error 使用统一结构；
- 分页、排序、过滤使用统一 schema。

### 6.3 错误结构统一

推荐错误结构：

```ts
type ApiError = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
};
```

常见错误：

```txt
AUTH_REQUIRED
PERMISSION_DENIED
WORLD_NOT_FOUND
REPOSITORY_NOT_FOUND
VALIDATION_FAILED
INSUFFICIENT_BALANCE
MODEL_UNAVAILABLE
AGENT_RUN_CANCELLED
PUBLISH_BLOCKED
COMMUNITY_TOKEN_INVALID
RATE_LIMITED
```

## 7. 核心业务边界

### 7.1 Agent 建议与世界资产分离

Agent 输出流程：

```txt
用户输入
  -> 创建 agent_run
  -> 流式产生 agent_events
  -> 生成 agent_suggestions
  -> 用户确认保存
  -> 写入 archive_entries / story_seeds / conflicts
```

这样可以保证：

- Agent 不会自动污染世界资产；
- 用户有明确创作主权；
- 可撤销、可审核、可计费；
- 后续能展示 Agent 为什么给出建议。

### 7.2 发布与快照分离

World 是私有或工作态资产，Repository 是公开仓库，Release 是公开快照。

发布流程：

```txt
world working state
  -> publish request
  -> privacy filter
  -> diff generation
  -> release_snapshot
  -> repository visibility update
  -> search indexing
  -> moderation scan
```

发布快照必须明确排除：

- 原始私密对话；
- 模型配置；
- API Key；
- 私有草稿；
- 未选择公开的资产；
- 内部审校记录；
- billing 信息。

### 7.3 Fork 与来源关系分离

Fork 不应只是复制一份世界数据，还要保留来源关系：

```txt
forks
  source_repository_id
  source_release_id
  target_world_id
  user_id
  license_snapshot
```

这样后续才能支持：

- Fork Graph；
- 授权追踪；
- 来源展示；
- 原仓库更新提示；
- 派生世界统计。

### 7.4 Local Push 与 Cloud Publish 分离

Cloud Publish：

- 用户在云端工作台发布当前云端世界；
- 后端可直接读取完整云端资产；
- 发布后生成公开仓库快照。

Local Push：

- 本地客户端使用 Access Token 上传公开快照；
- 后端只能接收明确上传的公开内容；
- 不应假设本地完整数据存在云端；
- Token scope 必须限制 Push 权限。

## 8. 测试策略

### 8.1 单元测试

覆盖：

- domain schema；
- mapper；
- service 纯业务逻辑；
- 权限判断；
- usage ledger 计算；
- Agent event reducer。

建议工具：

```txt
Vitest
```

### 8.2 集成测试

覆盖：

- NestJS module；
- Prisma repository；
- API route；
- Better Auth session；
- BullMQ job；
- Meilisearch sync；
- S3 signed URL。

建议工具：

```txt
Vitest
Supertest
Testcontainers
```

### 8.3 E2E 测试

覆盖：

- 注册 / 登录；
- 创建世界；
- Agent run；
- 保存建议；
- 发布；
- Star；
- Fork；
- 举报；
- 余额不足；
- Local Push Token。

前端继续使用 Playwright，后端提供测试环境和 seed 数据。

## 9. 部署建议

推荐生产部署形态：

```txt
web       -> Vercel 或同类前端托管
api       -> Docker container
worker    -> Docker container
postgres  -> 托管 PostgreSQL
redis     -> 托管 Redis
search    -> Meilisearch Cloud 或自托管容器
storage   -> S3-compatible object storage
```

部署原则：

- API 与 Worker 分开扩缩容；
- Worker 可以按队列类型拆多个进程；
- 数据库开启自动备份与 point-in-time recovery；
- Redis 开启持久化和监控；
- Meilisearch 索引可重建，不作为唯一备份对象；
- 对象存储开启生命周期管理；
- 所有环境变量集中管理，禁止写入代码。

环境分层：

```txt
local
preview
staging
production
```

上线前最低要求：

- migration 可回滚或可补偿；
- 数据库备份策略明确；
- Sentry 项目接入；
- API request id 接入；
- Agent run trace 接入；
- Worker 失败告警接入；
- 管理员可以处理举报和下架。

## 10. 不推荐方案

### 10.1 不把 Next.js Route Handlers 当完整后端

Next.js Route Handlers 可以保留为轻量 BFF 或前端专用入口，但不应承载全部核心业务。

原因：

- 认证、权限、队列、Worker、Agent、计费、审核会持续增长；
- API 与 Worker 需要共享业务服务；
- 后续开放 Local 客户端和公开 API 时，需要更稳定的后端边界。

### 10.2 不把 Supabase / Firebase 当核心业务后端

BaaS 可以加速验证，但 WorldDock 的长期复杂度集中在自定义业务流程：

- Agent run；
- 发布快照；
- Fork lineage；
- usage ledger；
- 内容审核；
- Local Push；
- 搜索投影；
- 公开 API。

这些更适合由自有后端掌控。

### 10.3 不一开始拆微服务

WorldDock 需要清晰模块边界，但早期不需要微服务复杂度。

模块化单体能避免：

- 过早引入服务发现、跨服务事务、链路追踪和部署编排；
- 团队在业务尚未稳定时被基础设施拖慢；
- 领域模型还没定型就被服务边界锁死。

### 10.4 不让搜索、缓存、模型服务成为事实源

所有外部基础设施都可以失败、延迟或重建。核心事实必须能从 PostgreSQL 恢复。

## 11. 后端落地顺序

### Phase 1: 工程骨架与领域契约

- 建立 monorepo 应用结构；
- 新增 `apps/api`、`apps/worker`、`packages/domain`、`packages/db`；
- 从前端迁移核心 Zod schema；
- 建立统一 env、logger、error、request id；
- 接入 PostgreSQL、Prisma migration；
- 定义首批数据库表。

### Phase 2: 认证与世界资产

- 接入 Better Auth；
- 实现用户、session、OAuth；
- 实现 world CRUD；
- 实现 archive / seed / conflict 保存；
- 前端从 Mock 切换到真实世界列表和世界详情。

### Phase 3: Agent Run 与 SSE

- 实现 agent_run 创建；
- 实现 SSE event stream；
- 接入 server-side Vercel AI SDK；
- 持久化 agent_events 与 suggestions；
- 实现保存 / 丢弃 suggestion；
- 接入 usage ledger 预检查和结算。

### Phase 4: 公开仓库与发布

- 实现 repository、release、release_snapshot；
- 实现 Publish；
- 实现 Star / Fork；
- 实现 Local Push Token；
- 实现发布隐私过滤和 diff；
- 前端社区和发布页切换真实 API。

### Phase 5: 搜索、审核与后台

- 接入 Meilisearch；
- 建立 outbox + search-indexing queue；
- 实现举报和审核状态；
- 实现管理员下架；
- 搜索索引响应 visibility 和 moderation 状态。

### Phase 6: 生产运维与计费

- 完善 usage ledger；
- 接入支付平台；
- 完善 worker 失败告警；
- 接入 Sentry 和 OpenTelemetry；
- 增加备份、恢复、压测和安全检查；
- 补齐 API 文档和 Local 客户端 token scope。

## 12. 最终决策

界坞 WorldDock 云端生产后端主栈定为：

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

这套方案的核心价值：

- 前后端共享领域契约；
- PostgreSQL 保证长期事实源；
- NestJS 保证模块边界；
- Prisma 提供开发效率，同时保留 SQL 逃生口；
- BullMQ 支撑异步副作用；
- Meilisearch 提供社区搜索体验；
- SSE 支撑 Agent 流式协作；
- Better Auth 避免认证自研风险；
- S3 兼容存储避免厂商绑定；
- 后续可演进到多服务，但早期不承担微服务复杂度。

