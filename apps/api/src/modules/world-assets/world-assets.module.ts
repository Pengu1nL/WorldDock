import { Module } from "@nestjs/common";
import { WorldsModule } from "../worlds/worlds.module";
import { WorldAssetsController } from "./world-assets.controller";
import { WorldAssetsService } from "./world-assets.service";

@Module({
  imports: [WorldsModule],
  controllers: [WorldAssetsController],
  providers: [WorldAssetsService],
  exports: [WorldAssetsService],
})
export class WorldAssetsModule {}
