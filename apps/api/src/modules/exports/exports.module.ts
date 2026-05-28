import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RepositoryModule } from "../repositories/repository.module";
import { WorldsModule } from "../worlds/worlds.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [AuthModule, RepositoryModule, WorldsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
