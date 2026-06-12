import { Module } from "@nestjs/common";
import { DatabaseHealthChecker } from "./database-health.checker";
import { ReadinessService, DEPENDENCY_HEALTH_CHECKERS } from "./readiness.service";
import { SystemController } from "./system.controller";

@Module({
  controllers: [SystemController],
  providers: [
    DatabaseHealthChecker,
    ReadinessService,
    {
      provide: DEPENDENCY_HEALTH_CHECKERS,
      useFactory: (database: DatabaseHealthChecker) => [database],
      inject: [DatabaseHealthChecker],
    },
  ],
})
export class SystemModule {}
