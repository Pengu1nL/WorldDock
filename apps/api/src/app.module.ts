import "reflect-metadata";
import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { AgentModule } from "./modules/agent/agent.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { ModerationModule } from "./modules/moderation/moderation.module";
import { RepositoryModule } from "./modules/repositories/repository.module";
import { StorageModule } from "./modules/storage/storage.module";
import { SystemModule } from "./modules/system/system.module";
import { WorldsModule } from "./modules/worlds/worlds.module";

@Module({
  imports: [AgentModule, AuthModule, BillingModule, ModerationModule, RepositoryModule, StorageModule, SystemModule, WorldsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
