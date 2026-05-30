# Beta 支付计划

Alpha 阶段不处理真实付款，也不把任何用户操作跳转到支付渠道。

Alpha 明确不包含：

- Stripe checkout。
- Stripe customer portal。
- Stripe webhook。
- 订阅状态同步。
- 发票和收据。
- 支付失败催缴。
- 生产税务、退款和争议处理策略。

Alpha 阶段已经保留的边界：

- 创作点余额由 WorldDock 内部 usage ledger 负责。
- Agent Run 成本由 provider、model、input tokens 和 output tokens 通过 price book 计算。
- 低余额时 API 会阻断新的 Agent Run。
- 支付相关按钮只用于 Beta 候补或反馈，不创建真实支付会话。

Beta 启动真实支付前，必须先补充独立执行计划，覆盖支付 provider、checkout session、customer portal、webhook 验签、订阅状态映射、发票、退款和失败重试。
