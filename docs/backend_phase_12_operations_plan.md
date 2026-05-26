# Phase 12: 生产运维、安全与发布基线实施计划

## 目标

让 API 与 Worker 具备上线前的基础安全、可观测和发布操作边界：

- 结构化日志 redaction；
- Sentry 与 OpenTelemetry 基础接入；
- API rate limit、body limit、CORS trusted origin 和 security headers；
- readiness 覆盖数据库、Redis、搜索；
- metrics 基线；
- 备份恢复、migration 发布、staging 配置和生产发布 checklist 文档。

## Task 清单

- [x] 接入 pino 结构化日志和敏感字段 redaction。
- [x] 接入 Sentry，覆盖 API 和 Worker。
- [x] 接入 OpenTelemetry trace，串联 request id、run id、job id。
- [x] 增加 API rate limit。
- [x] 增加 request body size limit。
- [x] 增加 CORS 和 trusted origin 配置。
- [x] 增加 security headers。
- [x] 增加数据库备份和恢复演练文档。
- [x] 增加 migration 发布流程文档。
- [x] 增加 worker 失败告警。
- [x] 增加 health、readiness、metrics 基线。
- [x] 增加 staging 环境部署配置。
- [x] 编写生产发布 checklist。

## 测试命令

```bash
pnpm --filter @worlddock/api test
pnpm --filter @worlddock/api test:integration -- system.integration-spec.ts
pnpm --filter @worlddock/api build
pnpm --filter @worlddock/worker build
pnpm lint
pnpm test
pnpm build
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/web test:e2e
```

## 实际验收结果

- API Fastify logger 增加 redaction，覆盖 authorization、cookie、token、apiKey、password 和关键 secret 字段。
- API/Worker 均接入 Sentry 初始化和 OpenTelemetry tracer 基础包装；API error filter 会捕获非 HTTP 异常，Worker 提供失败告警 helper。
- `configureApiApp` 增加 CORS trusted origins、内存 rate limit 和 security headers；`main.ts` 设置 body limit。
- readiness 增加 Meilisearch `search` 依赖，system endpoint 新增 `/v1/system/metrics`。
- 新增 `docs/operations/database_backup_restore.md`、`docs/operations/migration_release_process.md`、`docs/operations/production_release_checklist.md` 和 `deploy/staging.env.example`。
- 已通过针对性验证：`pnpm --filter @worlddock/api test:integration -- system.integration-spec.ts`、`pnpm --filter @worlddock/api build`、`pnpm --filter @worlddock/worker build`。
- 已通过全仓验证：`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm --filter @worlddock/api test:integration`、`pnpm --filter @worlddock/web test:e2e`。

## 未完成项与风险

- Sentry/OTel 只有在 `SENTRY_DSN` / OTLP 环境变量配置后才会上报到真实后端；当前测试覆盖的是初始化边界和 API 行为。
- Rate limit 为单进程内存实现，生产多副本需要接入 Redis 或网关层限流。
