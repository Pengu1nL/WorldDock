import { Module } from "@nestjs/common";
import { DatabaseHealthChecker } from "./database-health.checker";
import { ReadinessService, DEPENDENCY_HEALTH_CHECKERS } from "./readiness.service";
import { RedisHealthChecker } from "./redis-health.checker";
import { SystemController } from "./system.controller";

@Module({
  controllers: [SystemController],
  providers: [
    DatabaseHealthChecker,
    RedisHealthChecker,
    ReadinessService,
    {
      provide: DEPENDENCY_HEALTH_CHECKERS,
      useFactory: (database: DatabaseHealthChecker, redis: RedisHealthChecker) => [database, redis],
      inject: [DatabaseHealthChecker, RedisHealthChecker],
    },
  ],
})
export class SystemModule {}
