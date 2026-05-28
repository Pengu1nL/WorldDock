import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import {
  NOTIFICATIONS_REPOSITORY,
  NotificationsService,
  PrismaNotificationsRepository,
} from "./notifications.service";

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PrismaNotificationsRepository,
    {
      provide: NOTIFICATIONS_REPOSITORY,
      useExisting: PrismaNotificationsRepository,
    },
  ],
  exports: [NotificationsService, NOTIFICATIONS_REPOSITORY],
})
export class NotificationsModule {}
