# Cloud Release Scope

WorldDock Cloud Alpha 聚焦托管式个人创作者产品。Alpha 的目标是让受邀创作者能在云端完成从世界创建、Agent 推演、资产沉淀、发布、Fork、反馈到最小运维保障的闭环。

## Alpha 范围内

- 邮箱和密码账户、登录注册、onboarding、账户设置、session 生命周期。
- 云端世界创建、编辑、档案条目、故事种子、冲突池、一致性提醒。
- pi-backed Agent runs、可检查上下文、待处理建议、显式保存和丢弃。
- 云端发布、界仓详情、Star、Fork、创作者主页、Explore 搜索。
- 创作点余额、price book、用量账本、低余额阻断、支付 UI 占位。
- 举报提交、人工治理 runbook、限流、Alpha 反馈入口。
- 生产部署、Sentry、OpenTelemetry、Worker 队列、备份和发布 checklist。

## Beta 前不做

- 真实 Stripe checkout、订阅、发票、支付 webhook、customer portal。
- 邮件通知投递。
- 邮箱注册验证。
- 管理后台和审核工作台。
- 模板库。

## Cloud Alpha 后再做

- Docker 本地部署。
- 本地模型配置 UI。
- 本地数据库归属和离线草稿。
- Local personal access token 连接流程。
- Local Push 公开快照向导。
- 本地文件系统导入导出自动化。

Local 部署会在 Cloud Alpha 能端到端可用后，以独立计划推进。
