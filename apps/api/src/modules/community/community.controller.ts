import { Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { CommunityService, normalizeCommunityAssetKind, normalizeCommunitySort } from "./community.service";

@Controller("community")
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get("repositories")
  async repositories(
    @Query("cursor") cursor?: string,
    @Query("q") q?: string,
    @Query("tag") tag?: string | string[],
    @Query("sort") sort?: string,
  ) {
    return this.communityService.listRepositories({
      cursor,
      q,
      tags: normalizeTags(tag),
      sort: normalizeCommunitySort(sort),
    });
  }

  @Get("repositories/:repositoryId/assets")
  async assets(
    @Param("repositoryId") repositoryId: string,
    @Query("kind") kind?: string | string[],
    @Query("cursor") cursor?: string,
  ) {
    return this.communityService.listRepositoryAssets(repositoryId, {
      kind: normalizeCommunityAssetKind(kind),
      cursor,
    });
  }

  @Get("repositories/:owner/:slug")
  async detail(@Param("owner") owner: string, @Param("slug") slug: string) {
    return { repository: await this.communityService.getRepository(owner, slug) };
  }

  @Get("creators/:handle")
  async creator(@Param("handle") handle: string) {
    return { creator: await this.communityService.getCreator(handle) };
  }

  @Get("creators/:handle/repositories")
  async creatorRepositories(
    @Param("handle") handle: string,
    @Query("cursor") cursor?: string,
    @Query("sort") sort?: string,
  ) {
    return this.communityService.listCreatorRepositories(handle, {
      cursor,
      sort: normalizeCommunitySort(sort),
    });
  }

  @Post("repositories/:repositoryId/collections")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async saveToCollection(@CurrentSubject() subject: AuthSubject, @Param("repositoryId") repositoryId: string) {
    return { collection: await this.communityService.saveRepositoryToCollection(subject, repositoryId) };
  }

  @Delete("repositories/:repositoryId/collections/:collectionId")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async removeFromCollection(
    @CurrentSubject() subject: AuthSubject,
    @Param("repositoryId") repositoryId: string,
    @Param("collectionId") collectionId: string,
  ) {
    return { collection: await this.communityService.removeRepositoryFromCollection(subject, repositoryId, collectionId), removed: true };
  }
}

function normalizeTags(tag?: string | string[]) {
  const tags = Array.isArray(tag) ? tag : tag ? [tag] : [];
  return tags
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}
