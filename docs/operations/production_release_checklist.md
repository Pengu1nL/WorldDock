# 生产发布 Checklist

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm --filter @worlddock/api test:integration`
- [ ] `pnpm --filter @worlddock/web test:e2e`
- [ ] GitHub Actions `ci` 工作流在目标提交上通过
- [ ] API、Web、Worker 镜像已构建并记录 tag
- [ ] 数据库备份完成且 checksum 已记录
- [ ] migration 已在 staging 运行
- [ ] staging 冒烟：创作、Agent、发布、搜索、Fork、举报、对象存储 signed URL
- [ ] `APP_ENV=production`、`AI_PROVIDER=pi`、`PI_MODEL_PROVIDER`、`PI_MODEL_ID`、`PI_PROVIDER_API_KEY` 已配置
- [ ] `SENTRY_DSN`、`TRUSTED_ORIGINS`、`API_RATE_LIMIT_MAX`、`API_BODY_LIMIT_BYTES`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` 已配置
- [ ] 生产 secrets 未出现在日志、提交历史或工单中
- [ ] Worker 队列和失败告警可见
- [ ] `docs/operations/incident_runbook.md` 和 `docs/operations/queue_runbook.md` 已按本次发布复核
- [ ] 发布后 30 分钟观察窗口有人值守
