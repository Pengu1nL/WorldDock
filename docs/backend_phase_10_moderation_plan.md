# Phase 10: 审核、举报与管理员最小闭环实施计划

## 目标

让公开仓库具备最小治理能力：

- 用户可以举报公开仓库；
- 管理员可以查看举报并执行保留、限制、下架；
- 审核动作留痕；
- 审核状态变化写入 outbox，驱动搜索投影更新；
- 发布后触发规则型审核扫描；
- 前端举报按钮接入真实 API，同时保留离线演示反馈。

## 范围

本 Phase 交付后端最小闭环和前端举报接入，不做完整管理员前端、不接入第三方内容安全模型。规则型扫描先覆盖敏感词、空内容和重复举报阈值，并通过 worker 纯函数与队列骨架测试保证行为稳定。

## 数据模型

- `reports`
- `moderation_actions`
- `repositories.moderation_status`
- `repositories.moderation_reason`
- `repositories.moderated_at`

## API

- `POST /v1/repositories/:repositoryId/reports`
- `GET /v1/admin/reports`
- `POST /v1/admin/reports/:reportId/actions`

## Task 清单

- [x] 设计并迁移 `reports` 和 `moderation_actions` 表。
- [x] 在公开仓库表记录审核状态。
- [x] 实现 repository report API。
- [x] 实现管理员列表举报接口。
- [x] 实现管理员处理举报：保留、限制、下架。
- [x] 审核状态变更写入 `moderation_actions`。
- [x] 审核状态变更写入 outbox，触发搜索索引更新。
- [x] 发布后触发 `moderation-scan` queue。
- [x] 实现规则型审核扫描：敏感词、空内容、重复举报阈值。
- [x] 前端公开仓库举报接入真实 API。
- [x] 提供最小管理员接口处理举报。

## 测试命令

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- repository.integration-spec.ts
pnpm --filter @worlddock/worker test
pnpm --filter @worlddock/web test
pnpm --filter @worlddock/api build
pnpm --filter @worlddock/worker build
pnpm --filter @worlddock/web build
pnpm lint
pnpm test
pnpm build
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/web test:e2e
```

## 验收标准

- 用户可以举报公开仓库；
- 普通用户不能访问管理员举报列表；
- 管理员可以下架公开仓库；
- 下架后公开详情和搜索结果不可见；
- 审核操作记录操作者、原因、时间和目标；
- 审核状态变化写入 outbox；
- 发布后有审核扫描 outbox 事件；
- Worker 规则型审核扫描测试通过。

## 实际验收结果

- `reports`、`moderation_actions` 和 repository 审核状态字段已加入 Prisma schema。
- `POST /v1/repositories/:repositoryId/reports` 已接入真实举报写入；重复举报达到阈值会写入审核扫描 outbox。
- `GET /v1/admin/reports` 与 `POST /v1/admin/reports/:reportId/actions` 已实现管理员最小处理闭环，普通用户访问管理员列表返回 403。
- 管理员 `remove` 后公开详情返回 404，搜索回查过滤 removed repository，并写入 `repository.moderation_removed` outbox。
- 发布与 Local Push 会写入 `repository.moderation_scan_requested` outbox；worker 提供 `moderation-scan` 队列、规则型扫描和 `enqueue-moderation` / `work-moderation` 入口。
- 前端举报按钮已调用真实 report API；无 session 或 API 失败时保留本地反馈。
- 已通过验证：`pnpm --filter @worlddock/db prisma:validate`、`pnpm --filter @worlddock/api test:integration -- repository.integration-spec.ts`、`pnpm --filter @worlddock/worker test`、`pnpm --filter @worlddock/web test`、`pnpm --filter @worlddock/api build`、`pnpm --filter @worlddock/worker build`、`pnpm --filter @worlddock/web build`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm --filter @worlddock/api test:integration`、`pnpm --filter @worlddock/web test:e2e`。

## 未完成项与风险

- 当前只提供管理员 API，没有完整管理员前端。
- 规则型审核扫描已覆盖敏感词、空内容和重复举报阈值；第三方内容安全模型和人工审核工作台留给后续生产化增强。
