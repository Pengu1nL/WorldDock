# 生产发布 Checklist

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm --filter @worlddock/api test:integration`
- [ ] `pnpm --filter @worlddock/web test:e2e`
- [ ] 数据库备份完成且 checksum 已记录
- [ ] migration 已在 staging 运行
- [ ] staging 冒烟：创作、Agent、发布、搜索、Fork、举报、对象存储 signed URL
- [ ] `SENTRY_DSN`、`TRUSTED_ORIGINS`、`API_RATE_LIMIT_MAX`、`API_BODY_LIMIT_BYTES` 已配置
- [ ] `AI_PROVIDER=openai`、`AI_MODEL`、`OPENAI_API_KEY`、`OPENAI_BASE_URL` 已配置
- [ ] 生产 secrets 未出现在日志、提交历史或工单中
- [ ] Worker 队列和失败告警可见
- [ ] 发布后 30 分钟观察窗口有人值守
