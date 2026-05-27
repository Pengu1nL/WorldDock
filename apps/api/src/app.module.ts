import "reflect-metadata";
import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { AccountModule } from "./modules/account/account.module";
import { AgentModule } from "./modules/agent/agent.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { ModerationModule } from "./modules/moderation/moderation.module";
import { ReleasesModule } from "./modules/releases/releases.module";
import { RepositoryModule } from "./modules/repositories/repository.module";
import { StorageModule } from "./modules/storage/storage.module";
import { SystemModule } from "./modules/system/system.module";
import { WorldAssetsModule } from "./modules/world-assets/world-assets.module";
import { WorldsModule } from "./modules/worlds/worlds.module";

@Module({
  imports: [AccountModule, AgentModule, AuthModule, BillingModule, ModerationModule, ReleasesModule, RepositoryModule, StorageModule, SystemModule, WorldAssetsModule, WorldsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
