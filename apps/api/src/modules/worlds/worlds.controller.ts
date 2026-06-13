import { Body, Controller, Delete, Get, Inject, NotFoundException, Optional, Param, Patch, Post, ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import { PullClientService } from "../pull-client/pull-client.service";
import { PushClientService } from "../push-client/push-client.service";
import { repoPathSegmentSchema } from "../repo-path-segment";
import { mapWorld } from "./world.mapper";
import type { WorldRecord, WorldRepository } from "./world.repository";
import { WORLD_REPOSITORY } from "./world.repository";

const createWorldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  mode: z.enum(["cloud", "local"]).default("local"),
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

const pushWorldSchema = z.object({
  owner: repoPathSegmentSchema,
  slug: repoPathSegmentSchema,
  note: z.string().max(4000).optional(),
  selectedAssetIds: z.array(z.string().min(1)).min(1),
  allowSecretFindings: z.boolean().optional(),
}).strict();

const pullWorldSchema = z.object({
  owner: repoPathSegmentSchema,
  slug: repoPathSegmentSchema,
}).strict();

@Controller("worlds")
export class WorldsController {
  constructor(
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Optional() @Inject(PullClientService) private readonly pullClient?: PullClientService,
    @Optional() @Inject(PushClientService) private readonly pushClient?: PushClientService,
  ) {}

  @Get()
  async list() {
    const records = await this.worlds.listWorlds();
    return {
      worlds: await Promise.all(records.map((record) => this.toWorld(record))),
    };
  }

  @Post()
  async create(@Body() body: unknown) {
    const input = createWorldSchema.parse(body);
    const record = await this.worlds.createWorld(input);

    return { world: await this.toWorld(record) };
  }

  @Post(":worldId/duplicate")
  async duplicate(@Param("worldId") worldId: string) {
    const original = await this.requireWorld(worldId);
    const record = await this.worlds.createWorld({
      name: `${original.name} · 副本`,
      type: original.type,
      summary: original.summary,
      tags: original.tags,
      mode: original.mode,
      maturity: original.maturity,
    });
    try {
      await this.worlds.duplicateWorldAssets({ sourceWorldId: original.id, targetWorldId: record.id });
    } catch (error) {
      try {
        await this.worlds.deleteWorld(record.id);
      } catch {
        // Keep the original duplication failure as the response error.
      }
      throw error;
    }
    return { world: await this.toWorld(record) };
  }

  @Post(":worldId/push")
  async push(@Param("worldId") worldId: string, @Body() body: unknown) {
    if (!this.pushClient) {
      throw new ServiceUnavailableException({
        code: "SERVICE_UNAVAILABLE",
        message: "World push is not configured.",
      });
    }
    return this.pushClient.pushWorld({ worldId, ...pushWorldSchema.parse(body) });
  }

  @Post("pull")
  async pull(@Body() body: unknown) {
    if (!this.pullClient) {
      throw new ServiceUnavailableException({
        code: "SERVICE_UNAVAILABLE",
        message: "World pull is not configured.",
      });
    }
    return this.pullClient.pullWorld(pullWorldSchema.parse(body));
  }

  @Get(":worldId")
  async detail(@Param("worldId") worldId: string) {
    return { world: await this.toWorld(await this.requireWorld(worldId)) };
  }

  @Patch(":worldId")
  async update(@Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireWorld(worldId);
    const record = await this.worlds.updateWorld(worldId, updateWorldSchema.parse(body));
    if (!record) throw this.notFound();
    return { world: await this.toWorld(record) };
  }

  @Delete(":worldId")
  async archive(@Param("worldId") worldId: string) {
    await this.requireWorld(worldId);
    const record = await this.worlds.deleteWorld(worldId);
    if (!record) throw this.notFound();
    return { world: mapWorld(record, { archive: 0, seeds: 0, conflicts: 0 }) };
  }

  @Get(":worldId/archive")
  async listArchive(@Param("worldId") worldId: string) {
    await this.requireWorld(worldId);
    return { archiveEntries: await this.worlds.listArchiveEntries(worldId) };
  }

  @Post(":worldId/archive")
  async createArchive(@Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireWorld(worldId);
    return { archiveEntry: await this.worlds.createArchiveEntry({ worldId, ...archiveEntrySchema.parse(body) }) };
  }

  @Get(":worldId/seeds")
  async listSeeds(@Param("worldId") worldId: string) {
    await this.requireWorld(worldId);
    return { storySeeds: await this.worlds.listStorySeeds(worldId) };
  }

  @Post(":worldId/seeds")
  async createSeed(@Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireWorld(worldId);
    return { storySeed: await this.worlds.createStorySeed({ worldId, ...storySeedSchema.parse(body) }) };
  }

  @Get(":worldId/conflicts")
  async listConflicts(@Param("worldId") worldId: string) {
    await this.requireWorld(worldId);
    return { conflicts: await this.worlds.listConflicts(worldId) };
  }

  @Post(":worldId/conflicts")
  async createConflict(@Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireWorld(worldId);
    return { conflict: await this.worlds.createConflict({ worldId, ...conflictSchema.parse(body) }) };
  }

  private async requireWorld(worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound();
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
