import { Controller, Get, Inject, Param } from "@nestjs/common";
import { PotentialAssetsService } from "./potential-assets.service";

@Controller()
export class PotentialAssetsController {
  constructor(@Inject(PotentialAssetsService) private readonly potentialAssets: PotentialAssetsService) {}

  @Get("worlds/:worldId/agent-sessions/:sessionId/potential-assets")
  async listForSession(@Param("worldId") worldId: string, @Param("sessionId") sessionId: string) {
    return this.potentialAssets.listForSession(worldId, sessionId);
  }
}
