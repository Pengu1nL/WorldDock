import { Module } from "@nestjs/common";
import { WorldsModule } from "../worlds/worlds.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [WorldsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
