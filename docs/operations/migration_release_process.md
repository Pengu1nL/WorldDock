# Migration 发布流程

1. 合并前确认 `pnpm --filter @worlddock/db prisma:validate`、`pnpm test`、`pnpm build` 通过。
2. 为 schema 变更生成 migration，并在 PR 中说明是否包含 backfill、锁表风险和回滚策略。
3. staging 先执行 `pnpm --filter @worlddock/db prisma:migrate:deploy`。
4. 验证 `/v1/system/readiness`、创作、Agent、发布、搜索、Fork、举报和对象存储 signed URL。
5. 生产发布前确认最近一次数据库备份可用。
6. 生产先部署 migration，再部署 API/Worker/Web；若 migration 向后不兼容，必须拆成 expand/backfill/contract 三步。
7. 发布后观察 Sentry、日志、readiness 和 worker 失败告警至少 30 分钟。
