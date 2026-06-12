import { Module } from "@nestjs/common";
import { PrismaWorldRepository } from "./prisma-world.repository";
import { WORLD_REPOSITORY } from "./world.repository";
import { WorldsController } from "./worlds.controller";

@Module({
  controllers: [WorldsController],
  providers: [
    PrismaWorldRepository,
    {
      provide: WORLD_REPOSITORY,
      useExisting: PrismaWorldRepository,
    },
  ],
  exports: [WORLD_REPOSITORY],
})
export class WorldsModule {}
