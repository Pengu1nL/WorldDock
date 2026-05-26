# Phase 11: 对象存储与导入导出实施计划

## 目标

完成 S3 兼容对象存储的后端基础：

- 记录对象 metadata；
- 生成短期 signed upload/download URL；
- 校验文件大小、mime type、owner、visibility；
- 为用户头像、世界封面、release snapshot 附件提供 attach 边界；
- 提供 storage cleanup worker 骨架，清理孤儿对象。

## 范围

本 Phase 不上传真实文件、不启动 MinIO/S3 daemon 做端到端联调；以 S3 presigner 适配、权限校验、metadata 写入和 worker 清理行为作为可测试验收。真实存储服务联调留给具备 Docker/对象存储环境时执行。

## 数据模型

- `storage_objects`
- `worlds.cover_object_id`

## API

- `POST /v1/storage/upload-url`
- `GET /v1/storage/objects/:objectId/download-url`
- `POST /v1/storage/objects/:objectId/attach-avatar`
- `POST /v1/worlds/:worldId/cover`
- `POST /v1/repositories/:repositoryId/releases/:releaseId/attachments`

## Task 清单

- [x] 新增 storage module，封装 S3-compatible client。
- [x] 定义 `storage_objects` metadata。
- [x] 实现 signed upload URL。
- [x] 实现 signed download URL。
- [x] 为用户头像接入对象存储 metadata attach。
- [x] 为世界封面接入对象存储 metadata attach。
- [x] 为 release snapshot 大附件接入对象存储 metadata attach。
- [x] 实现 storage cleanup worker，清理孤儿对象。
- [x] 增加文件大小、mime type、owner、visibility 校验。

## 测试命令

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test:integration -- repository.integration-spec.ts
pnpm --filter @worlddock/worker test
pnpm --filter @worlddock/api build
pnpm --filter @worlddock/worker build
pnpm lint
pnpm test
pnpm build
pnpm --filter @worlddock/api test:integration
pnpm --filter @worlddock/web test:e2e
```

## 验收标准

- 私有文件只能由 owner 通过短期 signed URL 访问；
- 公开资源可以返回稳定公开 URL；
- 无权限用户不能访问私有对象；
- 文件大小和 mime type 被校验；
- 世界封面和 release 附件 attach 后 metadata 状态变为 `attached`；
- cleanup worker 会删除过期 pending/orphaned 对象并记录 deleted 状态。

## 实际验收结果

- 新增 `StorageModule`、`StorageRepository`、`S3StorageSigner`，通过 AWS S3 presigner 生成 PUT/GET signed URL。
- 新增 `storage_objects` metadata 和 `worlds.cover_object_id`，对象记录 owner、purpose、visibility、status、world/repository/release 关联。
- `POST /v1/storage/upload-url` 校验大小、mime type、owner 和业务关联后返回 signed upload URL。
- `GET /v1/storage/objects/:objectId/download-url` 对 private object 做 owner 校验，对 public object 返回稳定 public URL。
- 用户头像、世界封面和 release attachment 均提供 attach API；世界封面会写入 `coverObjectId`，release 大附件写入 object metadata。
- Worker 新增 `cleanupOrphanedStorageObjects`，可以删除过期 pending/orphaned 对象并标记 deleted。
- 已通过验证：`pnpm --filter @worlddock/db prisma:validate`、`pnpm --filter @worlddock/api test:integration -- repository.integration-spec.ts`、`pnpm --filter @worlddock/worker test`、`pnpm --filter @worlddock/api build`、`pnpm --filter @worlddock/worker build`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm --filter @worlddock/api test:integration`、`pnpm --filter @worlddock/web test:e2e`。

## 未完成项与风险

- 当前环境未启动真实 MinIO/S3 daemon，因此未执行真实对象上传/下载端到端联调；presigner、权限校验、metadata 和 cleanup 行为已由测试覆盖。
- 目前是 metadata attach 和 URL 生成基础，不包含完整文件管理 UI。
