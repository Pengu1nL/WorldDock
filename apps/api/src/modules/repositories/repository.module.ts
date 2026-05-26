import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorldsModule } from "../worlds/worlds.module";
import { PrismaRepositoryRepository } from "./prisma-repository.repository";
import { RepositoryController } from "./repository.controller";
import { REPOSITORY_REPOSITORY } from "./repository.repository";
import { RepositoryService } from "./repository.service";

@Module({
  imports: [AuthModule, WorldsModule],
  controllers: [RepositoryController],
  providers: [
    RepositoryService,
    PrismaRepositoryRepository,
    {
      provide: REPOSITORY_REPOSITORY,
      useExisting: PrismaRepositoryRepository,
    },
  ],
  exports: [RepositoryService, REPOSITORY_REPOSITORY],
})
export class RepositoryModule {}
