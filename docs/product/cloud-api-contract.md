# Cloud API Contract

Cloud 前端必须使用经过认证的 API 调用读取和写入产品状态。登录后的云端主路径不得回退到 fixture 世界、本地演示状态或 Local 设置向导。

## Alpha 前必备端点

- `GET /v1/me`
- `PATCH /v1/me`
- `GET /v1/worlds`
- `POST /v1/worlds`
- `GET /v1/worlds/:worldId`
- `PATCH /v1/worlds/:worldId`
- `DELETE /v1/worlds/:worldId`
- `GET /v1/worlds/:worldId/assets`
- `POST /v1/worlds/:worldId/assets`
- `PATCH /v1/worlds/:worldId/assets/:assetId`
- `DELETE /v1/worlds/:worldId/assets/:assetId`
- `POST /v1/worlds/:worldId/agent-runs`
- `GET /v1/agent-runs/:runId/events`
- `POST /v1/agent-suggestions/:suggestionId/save`
- `POST /v1/agent-suggestions/:suggestionId/discard`
- `GET /v1/repositories`
- `POST /v1/repositories`
- `GET /v1/repositories/:ownerName/:slug`
- `POST /v1/repositories/:repositoryId/releases`
- `POST /v1/repositories/:repositoryId/stars`
- `POST /v1/repositories/:repositoryId/forks`
- `GET /v1/billing/usage`
- `GET /v1/billing/placeholder`

## 前端约束

- `WORLD_DOCK_EDITION=cloud` 的生产部署只展示 Cloud 主路径。
- Fixture 数据只能在非生产环境通过 `NEXT_PUBLIC_WORLD_DOCK_FIXTURES=1` 显式启用。
- 登录后，如果云端 API 正在加载、返回空列表或失败，前端必须展示对应的 typed loading、empty 或 error 状态。
- 登录后不得把 fixture 世界当作云端 API 的成功兜底。
- `worlddock.sessionToken` 的浏览器存储读取必须通过共享 auth helper 集中处理，避免业务视图直接读取存储键。
