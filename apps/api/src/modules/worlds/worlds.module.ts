import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaWorldRepository } from "./prisma-world.repository";
import { WORLD_REPOSITORY } from "./world.repository";
import { WorldsController } from "./worlds.controller";

@Module({
  imports: [AuthModule],
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
