import { Body, Controller, Get, Inject, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { worldPackageSchema } from "@worlddock/domain";
import { createPersonalAccessTokenSchema, personalAccessTokenScopeDescriptions } from "@worlddock/domain/developer-access";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import { AuthService, type AuthSubject } from "../auth/auth.service";
import { REPOSITORY_REPOSITORY, type PublicRepositoryRecord, type ReleaseRecord, type RepositoryRepository } from "../repositories/repository.repository";

@Controller("developer-access")
export class DeveloperAccessController {
  constructor(
    private readonly authService: AuthService,
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
  ) {}

  @Get("scopes")
  scopes() {
    return { scopes: personalAccessTokenScopeDescriptions };
  }

  @Post("access-tokens")
  @UseGuards(WorldDockAuthGuard)
  async createAccessToken(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    const session = this.authService.assertSessionSubject(subject);
    const input = createPersonalAccessTokenSchema.parse(body);
    const issued = await this.authService.issueAccessToken(session.user.id, {
      name: input.name,
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });

    return {
      token: issued.plaintextToken,
      accessToken: issued.accessToken,
    };
  }

  @Get("repositories/:owner/:slug/pull")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("repository:read")
  async pullRepository(@Param("owner") owner: string, @Param("slug") slug: string) {
    const repository = await this.repositories.findPublicByOwnerSlug(owner, slug);
    if (!repository || repository.moderationStatus === "removed") throw this.notFound("Repository not found.");
    const release = (await this.repositories.listReleases(repository.id))[0];
    if (!release) throw this.notFound("Release not found.");
    const snapshot = await this.repositories.findSnapshotByReleaseId(release.id);
    if (!snapshot) throw this.notFound("Release snapshot not found.");

    return {
      repository: toRepositoryResponse(repository),
      release: toReleaseResponse(release),
      package: worldPackageSchema.parse({
        format: "worlddock.world-package.v1",
        exportedAt: new Date().toISOString(),
        world: snapshot.snapshot.world,
        assets: [
          ...snapshot.snapshot.archiveEntries.map((entry) => ({
            kind: "setting",
            title: entry.title,
            summary: entry.summary,
            body: entry.body,
            payload: { category: entry.category, relations: entry.relations ?? [] },
          })),
          ...snapshot.snapshot.storySeeds.map((seed) => ({
            kind: "seed",
            title: seed.title,
            summary: seed.hook,
            body: seed.conflict,
            payload: {
              trigger: seed.trigger ?? null,
              protagonists: seed.protagonists ?? null,
              questions: seed.questions ?? [],
            },
          })),
          ...snapshot.snapshot.conflicts.map((conflict) => ({
            kind: "conflict",
            title: conflict.title,
            summary: conflict.summary,
            body: conflict.body,
            payload: {
              related: conflict.related ?? [],
              derivedSeeds: conflict.derivedSeeds ?? [],
            },
          })),
        ],
        releases: [{
          version: release.version,
          note: release.note,
          createdAt: release.createdAt.toISOString(),
        }],
      }),
    };
  }

  private notFound(message: string) {
    return new NotFoundException({ code: "NOT_FOUND", message });
  }
}

function toRepositoryResponse(repository: PublicRepositoryRecord) {
  return {
    id: repository.id,
    owner: repository.ownerName,
    slug: repository.slug,
    name: repository.name,
    summary: repository.summary,
    tags: repository.tags,
    license: repository.license,
    stars: repository.stars,
    forks: repository.forks,
    updated: repository.updatedAt.toISOString(),
  };
}

function toReleaseResponse(release: ReleaseRecord) {
  return {
    id: release.id,
    repositoryId: release.repositoryId,
    version: release.version,
    status: release.status,
    note: release.note,
    license: release.license,
    createdAt: release.createdAt.toISOString(),
  };
}
