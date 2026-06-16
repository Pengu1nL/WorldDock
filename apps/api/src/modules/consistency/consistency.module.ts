import { Module } from "@nestjs/common";
import { OfficialAssetsModule } from "../official-assets/official-assets.module";
import { WorldsModule } from "../worlds/worlds.module";
import { ConsistencyChecker } from "./consistency-checker";
import { ConsistencyController } from "./consistency.controller";
import { CONSISTENCY_REPOSITORY } from "./consistency.repository";
import { ConsistencyService } from "./consistency.service";
import { PrismaConsistencyRepository } from "./prisma-consistency.repository";

@Module({
  imports: [OfficialAssetsModule, WorldsModule],
  controllers: [ConsistencyController],
  providers: [
    ConsistencyChecker,
    ConsistencyService,
    PrismaConsistencyRepository,
    {
      provide: CONSISTENCY_REPOSITORY,
      useExisting: PrismaConsistencyRepository,
    },
  ],
  exports: [ConsistencyService, CONSISTENCY_REPOSITORY],
})
export class ConsistencyModule {}
