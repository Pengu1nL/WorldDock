import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { ANALYTICS_REPOSITORY, AnalyticsService, PrismaAnalyticsRepository } from "./analytics.service";

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    PrismaAnalyticsRepository,
    {
      provide: ANALYTICS_REPOSITORY,
      useExisting: PrismaAnalyticsRepository,
    },
  ],
})
export class AnalyticsModule {}
