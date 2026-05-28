import "reflect-metadata";
import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { AccountModule } from "./modules/account/account.module";
import { AgentModule } from "./modules/agent/agent.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { CommunityModule } from "./modules/community/community.module";
import { DeveloperAccessModule } from "./modules/developer-access/developer-access.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { ModerationModule } from "./modules/moderation/moderation.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReleasesModule } from "./modules/releases/releases.module";
import { RepositoryModule } from "./modules/repositories/repository.module";
import { StorageModule } from "./modules/storage/storage.module";
import { SystemModule } from "./modules/system/system.module";
import { WorldAssetsModule } from "./modules/world-assets/world-assets.module";
import { WorldsModule } from "./modules/worlds/worlds.module";

@Module({
  imports: [AccountModule, AgentModule, AnalyticsModule, AuthModule, BillingModule, CommunityModule, DeveloperAccessModule, ExportsModule, ModerationModule, NotificationsModule, ReleasesModule, RepositoryModule, StorageModule, SystemModule, WorldAssetsModule, WorldsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
