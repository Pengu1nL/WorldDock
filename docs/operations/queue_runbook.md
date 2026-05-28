# Worker 队列 Runbook

## 目标

定义 WorldDock Alpha Worker 队列的日常检查、积压处理、失败 job 处理和发布前确认流程。

## 队列范围

| Queue | Producer | Worker Responsibility | 用户影响 |
| --- | --- | --- | --- |
| repository-search-indexing | API repository publish/update | 同步公开仓库到搜索索引 | Explore 搜索结果延迟或缺失 |
| moderation-scan | API publish/report/storage flows | 扫描公开内容和对象元数据 | 发布审核延迟或误放行 |

`cleanupOrphanedStorageObjects()` 当前是非队列定时/手动维护函数，不是 BullMQ 队列；记录最近一次 task 输出即可，不检查 waiting、active、failed。

## Worker 启动命令

```bash
pnpm --filter @worlddock/worker exec tsx src/main.ts work-search
pnpm --filter @worlddock/worker exec tsx src/main.ts work-moderation
pnpm --filter @worlddock/worker exec tsx src/main.ts enqueue-search
pnpm --filter @worlddock/worker exec tsx src/main.ts enqueue-moderation
pnpm --filter @worlddock/worker exec tsx src/main.ts rebuild-search
```

Dockerfile 默认 CMD 等价于 `work-search`，只启动 `repository-search-indexing` worker。审核队列 `moderation-scan` 需要独立进程，并显式传入 `work-moderation`。

## 发布前检查

```bash
pnpm --filter @worlddock/worker lint
pnpm --filter @worlddock/worker test
pnpm --filter @worlddock/worker build
```

Expected:

- TypeScript 编译通过。
- Worker 单元测试通过。
- `work-search`、`work-moderation`、`enqueue-search`、`enqueue-moderation` 和 `rebuild-search` 启动命令与当前发布计划一致。

## 积压处理

1. 查看 `repository-search-indexing` 和 `moderation-scan` 的等待数、活跃数、失败数和最老 job 创建时间。
2. 如果等待数持续增长，先确认 Redis 连接和 Worker 实例数量。
3. 如果活跃数不下降，检查 Worker 日志中的同一 job 是否长时间运行。
4. 如果失败数增长，按失败 reason 分组，先处理数量最大的错误。
5. 修复后优先重试幂等 job；对非幂等 job 先确认不会重复写入用户可见状态。
6. 对 storage cleanup 只记录最近一次 `cleanupOrphanedStorageObjects()` task 输出和清理数量，不纳入队列积压判断。

## 失败 job 处理

| Failure | First Check | Recovery |
| --- | --- | --- |
| Redis connection refused | `REDIS_URL`、网络、Redis 实例状态 | 恢复 Redis 后重启 Worker |
| Meilisearch unavailable | `MEILISEARCH_HOST`、API key、健康检查 | 恢复 search 后重试 repository-search-indexing job |
| S3 signer/storage cleanup task error | `S3_ENDPOINT`、bucket、credentials、最近一次 task 输出 | 恢复 storage 后重新运行 storage cleanup task |
| moderation rule error | 最近规则变更和输入 payload | 修正规则后重试 moderation-scan job |

## 升级条件

- `repository-search-indexing` 或 `moderation-scan` 最老 job 超过 30 分钟仍未处理。
- `repository-search-indexing` 或 `moderation-scan` 同类失败 job 在 10 分钟内超过 20 个。
- 发布、搜索或举报流程出现用户可见数据延迟。
- Worker 重启后 5 分钟内失败数继续增长。

升级后按 `docs/operations/incident_runbook.md` 定级处理。
