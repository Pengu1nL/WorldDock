import { Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { officialWorldAssetTypeSchema } from "@worlddock/contract/assets";
import { potentialAssetStatusSchema } from "@worlddock/contract/potential-assets";
import { z } from "zod";
import type { PotentialAssetRecord } from "./potential-assets.repository";
import { PotentialAssetsService } from "./potential-assets.service";

const listPotentialAssetsQuerySchema = z.object({
  status: potentialAssetStatusSchema.optional(),
  type: officialWorldAssetTypeSchema.optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

@Controller()
export class PotentialAssetsController {
  constructor(@Inject(PotentialAssetsService) private readonly potentialAssets: PotentialAssetsService) {}

  @Get("worlds/:worldId/potential-assets")
  async listForWorld(@Param("worldId") worldId: string, @Query() query: unknown) {
    return serializePotentialAssetList(await this.potentialAssets.listForWorld(
      worldId,
      listPotentialAssetsQuerySchema.parse(query),
    ));
  }

  @Get("worlds/:worldId/agent-sessions/:sessionId/potential-assets")
  async listForSession(@Param("worldId") worldId: string, @Param("sessionId") sessionId: string) {
    return serializePotentialAssetList(await this.potentialAssets.listForSession(worldId, sessionId));
  }

  @Get("worlds/:worldId/agent-runs/:runId/potential-assets")
  async listForRun(@Param("worldId") worldId: string, @Param("runId") runId: string) {
    return serializePotentialAssetList(await this.potentialAssets.listForRun(worldId, runId));
  }

  @Post("worlds/:worldId/potential-assets/:potentialAssetId/dismiss")
  @HttpCode(200)
  async dismiss(@Param("worldId") worldId: string, @Param("potentialAssetId") potentialAssetId: string) {
    return { potentialAsset: serializePotentialAsset(await this.potentialAssets.updateStatus(
      worldId,
      potentialAssetId,
      "dismissed",
    )) };
  }
}

function serializePotentialAssetList(result: {
  potentialAssets: PotentialAssetRecord[];
  nextCursor: string | null;
}) {
  return {
    potentialAssets: result.potentialAssets.map(serializePotentialAsset),
    nextCursor: result.nextCursor,
  };
}

function serializePotentialAsset(asset: PotentialAssetRecord) {
  return {
    ...asset,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}
