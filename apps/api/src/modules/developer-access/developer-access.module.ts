import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RepositoryModule } from "../repositories/repository.module";
import { DeveloperAccessController } from "./developer-access.controller";

@Module({
  imports: [AuthModule, RepositoryModule],
  controllers: [DeveloperAccessController],
})
export class DeveloperAccessModule {}
