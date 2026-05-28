# Worker 队列 Runbook

## 目标

定义 WorldDock Alpha Worker 队列的日常检查、积压处理、失败 job 处理和发布前确认流程。

## 队列范围

| Queue | Producer | Worker Responsibility | 用户影响 |
| --- | --- | --- | --- |
| search-indexing | API repository publish/update | 同步公开仓库到搜索索引 | Explore 搜索结果延迟或缺失 |
| moderation-scan | API publish/report/storage flows | 扫描公开内容和对象元数据 | 发布审核延迟或误放行 |
| storage-cleanup | API object lifecycle | 清理废弃对象 | 存储成本增长 |

## 发布前检查

```bash
pnpm --filter @worlddock/worker lint
pnpm --filter @worlddock/worker test
pnpm --filter @worlddock/worker build
```

Expected:

- TypeScript 编译通过。
- Worker 单元测试通过。
- `pnpm --filter @worlddock/worker exec tsx src/main.ts` 是 Docker CMD 使用的运行入口。

## 积压处理

1. 查看队列等待数、活跃数、失败数和最老 job 创建时间。
2. 如果等待数持续增长，先确认 Redis 连接和 Worker 实例数量。
3. 如果活跃数不下降，检查 Worker 日志中的同一 job 是否长时间运行。
4. 如果失败数增长，按失败 reason 分组，先处理数量最大的错误。
5. 修复后优先重试幂等 job；对非幂等 job 先确认不会重复写入用户可见状态。

## 失败 job 处理

| Failure | First Check | Recovery |
| --- | --- | --- |
| Redis connection refused | `REDIS_URL`、网络、Redis 实例状态 | 恢复 Redis 后重启 Worker |
| Meilisearch unavailable | `MEILISEARCH_HOST`、API key、健康检查 | 恢复 search 后重试 search-indexing job |
| S3 signer/storage error | `S3_ENDPOINT`、bucket、credentials | 恢复 storage 后重试 storage-cleanup job |
| moderation rule error | 最近规则变更和输入 payload | 修正规则后重试 moderation-scan job |

## 升级条件

- 队列最老 job 超过 30 分钟仍未处理。
- 同类失败 job 在 10 分钟内超过 20 个。
- 发布、搜索或举报流程出现用户可见数据延迟。
- Worker 重启后 5 分钟内失败数继续增长。

升级后按 `docs/operations/incident_runbook.md` 定级处理。
