import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import { WorldAssetsService } from "./world-assets.service";

const assetKindSchema = z.enum(["setting", "seed", "conflict"]);

const createAssetSchema = z.object({
  kind: assetKindSchema,
  title: z.string().min(1),
  category: z.string().min(1).optional(),
  summary: z.string().min(1),
  body: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  position: z.number().int().optional(),
});

const updateAssetSchema = createAssetSchema.omit({ kind: true }).partial();

const reorderAssetsSchema = z.object({
  assetIds: z.array(z.string().min(1)).min(1),
});

const relationSchema = z.object({
  targetAssetId: z.string().min(1),
});

@Controller("worlds/:worldId/assets")
export class WorldAssetsController {
  constructor(
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(WorldAssetsService) private readonly assets: WorldAssetsService,
  ) {}

  @Get()
  async list(
    @Param("worldId") worldId: string,
    @Query("kind") kind?: string,
    @Query("q") q?: string,
    @Query("cursor") cursor?: string,
  ) {
    await this.requireWorld(worldId);
    return this.assets.listAssets(worldId, {
      kind: kind ? assetKindSchema.parse(kind) : undefined,
      q,
      cursor,
    });
  }

  @Post()
  async create(@Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireWorld(worldId);
    return { asset: await this.assets.createAsset(worldId, createAssetSchema.parse(body)) };
  }

  @Get(":assetId")
  async detail(@Param("worldId") worldId: string, @Param("assetId") assetId: string) {
    await this.requireWorld(worldId);
    const asset = await this.assets.getAsset(worldId, assetId);
    if (!asset) throw this.notFound();
    return { asset };
  }

  @Patch(":assetId")
  async update(
    @Param("worldId") worldId: string,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
  ) {
    await this.requireWorld(worldId);
    const asset = await this.assets.updateAsset(worldId, assetId, updateAssetSchema.parse(body));
    if (!asset) throw this.notFound();
    return { asset };
  }

  @Delete(":assetId")
  async delete(@Param("worldId") worldId: string, @Param("assetId") assetId: string) {
    await this.requireWorld(worldId);
    const asset = await this.assets.deleteAsset(worldId, assetId);
    if (!asset) throw this.notFound();
    return { asset };
  }

  @Post("reorder")
  @HttpCode(200)
  async reorder(@Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireWorld(worldId);
    return this.assets.reorderAssets(worldId, reorderAssetsSchema.parse(body).assetIds);
  }

  @Post(":assetId/relations")
  async relate(
    @Param("worldId") worldId: string,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
  ) {
    await this.requireWorld(worldId);
    const relation = await this.assets.addRelation(worldId, assetId, relationSchema.parse(body).targetAssetId);
    if (!relation) throw this.notFound();
    return { relation };
  }

  @Delete(":assetId/relations/:targetAssetId")
  async unrelate(
    @Param("worldId") worldId: string,
    @Param("assetId") assetId: string,
    @Param("targetAssetId") targetAssetId: string,
  ) {
    await this.requireWorld(worldId);
    return { relation: await this.assets.deleteRelation(worldId, assetId, targetAssetId) };
  }

  private async requireWorld(worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound();
    return world;
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "World asset not found.",
    });
  }
}
