import "reflect-metadata";
import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { AgentModule } from "./modules/agent/agent.module";
import { AgentSessionsModule } from "./modules/agent-sessions/agent-sessions.module";
import { ConnectionsModule } from "./modules/connections/connections.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { LocalStorageModule } from "./modules/local-storage/local-storage.module";
import { PotentialAssetsModule } from "./modules/potential-assets/potential-assets.module";
import { SystemModule } from "./modules/system/system.module";
import { WorldAssetsModule } from "./modules/world-assets/world-assets.module";
import { WorldsModule } from "./modules/worlds/worlds.module";

@Module({
  imports: [
    AgentModule,
    AgentSessionsModule,
    ConnectionsModule,
    ExportsModule,
    LocalStorageModule,
    PotentialAssetsModule,
    SystemModule,
    WorldAssetsModule,
    WorldsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
