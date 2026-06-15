import { forwardRef, Module } from "@nestjs/common";
import { LocalStorageModule } from "../local-storage/local-storage.module";
import { WorldsModule } from "../worlds/worlds.module";
import { OFFICIAL_ASSETS_REPOSITORY } from "./official-assets.repository";
import { OfficialAssetsController } from "./official-assets.controller";
import { OfficialAssetsService } from "./official-assets.service";
import { PrismaOfficialAssetsRepository } from "./prisma-official-assets.repository";

@Module({
  imports: [LocalStorageModule, forwardRef(() => WorldsModule)],
  controllers: [OfficialAssetsController],
  providers: [
    OfficialAssetsService,
    PrismaOfficialAssetsRepository,
    {
      provide: OFFICIAL_ASSETS_REPOSITORY,
      useExisting: PrismaOfficialAssetsRepository,
    },
  ],
  exports: [OfficialAssetsService, OFFICIAL_ASSETS_REPOSITORY],
})
export class OfficialAssetsModule {}
