import { Module } from "@nestjs/common";
import { OUTBOX_REPOSITORY } from "./outbox.repository";
import { PrismaOutboxRepository } from "./prisma-outbox.repository";

@Module({
  providers: [
    PrismaOutboxRepository,
    {
      provide: OUTBOX_REPOSITORY,
      useExisting: PrismaOutboxRepository,
    },
  ],
  exports: [OUTBOX_REPOSITORY],
})
export class OutboxModule {}
