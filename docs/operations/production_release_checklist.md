# 生产发布 Checklist

每次生产发布复制本表，填写 Evidence 后再执行发布。Evidence 必须是 CI run URL、命令输出摘要、监控截图路径或工单链接中的一种。

| Gate | Owner | Command | Evidence | Status |
| --- | --- | --- | --- | --- |
| Prisma schema validate | Release owner | `pnpm --filter @worlddock/db prisma:validate` | 记录命令输出或 CI step URL | [ ] |
| Lint | Release owner | `pnpm lint` | 记录命令输出或 CI step URL | [ ] |
| Unit tests | Release owner | `pnpm test` | 记录命令输出或 CI step URL | [ ] |
| Build | Release owner | `pnpm build` | 记录命令输出或 CI step URL | [ ] |
| API integration | API owner | `pnpm --filter @worlddock/api test:integration` | 记录命令输出或 CI step URL | [ ] |
| Web e2e | Web owner | `pnpm --filter @worlddock/web test:e2e` | 记录命令输出或 CI step URL | [ ] |
| API Docker image | API owner | `docker build -f apps/api/Dockerfile -t worlddock-api:release .` | 记录镜像 tag 或 registry digest | [ ] |
| Web Docker image | Web owner | `docker build -f apps/web/Dockerfile -t worlddock-web:release .` | 记录镜像 tag 或 registry digest | [ ] |
| Worker Docker image | Worker owner | `docker build -f apps/worker/Dockerfile -t worlddock-worker:release .` | 记录镜像 tag 或 registry digest | [ ] |
| Database backup | Release owner | `docs/operations/database_backup_restore.md` | 记录 backup id 和 checksum | [ ] |
| Migration staging deploy | API owner | `pnpm --filter @worlddock/db prisma:migrate:deploy` | 记录 staging migration 输出 | [ ] |
| Staging smoke | Release owner | 创作、Agent、发布、搜索、Fork、举报、对象存储 signed URL | 记录 smoke 账号、时间和结果 | [ ] |
| Production env secrets | Release owner | 检查 `SENTRY_DSN`、`BETTER_AUTH_URL`、`BETTER_AUTH_SECRET`、`TRUSTED_ORIGINS`、`AI_PROVIDER`、`AI_MODEL`、`OPENAI_API_KEY` | 记录 secret manager 版本号 | [ ] |
| Worker queue visibility | Worker owner | 按 `docs/operations/queue_runbook.md` 检查等待数、活跃数、失败数 | 记录队列截图或查询结果 | [ ] |
| Incident coverage | Incident Commander | 按 `docs/operations/incident_runbook.md` 确认值守人和升级渠道 | 记录值守人和观察窗口 | [ ] |
| Post-release observation | Release owner | 发布后 30 分钟观察 API、Web、Worker、Sentry | 记录观察开始和结束时间 | [ ] |
