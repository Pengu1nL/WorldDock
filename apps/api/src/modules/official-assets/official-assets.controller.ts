import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { officialWorldAssetTypeSchema } from "@worlddock/contract/assets";
import { z } from "zod";
import type {
  OfficialAssetDetailRecord,
  OfficialAssetRecord,
  OfficialAssetRevisionRecord,
  OfficialAssetSectionIndexRecord,
} from "./official-assets.repository";
import { OfficialAssetsService } from "./official-assets.service";

const createOfficialAssetSchema = z.object({
  type: officialWorldAssetTypeSchema,
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  markdown: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const listOfficialAssetsQuerySchema = z.object({
  type: officialWorldAssetTypeSchema.optional(),
  q: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

@Controller("worlds/:worldId/official-assets")
export class OfficialAssetsController {
  constructor(@Inject(OfficialAssetsService) private readonly officialAssets: OfficialAssetsService) {}

  @Post()
  async create(@Param("worldId") worldId: string, @Body() body: unknown) {
    return serializeOfficialAssetDetail(await this.officialAssets.createAsset(
      worldId,
      createOfficialAssetSchema.parse(body),
    ));
  }

  @Get()
  async list(@Param("worldId") worldId: string, @Query() query: unknown) {
    const result = await this.officialAssets.listAssets(worldId, listOfficialAssetsQuerySchema.parse(query));
    return {
      assets: result.assets.map(serializeOfficialAsset),
      nextCursor: result.nextCursor,
    };
  }

  @Get(":assetId")
  async detail(@Param("worldId") worldId: string, @Param("assetId") assetId: string) {
    return serializeOfficialAssetDetail(await this.officialAssets.getAsset(worldId, assetId));
  }
}

function serializeOfficialAssetDetail(detail: OfficialAssetDetailRecord & { markdown: string }) {
  return {
    asset: serializeOfficialAsset(detail.asset),
    markdown: detail.markdown,
    indexes: detail.indexes.map(serializeOfficialAssetIndex),
    revisions: detail.revisions.map(serializeOfficialAssetRevision),
  };
}

function serializeOfficialAsset(asset: OfficialAssetRecord) {
  return {
    ...asset,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    archivedAt: asset.archivedAt?.toISOString() ?? null,
  };
}

function serializeOfficialAssetRevision(revision: OfficialAssetRevisionRecord) {
  return {
    ...revision,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
  };
}

function serializeOfficialAssetIndex(index: OfficialAssetSectionIndexRecord) {
  return {
    ...index,
    createdAt: index.createdAt.toISOString(),
    updatedAt: index.updatedAt.toISOString(),
  };
}
