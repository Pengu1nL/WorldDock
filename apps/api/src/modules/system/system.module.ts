import { Module } from "@nestjs/common";
import { DatabaseHealthChecker } from "./database-health.checker";
import { ReadinessService, DEPENDENCY_HEALTH_CHECKERS } from "./readiness.service";
import { RedisHealthChecker } from "./redis-health.checker";
import { SearchHealthChecker } from "./search-health.checker";
import { SystemController } from "./system.controller";

@Module({
  controllers: [SystemController],
  providers: [
    DatabaseHealthChecker,
    RedisHealthChecker,
    SearchHealthChecker,
    ReadinessService,
    {
      provide: DEPENDENCY_HEALTH_CHECKERS,
      useFactory: (database: DatabaseHealthChecker, redis: RedisHealthChecker, search: SearchHealthChecker) => [database, redis, search],
      inject: [DatabaseHealthChecker, RedisHealthChecker, SearchHealthChecker],
    },
  ],
})
export class SystemModule {}
