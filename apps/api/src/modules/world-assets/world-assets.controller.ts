import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
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
@UseGuards(WorldDockAuthGuard)
export class WorldAssetsController {
  constructor(
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    private readonly assets: WorldAssetsService,
  ) {}

  @Get()
  @RequireScopes("world:read")
  async list(
    @CurrentSubject() subject: AuthSubject,
    @Param("worldId") worldId: string,
    @Query("kind") kind?: string,
    @Query("q") q?: string,
    @Query("cursor") cursor?: string,
  ) {
    await this.requireOwnedWorld(subject, worldId);
    return this.assets.listAssets(worldId, {
      kind: kind ? assetKindSchema.parse(kind) : undefined,
      q,
      cursor,
    });
  }

  @Post()
  @RequireScopes("world:write")
  async create(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireOwnedWorld(subject, worldId);
    return { asset: await this.assets.createAsset(worldId, createAssetSchema.parse(body)) };
  }

  @Get(":assetId")
  @RequireScopes("world:read")
  async detail(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Param("assetId") assetId: string) {
    await this.requireOwnedWorld(subject, worldId);
    const asset = await this.assets.getAsset(worldId, assetId);
    if (!asset) throw this.notFound();
    return { asset };
  }

  @Patch(":assetId")
  @RequireScopes("world:write")
  async update(
    @CurrentSubject() subject: AuthSubject,
    @Param("worldId") worldId: string,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
  ) {
    await this.requireOwnedWorld(subject, worldId);
    const asset = await this.assets.updateAsset(worldId, assetId, updateAssetSchema.parse(body));
    if (!asset) throw this.notFound();
    return { asset };
  }

  @Delete(":assetId")
  @RequireScopes("world:write")
  async delete(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Param("assetId") assetId: string) {
    await this.requireOwnedWorld(subject, worldId);
    const asset = await this.assets.deleteAsset(worldId, assetId);
    if (!asset) throw this.notFound();
    return { asset };
  }

  @Post("reorder")
  @HttpCode(200)
  @RequireScopes("world:write")
  async reorder(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireOwnedWorld(subject, worldId);
    return this.assets.reorderAssets(worldId, reorderAssetsSchema.parse(body).assetIds);
  }

  @Post(":assetId/relations")
  @RequireScopes("world:write")
  async relate(
    @CurrentSubject() subject: AuthSubject,
    @Param("worldId") worldId: string,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
  ) {
    await this.requireOwnedWorld(subject, worldId);
    const relation = await this.assets.addRelation(worldId, assetId, relationSchema.parse(body).targetAssetId);
    if (!relation) throw this.notFound();
    return { relation };
  }

  @Delete(":assetId/relations/:targetAssetId")
  @RequireScopes("world:write")
  async unrelate(
    @CurrentSubject() subject: AuthSubject,
    @Param("worldId") worldId: string,
    @Param("assetId") assetId: string,
    @Param("targetAssetId") targetAssetId: string,
  ) {
    await this.requireOwnedWorld(subject, worldId);
    return { relation: await this.assets.deleteRelation(worldId, assetId, targetAssetId) };
  }

  private async requireOwnedWorld(subject: AuthSubject, worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound();
    if (world.ownerId !== subject.user.id) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "You do not have access to this world.",
      });
    }
    return world;
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "World asset not found.",
    });
  }
}
