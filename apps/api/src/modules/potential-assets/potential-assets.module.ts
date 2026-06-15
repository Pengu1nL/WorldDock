import { forwardRef, Module } from "@nestjs/common";
import { AgentSessionsModule } from "../agent-sessions/agent-sessions.module";
import { AgentModule } from "../agent/agent.module";
import { PotentialAssetsAnalyzer } from "./potential-assets.analyzer";
import { PotentialAssetsController } from "./potential-assets.controller";
import { POTENTIAL_ASSETS_REPOSITORY } from "./potential-assets.repository";
import { PotentialAssetsService } from "./potential-assets.service";
import { PrismaPotentialAssetsRepository } from "./prisma-potential-assets.repository";

@Module({
  imports: [forwardRef(() => AgentModule), AgentSessionsModule],
  controllers: [PotentialAssetsController],
  providers: [
    PotentialAssetsAnalyzer,
    PotentialAssetsService,
    PrismaPotentialAssetsRepository,
    {
      provide: POTENTIAL_ASSETS_REPOSITORY,
      useExisting: PrismaPotentialAssetsRepository,
    },
  ],
  exports: [PotentialAssetsService, POTENTIAL_ASSETS_REPOSITORY],
})
export class PotentialAssetsModule {}
