# Worker 队列 Runbook

WorldDock Alpha 的 Worker 负责搜索索引、审核扫描和对象清理。队列问题通常先表现为 Explore 延迟、举报处理延迟或对象存储垃圾未清理。

## 健康检查

1. 查看 Worker 进程是否在运行，确认 `APP_ENV`、`REDIS_URL`、`MEILISEARCH_HOST` 和 S3 变量正确。
2. 查看 Redis 队列长度、failed jobs、stalled jobs 和最近一次成功处理时间。
3. 查看 Sentry 和 Worker 日志中的 job name、repositoryId、object key 或 error code。
4. 若 API 正常但队列积压，优先扩容 Worker 或暂停低优先级任务。

## 搜索索引

- 重新入队待同步事件: `pnpm --filter @worlddock/worker start -- enqueue-search`
- 重建仓库搜索索引: `pnpm --filter @worlddock/worker start -- rebuild-search`
- 验证: Explore 搜索能返回最新公开仓库，分页和排序无明显延迟。

## 审核扫描

- 重新入队待审核事件: `pnpm --filter @worlddock/worker start -- enqueue-moderation`
- 启动审核扫描 Worker: `pnpm --filter @worlddock/worker start -- work-moderation`
- 验证: 新举报和公开仓库能产生审核状态或人工处理记录。

## 失败任务处理

1. 先保存 failed job payload、error、attempts、时间和关联实体 id。
2. 判断是否是外部依赖故障、数据不合法、代码回归或环境变量缺失。
3. 外部依赖故障恢复后可批量 retry；数据不合法必须先修数据或补防御逻辑。
4. 重放前确认任务幂等，避免重复发布、重复扣费或重复写 outbox。

## 升级条件

- 队列积压超过 30 分钟且影响发布、Fork、举报或搜索主链路，按 P1 事故处理。
- 任意任务可能导致数据泄露、权限绕过或错误扣费，按 P0 事故处理。
- 修复后更新事故记录，并把新增命令或指标补回本 runbook。
