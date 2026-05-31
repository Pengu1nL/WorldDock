import { Controller, Delete, Get, Headers, Param, Post, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import { AuthService, type AuthSubject } from "../auth/auth.service";
import { CommunityService, normalizeCommunityAssetKind, normalizeCommunitySort } from "./community.service";

@Controller("community")
export class CommunityController {
  constructor(
    private readonly communityService: CommunityService,
    private readonly authService: AuthService,
  ) {}

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
  async detail(
    @Param("owner") owner: string,
    @Param("slug") slug: string,
    @Headers("authorization") authorization?: string | string[],
  ) {
    const subject = await this.authenticateOptionalBearer(authorization);
    return { repository: await this.communityService.getRepository(owner, slug, subject) };
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

  private async authenticateOptionalBearer(authorization?: string | string[]) {
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!value?.startsWith("Bearer ")) return null;

    const token = value.slice("Bearer ".length).trim();
    if (!token) return null;

    try {
      return await this.authService.authenticateBearer(token);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
      return null;
    }
  }
}

function normalizeTags(tag?: string | string[]) {
  const tags = Array.isArray(tag) ? tag : tag ? [tag] : [];
  return tags
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}
