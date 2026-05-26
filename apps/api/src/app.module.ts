import "reflect-metadata";
import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { SystemModule } from "./modules/system/system.module";

@Module({
  imports: [SystemModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
