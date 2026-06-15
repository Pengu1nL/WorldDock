import { Module } from "@nestjs/common";
import { OfficialAssetsModule } from "../official-assets/official-assets.module";
import { WorldsModule } from "../worlds/worlds.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [WorldsModule, OfficialAssetsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
