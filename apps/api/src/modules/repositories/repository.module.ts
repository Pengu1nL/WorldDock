import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OutboxModule } from "../outbox/outbox.module";
import { WorldsModule } from "../worlds/worlds.module";
import { PrismaRepositoryRepository } from "./prisma-repository.repository";
import { RepositoryController } from "./repository.controller";
import { REPOSITORY_REPOSITORY } from "./repository.repository";
import { MeilisearchRepositorySearchClient, REPOSITORY_SEARCH_CLIENT } from "./repository-search.client";
import { RepositoryService } from "./repository.service";

@Module({
  imports: [AuthModule, BillingModule, NotificationsModule, OutboxModule, WorldsModule],
  controllers: [RepositoryController],
  providers: [
    RepositoryService,
    PrismaRepositoryRepository,
    {
      provide: REPOSITORY_REPOSITORY,
      useExisting: PrismaRepositoryRepository,
    },
    {
      provide: REPOSITORY_SEARCH_CLIENT,
      useClass: MeilisearchRepositorySearchClient,
    },
  ],
  exports: [RepositoryService, REPOSITORY_REPOSITORY, REPOSITORY_SEARCH_CLIENT],
})
export class RepositoryModule {}
