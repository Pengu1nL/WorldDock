import { Module } from "@nestjs/common";
import { DatabaseHealthChecker } from "./database-health.checker";
import { ReadinessService, DEPENDENCY_HEALTH_CHECKERS } from "./readiness.service";
import { RedisHealthChecker } from "./redis-health.checker";
import { SearchHealthChecker } from "./search-health.checker";
import { SystemController } from "./system.controller";
import { WorkerHealthController } from "./worker-health.controller";
import { WORKER_QUEUE_READERS, WorkerHealthService, createBullMqWorkerQueueReaders } from "./worker-health.service";

@Module({
  controllers: [SystemController, WorkerHealthController],
  providers: [
    DatabaseHealthChecker,
    RedisHealthChecker,
    SearchHealthChecker,
    ReadinessService,
    WorkerHealthService,
    {
      provide: WORKER_QUEUE_READERS,
      useFactory: () => createBullMqWorkerQueueReaders(),
    },
    {
      provide: DEPENDENCY_HEALTH_CHECKERS,
      useFactory: (database: DatabaseHealthChecker, redis: RedisHealthChecker, search: SearchHealthChecker) => [database, redis, search],
      inject: [DatabaseHealthChecker, RedisHealthChecker, SearchHealthChecker],
    },
  ],
})
export class SystemModule {}
