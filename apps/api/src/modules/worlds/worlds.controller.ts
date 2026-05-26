import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { mapWorld } from "./world.mapper";
import type { WorldRecord, WorldRepository } from "./world.repository";
import { WORLD_REPOSITORY } from "./world.repository";
import { Inject } from "@nestjs/common";

const createWorldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  mode: z.enum(["cloud", "local"]).default("cloud"),
  maturity: z.number().int().min(0).max(100).optional(),
});

const updateWorldSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "unpublished", "published"]).optional(),
  visibility: z.enum(["private", "public"]).optional(),
  mode: z.enum(["cloud", "local"]).optional(),
  maturity: z.number().int().min(0).max(100).optional(),
});

const archiveEntrySchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  relations: z.array(z.string()).optional(),
});

const storySeedSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  trigger: z.string().optional(),
  conflict: z.string().min(1),
  protagonists: z.string().optional(),
  questions: z.array(z.string()).optional(),
});

const conflictSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  related: z.array(z.string()).optional(),
  derivedSeeds: z.array(z.string()).optional(),
});

@Controller("worlds")
@UseGuards(WorldDockAuthGuard)
export class WorldsController {
  constructor(@Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository) {}

  @Get()
  @RequireScopes("world:read")
  async list(@CurrentSubject() subject: AuthSubject) {
    const records = await this.worlds.listWorlds(subject.user.id);
    return {
      worlds: await Promise.all(records.map((record) => this.toWorld(record))),
    };
  }

  @Post()
  @RequireScopes("world:write")
  async create(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    const input = createWorldSchema.parse(body);
    const record = await this.worlds.createWorld({
      ownerId: subject.user.id,
      ...input,
    });

    return { world: await this.toWorld(record) };
  }

  @Get(":worldId")
  @RequireScopes("world:read")
  async detail(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string) {
    return { world: await this.toWorld(await this.requireOwnedWorld(subject, worldId)) };
  }

  @Patch(":worldId")
  @RequireScopes("world:write")
  async update(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireOwnedWorld(subject, worldId);
    const record = await this.worlds.updateWorld(worldId, updateWorldSchema.parse(body));
    if (!record) throw this.notFound();
    return { world: await this.toWorld(record) };
  }

  @Delete(":worldId")
  @RequireScopes("world:write")
  async archive(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string) {
    await this.requireOwnedWorld(subject, worldId);
    const record = await this.worlds.archiveWorld(worldId);
    if (!record) throw this.notFound();
    return { world: await this.toWorld(record) };
  }

  @Get(":worldId/archive")
  @RequireScopes("world:read")
  async listArchive(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string) {
    await this.requireOwnedWorld(subject, worldId);
    return { archiveEntries: await this.worlds.listArchiveEntries(worldId) };
  }

  @Post(":worldId/archive")
  @RequireScopes("world:write")
  async createArchive(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireOwnedWorld(subject, worldId);
    return { archiveEntry: await this.worlds.createArchiveEntry({ worldId, ...archiveEntrySchema.parse(body) }) };
  }

  @Get(":worldId/seeds")
  @RequireScopes("world:read")
  async listSeeds(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string) {
    await this.requireOwnedWorld(subject, worldId);
    return { storySeeds: await this.worlds.listStorySeeds(worldId) };
  }

  @Post(":worldId/seeds")
  @RequireScopes("world:write")
  async createSeed(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireOwnedWorld(subject, worldId);
    return { storySeed: await this.worlds.createStorySeed({ worldId, ...storySeedSchema.parse(body) }) };
  }

  @Get(":worldId/conflicts")
  @RequireScopes("world:read")
  async listConflicts(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string) {
    await this.requireOwnedWorld(subject, worldId);
    return { conflicts: await this.worlds.listConflicts(worldId) };
  }

  @Post(":worldId/conflicts")
  @RequireScopes("world:write")
  async createConflict(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireOwnedWorld(subject, worldId);
    return { conflict: await this.worlds.createConflict({ worldId, ...conflictSchema.parse(body) }) };
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

  private async toWorld(record: WorldRecord) {
    return mapWorld(record, await this.worlds.countAssets(record.id));
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "World not found.",
    });
  }
}
