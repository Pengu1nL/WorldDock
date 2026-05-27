# Local Deployment Later

本地部署版被明确延后。Cloud Alpha 执行路径中不要加入 Local setup 页面、Local Push 产品向导、本地模型设置或本地数据库初始化流程。

当 Cloud Alpha 达到发布就绪后，再创建独立实施计划：

`docs/superpowers/plans/YYYY-MM-DD-local-deployment-product.md`

后续计划需要覆盖：

- Docker Compose 本地初始化。
- 本地模型 provider 配置和连接测试。
- Local world package 导入导出。
- Personal access token 连接 Cloud。
- 显式 Push public snapshot 审核。
- Local/Cloud 隐私边界和 no-secret upload 保证。
