# 数据库备份与恢复演练

## 备份

1. 使用只读凭据执行 `pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > worlddock-$(date +%Y%m%d%H%M).dump`。
2. 将 dump 上传到加密对象存储，保留至少 7 个每日备份和 4 个每周备份。
3. 记录备份时间、数据库版本、应用 commit 和 dump checksum。

## 恢复演练

1. 在隔离 staging 数据库上执行 `pg_restore --clean --if-exists --no-owner --dbname "$STAGING_DATABASE_URL" < backup.dump`。
2. 运行 `pnpm --filter @worlddock/db prisma:migrate:deploy`。
3. 运行 API readiness、核心集成测试和一次创作到发布冒烟路径。
4. 记录恢复耗时、失败点和数据抽样校验结果。

## 安全要求

- 不把 dump 下载到非受控设备。
- 不在日志或工单中粘贴连接串、用户邮箱、access token 或模型密钥。
- 恢复演练完成后销毁临时数据库。
