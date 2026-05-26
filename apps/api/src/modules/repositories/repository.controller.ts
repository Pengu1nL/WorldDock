import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { RepositoryService } from "./repository.service";

const publishSchema = z.object({
  releaseNote: z.string().min(1),
  license: z.string().min(1),
});

@Controller()
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Get("repositories")
  async list() {
    return { repositories: await this.repositoryService.listPublicRepositories() };
  }

  @Get("repositories/:owner/:slug")
  async detail(@Param("owner") owner: string, @Param("slug") slug: string) {
    return { repository: await this.repositoryService.getPublicRepository(owner, slug) };
  }

  @Get("repositories/:repositoryId/releases")
  async releases(@Param("repositoryId") repositoryId: string) {
    return { releases: await this.repositoryService.listReleases(repositoryId) };
  }

  @Post("worlds/:worldId/publish")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async publish(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    return this.repositoryService.publishWorld(subject, worldId, publishSchema.parse(body));
  }
}
