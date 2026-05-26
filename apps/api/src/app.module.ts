import "reflect-metadata";
import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { SystemModule } from "./modules/system/system.module";
import { WorldsModule } from "./modules/worlds/worlds.module";

@Module({
  imports: [AuthModule, SystemModule, WorldsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
