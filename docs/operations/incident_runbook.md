# 事故响应 Runbook

WorldDock Cloud Alpha 的事故处理目标是先保护创作者数据和发布链路，再恢复非核心体验。

## 分级

- P0: 数据丢失、账号越权、生产无法登录、公开仓库错误泄露私有内容。
- P1: Agent、发布、Fork、账本或对象存储主链路不可用。
- P2: Explore、搜索、举报、设置页或观测指标部分不可用。
- P3: 文案、样式、低频后台任务或非阻塞告警。

## 首次响应

1. 指定 incident lead，并在工单或值守频道记录开始时间、影响范围和当前版本。
2. 查看 Sentry、OpenTelemetry、API readiness、Worker 队列和数据库连接状态。
3. 判断是否需要冻结发布、暂停 Worker 或回滚到上一镜像。
4. 对 P0/P1，每 15 分钟更新一次状态；对 P2/P3，每 30 分钟更新一次状态。

## 稳定服务

- API 不健康: 检查 `/v1/system/health`、`/v1/system/readiness`、数据库、Redis、Meilisearch 和 S3。
- Web 不健康: 检查 Next production server、环境变量、API base URL 和 CDN/反向代理。
- Worker 不健康: 按 `docs/operations/queue_runbook.md` 检查失败任务、重试和积压。
- 数据风险: 先停止写入入口，再执行备份或只读快照，禁止直接修改生产数据。

## 回滚

1. 确认上一版本镜像 tag、migration 状态和兼容性。
2. 若 migration 不可逆，先进入维护模式并评估数据修复方案。
3. 回滚后重新跑 staging 或 production smoke: 登录、创作、Agent、发布、搜索、Fork、举报、signed URL。
4. 记录回滚版本、命令、执行人和验证截图或日志链接。

## 复盘

- 事故结束后 24 小时内补一页复盘：影响、时间线、根因、修复、预防项。
- 所有预防项必须绑定 owner、截止时间和验证方式。
- 若事故暴露 checklist 缺口，同步更新 `docs/operations/production_release_checklist.md`。
