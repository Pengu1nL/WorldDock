import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { RepositoryService } from "./repository.service";

const publishSchema = z.object({
  releaseNote: z.string().min(1),
  license: z.string().min(1),
});

const localPushSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  releaseNote: z.string().min(1),
  license: z.string().min(1),
  snapshot: z.object({
    world: z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      summary: z.string().min(1),
      tags: z.array(z.string()).default([]),
      maturity: z.number().int().min(0).max(100).default(0),
    }),
    archiveEntries: z.array(z.unknown()).default([]),
    storySeeds: z.array(z.unknown()).default([]),
    conflicts: z.array(z.unknown()).default([]),
  }),
});

@Controller()
export class RepositoryController {
  constructor(@Inject(RepositoryService) private readonly repositoryService: RepositoryService) {}

  @Get("repositories")
  async list() {
    return { repositories: await this.repositoryService.listPublicRepositories() };
  }

  @Get("repositories/search")
  async search(
    @Query("q") query = "",
    @Query("tag") tag?: string | string[],
    @Query("sort") sort = "relevance",
  ) {
    return {
      repositories: await this.repositoryService.searchPublicRepositories(query, {
        tags: normalizeTags(tag),
        sort: parseSearchSort(sort),
      }),
    };
  }

  @Get("repositories/:owner/:slug")
  async detail(@Param("owner") owner: string, @Param("slug") slug: string) {
    return { repository: await this.repositoryService.getPublicRepository(owner, slug) };
  }

  @Get("repositories/:repositoryId/releases")
  async releases(@Param("repositoryId") repositoryId: string) {
    return { releases: await this.repositoryService.listReleases(repositoryId) };
  }

  @Post("repositories/:repositoryId/star")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async star(@CurrentSubject() subject: AuthSubject, @Param("repositoryId") repositoryId: string) {
    return { repository: await this.repositoryService.starRepository(subject, repositoryId) };
  }

  @Delete("repositories/:repositoryId/star")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async unstar(@CurrentSubject() subject: AuthSubject, @Param("repositoryId") repositoryId: string) {
    return { repository: await this.repositoryService.unstarRepository(subject, repositoryId) };
  }

  @Post("repositories/:repositoryId/fork")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async fork(@CurrentSubject() subject: AuthSubject, @Param("repositoryId") repositoryId: string) {
    return this.repositoryService.forkRepository(subject, repositoryId);
  }

  @Post("repositories/local-push")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("repository:push")
  async localPush(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    return this.repositoryService.localPush(subject, localPushSchema.parse(body));
  }

  @Post("worlds/:worldId/publish")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async publish(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    return this.repositoryService.publishWorld(subject, worldId, publishSchema.parse(body));
  }
}

function normalizeTags(tag?: string | string[]) {
  const tags = Array.isArray(tag) ? tag : tag ? [tag] : [];
  return tags.flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSearchSort(sort: string) {
  if (sort === "stars" || sort === "forks" || sort === "updated") return sort;
  return "relevance";
}
