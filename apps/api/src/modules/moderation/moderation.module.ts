import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OutboxModule } from "../outbox/outbox.module";
import { RepositoryModule } from "../repositories/repository.module";
import { ModerationController } from "./moderation.controller";
import { MODERATION_REPOSITORY } from "./moderation.repository";
import { ModerationService } from "./moderation.service";
import { PrismaModerationRepository } from "./prisma-moderation.repository";

@Module({
  imports: [AuthModule, OutboxModule, RepositoryModule],
  controllers: [ModerationController],
  providers: [
    ModerationService,
    PrismaModerationRepository,
    {
      provide: MODERATION_REPOSITORY,
      useExisting: PrismaModerationRepository,
    },
  ],
  exports: [ModerationService, MODERATION_REPOSITORY],
})
export class ModerationModule {}
