# Alpha 事故响应 Runbook

## 目标

为 WorldDock Cloud Alpha 提供统一事故分级、响应角色、沟通节奏和恢复确认流程。生产事故处理优先级高于功能开发。

## 事故分级

| Severity | 用户影响 | 示例 | 首次响应目标 |
| --- | --- | --- | --- |
| SEV1 | 多数用户无法登录、创作、发布或访问社区 | API 全站 5xx、数据库不可用、认证全面失败 | 10 分钟内确认负责人 |
| SEV2 | 核心功能部分不可用或数据写入延迟 | Agent Run 大量失败、发布队列积压、对象存储签名失败 | 30 分钟内确认负责人 |
| SEV3 | 非核心功能退化或少量用户受影响 | Explore 搜索延迟、单个 Worker job 重试、指标缺口 | 1 个工作日内确认负责人 |

## 角色

| Role | Responsibility |
| --- | --- |
| Incident Commander | 定级、分派、决定回滚或降级 |
| API Owner | 检查 API health、readiness、error logs 和最近部署 |
| Web Owner | 检查 Web build、路由、认证入口和浏览器报错 |
| Worker Owner | 检查队列积压、失败 job、重试和死信 |
| Comms Owner | 记录时间线、用户影响、恢复时间和后续行动 |

## 首次 15 分钟流程

1. 确认影响面：API、Web、Worker、数据库、Redis、Meilisearch、S3-compatible storage。
2. 打开最新部署、CI run、Sentry issue、日志查询和队列状态。
3. 运行只读健康检查：

```bash
curl -fsS "$API_BASE_URL/v1/system/health"
curl -fsS "$API_BASE_URL/v1/system/readiness"
curl -fsS "$API_BASE_URL/v1/system/metrics"
```

4. 如果新版本引入核心功能不可用，Incident Commander 决定回滚到最近健康版本。
5. Comms Owner 记录事故开始时间、影响功能、当前处置人和下一次更新时间。

## 恢复确认

恢复前必须完成：

- `GET /v1/system/health` 返回 200。
- `GET /v1/system/readiness` 返回 200，关键依赖状态为 `ok`。
- 最新 Web 版本可打开创作首页。
- Worker 没有持续增长的失败 job。
- Sentry 没有同类错误继续快速增长。

## 事后复盘

事故结束后 2 个工作日内补齐：

- 用户影响窗口。
- 根因。
- 检测方式。
- 恢复动作。
- 防复发行动项和负责人。
