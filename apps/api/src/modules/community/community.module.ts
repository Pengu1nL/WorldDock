import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RepositoryModule } from "../repositories/repository.module";
import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";

@Module({
  imports: [AuthModule, RepositoryModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
