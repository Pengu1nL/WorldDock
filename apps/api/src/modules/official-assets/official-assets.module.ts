import { forwardRef, Module } from "@nestjs/common";
import { AgentSessionsModule } from "../agent-sessions/agent-sessions.module";
import { LocalStorageModule } from "../local-storage/local-storage.module";
import { WorldsModule } from "../worlds/worlds.module";
import { OFFICIAL_ASSETS_REPOSITORY } from "./official-assets.repository";
import { OfficialAssetLockService } from "./official-asset-lock.service";
import { OfficialAssetsController } from "./official-assets.controller";
import { OfficialAssetsService } from "./official-assets.service";
import { PrismaOfficialAssetsRepository } from "./prisma-official-assets.repository";
import { WorldAssetPatchesService } from "./world-asset-patches.service";

@Module({
  imports: [LocalStorageModule, forwardRef(() => WorldsModule), forwardRef(() => AgentSessionsModule)],
  controllers: [OfficialAssetsController],
  providers: [
    OfficialAssetsService,
    OfficialAssetLockService,
    WorldAssetPatchesService,
    PrismaOfficialAssetsRepository,
    {
      provide: OFFICIAL_ASSETS_REPOSITORY,
      useExisting: PrismaOfficialAssetsRepository,
    },
  ],
  exports: [OfficialAssetsService, WorldAssetPatchesService, OFFICIAL_ASSETS_REPOSITORY],
})
export class OfficialAssetsModule {}
