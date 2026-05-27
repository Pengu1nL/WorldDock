# 后端总体验收报告

日期：2026-05-26

补充验收：2026-05-27

## 阶段提交

- Phase 1：`741e210` Monorepo 与共享领域包
- Phase 2：`71a9a26` API 与数据库骨架
- Phase 3：`5e2612e` 认证与访问令牌骨架
- Phase 4：`190dfa6` 世界资产 API
- Phase 5：`920369e` Agent Run 与 SSE
- Phase 6：`70de95d` Usage Ledger 与余额拦截
- Phase 7：`5c59505` 发布与公开仓库
- Phase 8：`d98982a` Star Fork 与 Local Push
- Phase 9：`b54b5e2` 搜索投影
- Phase 10：`d6b2cff` 审核举报闭环
- Phase 11：`aa7d89a` 对象存储基础
- Phase 12：`54fff55` 运维安全基线

## 里程碑验收

- [x] Milestone A：后端骨架可运行。API、DB package、readiness、错误结构和 monorepo 基线已落地。
- [x] Milestone B：登录用户可以真实创建世界。认证、world、archive、seed、conflict API 和前端接入已落地。
- [x] Milestone C：Agent 真实流式推演。Agent Run、SSE、suggestion save/discard、usage ledger 和余额拦截已落地。
- [x] Milestone D：公开社区主链路上线。Publish、Release Snapshot、Star、Fork、Local Push、Explore 搜索投影已落地。
- [x] Milestone E：生产上线基线。举报审核、对象存储、Sentry/OTel 基线、security headers、readiness/metrics、staging 配置和发布 checklist 已落地。

## 已通过命令

最终阶段复验已通过：

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/web test:e2e
```

阶段内还分别通过了各 Phase 计划文档记录的 API、Worker、Web、Prisma validate、E2E 等针对性命令。

2026-05-27 在本机 Docker daemon 可用后补充通过真实依赖验收：

```bash
docker info --format '{{.ServerVersion}}'
docker compose up -d postgres redis meilisearch storage
docker compose ps
pnpm --filter @worlddock/db prisma:migrate:deploy
pnpm --filter @worlddock/db seed
pnpm --filter @worlddock/api test:readiness:local
curl -sf http://localhost:9000/minio/health/ready
```

额外 smoke 验证：

- MinIO：通过 AWS SDK 对本地 MinIO 完成临时 bucket 的 create、put、get、delete。
- Meilisearch：通过本地 Meilisearch 完成临时 index 的 create、documents add、search、delete。

## 补充修复

真实数据库验收首次执行时发现 `prisma:migrate:deploy` 因缺少 `prisma/migrations` 只报告无待执行迁移，随后 `pnpm --filter @worlddock/db seed` 在 PostgreSQL 上报 `public.users` 不存在。已补充初始迁移：

```bash
packages/db/prisma/migrations/20260527024858_init/migration.sql
packages/db/prisma/migrations/migration_lock.toml
```

补充迁移后，`prisma:migrate:deploy` 成功应用 `20260527024858_init`，seed 和 readiness 均通过。

## 仍需生产环境验证

- Sentry/OTel 上报依赖真实 `SENTRY_DSN` 和 OTLP endpoint，当前测试覆盖初始化和代码边界。
- 生产数据库、Redis、Meilisearch、对象存储的云端权限、网络策略、备份和告警仍需按发布 checklist 在 staging/production 环境执行。
