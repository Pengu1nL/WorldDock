import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RepositoryModule } from "../repositories/repository.module";
import { ReleasesController } from "./releases.controller";
import { ReleasesService } from "./releases.service";

@Module({
  imports: [AuthModule, RepositoryModule],
  controllers: [ReleasesController],
  providers: [ReleasesService],
  exports: [ReleasesService],
})
export class ReleasesModule {}
