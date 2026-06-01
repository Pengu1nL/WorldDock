# Worker 队列告警 Runbook

WorldDock Alpha 将 Worker 队列健康视为生产发布门禁。发布前必须完成 staging 冒烟，并确认 `/v1/system/worker-health` 返回 `ready: true`；只有两项同时满足，生产发布才可以标记为 ready。

## 队列范围

- `repository-search-indexing`：仓库搜索索引任务，影响搜索结果新鲜度。
- `moderation-scan`：举报和内容审核扫描任务，影响安全处置时效。
- `exports`：导入导出和世界包生成任务，影响用户交付与迁移。

## 告警条件

- `/v1/system/worker-health` 返回 `ready: false`，或整体 `status` 不是 `healthy`。
- 任一队列进入 `degraded`、`backlogged`、`paused` 或 `unavailable` 状态。
- 任一队列 `failed > 0`，需要在重试前定位失败原因。
- 任一队列达到积压分类，或 `waiting` 超过共享健康合约阈值。
- Sentry 收到带有具体 queue tag 的 Worker 或 API queue health 事件。

## 必需证据

- `/v1/system/worker-health` 响应原文，必须包含 `status`、`ready`、`generatedAt`、`requestId` 和每个队列的健康快照。
- 非 healthy 队列对应的 Sentry event 链接，事件需带有 queue name、queue status 和 request id。
- 失败任务的脱敏 payload、错误摘要和首次失败时间；不要在工单中粘贴密钥、token 或用户隐私数据。
- 当前发布 commit、环境、操作者、处置时间线和最终恢复时间。
- staging 冒烟证据，覆盖创作、Agent、发布、搜索、Fork、举报、对象存储 signed URL、导入导出和通知。

## 处置流程

1. 暂停生产发布标记，记录当前 commit、环境、API base URL 和告警时间。
2. 调用 `/v1/system/worker-health` 保存完整快照，并确认异常队列名称是否属于本 Runbook 的队列范围。
3. 若 `failed > 0`，先查看失败任务、应用日志和 Sentry 事件；理解根因后再选择重试、丢弃或补偿。
4. 若队列积压，检查 Redis 连接、Worker 副本数、近期部署和外部依赖延迟；必要时扩容 Worker 或暂停新任务入口。
5. 若队列暂停，确认是否为有记录的维护动作；没有维护记录时恢复队列前先通知 release driver 和队列 owner。
6. 异常恢复后再次调用 `/v1/system/worker-health`，确认 `ready: true` 且每个队列为 healthy。
7. 重新执行 staging 冒烟并补齐证据；只有 staging 冒烟通过且 Worker health 返回 `ready: true` 后，生产发布才可以标记为 ready。

## 常用命令

```bash
curl -fsS "$API_BASE_URL/v1/system/worker-health"
```

```bash
curl -fsS "$API_BASE_URL/v1/system/worker-health" | jq '.status, .ready, .queues'
```

```bash
pnpm --filter @worlddock/worker test -- queue-dashboard.test.ts
```

```bash
pnpm --filter @worlddock/api test:integration -- worker-health.integration-spec.ts
```

```bash
date -u
```
