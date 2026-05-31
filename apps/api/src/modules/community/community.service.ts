import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ReleaseSnapshot } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { REPOSITORY_REPOSITORY, type PublicRepositoryRecord, type RepositoryRepository } from "../repositories/repository.repository";
import type { RepositorySearchOptions } from "../repositories/repository-search.client";
import { RepositoryService } from "../repositories/repository.service";

type CommunitySort = NonNullable<RepositorySearchOptions["sort"]>;
type AssetKind = "archive" | "seed" | "conflict";

const PAGE_SIZE = 12;
const ASSET_PAGE_SIZE = 8;

@Injectable()
export class CommunityService {
  constructor(
    private readonly repositoryService: RepositoryService,
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
  ) {}

  async listRepositories(input: { cursor?: string; q?: string; tags?: string[]; sort?: CommunitySort }) {
    const repositories = await this.repositoryService.searchPublicRepositories(input.q ?? "", {
      tags: input.tags ?? [],
      sort: input.sort ?? "updated",
    });
    const { items, nextCursor } = paginate(repositories, input.cursor, PAGE_SIZE);
    return { repositories: items, nextCursor };
  }

  async getRepository(owner: string, slug: string) {
    const repository = await this.repositoryService.getPublicRepository(owner, slug);
    const [releaseHistory, forks, latestSnapshot] = await Promise.all([
      this.repositoryService.listReleases(repository.id),
      this.repositories.listForksForRepository(repository.id),
      this.findLatestSnapshot(repository.id),
    ]);

    return {
      ...repository,
      latestRelease: releaseHistory[0] ?? null,
      releaseHistory,
      assetCounts: countSnapshotAssets(latestSnapshot?.snapshot),
      forkGraph: {
        repositoryId: repository.id,
        forks: forks.map((fork) => ({
          id: fork.id,
          sourceReleaseId: fork.sourceReleaseId,
          targetWorldId: fork.targetWorldId,
          userId: fork.userId,
          createdAt: fork.createdAt.toISOString(),
        })),
      },
    };
  }

  async listRepositoryAssets(repositoryId: string, input: { kind?: AssetKind; cursor?: string }) {
    await this.requireVisibleRepository(repositoryId);
    const snapshot = await this.findLatestSnapshot(repositoryId);
    const assets = snapshot ? snapshotAssets(snapshot.snapshot, input.kind) : [];
    const { items, nextCursor } = paginate(assets, input.cursor, ASSET_PAGE_SIZE);
    return {
      repositoryId,
      releaseId: snapshot?.releaseId ?? null,
      assets: items,
      nextCursor,
    };
  }

  async getCreator(handle: string) {
    const repositories = await this.repositoriesForCreator(handle);
    if (repositories.length === 0) throw this.notFound("Creator not found.");
    const stars = repositories.reduce((total, repository) => total + repository.stars, 0);
    const forks = repositories.reduce((total, repository) => total + repository.forks, 0);
    const tags = [...new Set(repositories.flatMap((repository) => repository.tags))].slice(0, 8);
    return {
      handle,
      displayName: repositories[0]?.owner ?? handle,
      bio: "Alpha 创作者主页会展示已公开的世界仓库、版本活动和可 fork 内容。",
      stats: {
        repositories: repositories.length,
        stars,
        forks,
      },
      tags,
      latestUpdated: repositories[0]?.updated ?? null,
    };
  }

  async listCreatorRepositories(handle: string, input: { cursor?: string; sort?: CommunitySort }) {
    const repositories = await this.repositoriesForCreator(handle, input.sort);
    const { items, nextCursor } = paginate(repositories, input.cursor, PAGE_SIZE);
    return { repositories: items, nextCursor };
  }

  async saveRepositoryToCollection(subject: AuthSubject, repositoryId: string) {
    await this.requireVisibleRepository(repositoryId);
    const collection = await this.repositories.saveToCollection({
      repositoryId,
      userId: subject.user.id,
      name: "saved",
    });
    return collection;
  }

  async removeRepositoryFromCollection(subject: AuthSubject, repositoryId: string, collectionId: string) {
    const collection = await this.repositories.removeFromCollection({
      collectionId,
      repositoryId,
      userId: subject.user.id,
    });
    return collection ?? { id: collectionId, repositoryId, userId: subject.user.id, name: "saved", createdAt: new Date(0) };
  }

  private async repositoriesForCreator(handle: string, sort: CommunitySort = "updated") {
    const repositories = await this.repositoryService.searchPublicRepositories("", { sort });
    const normalized = handle.toLowerCase();
    return repositories.filter((repository) => repository.owner.toLowerCase() === normalized);
  }

  private async requireVisibleRepository(repositoryId: string): Promise<PublicRepositoryRecord> {
    const repository = await this.repositories.findById(repositoryId);
    if (!repository || repository.moderationStatus === "removed") throw this.notFound("Repository not found.");
    return repository;
  }

  private async findLatestSnapshot(repositoryId: string) {
    const releases = await this.repositories.listReleases(repositoryId);
    const latestRelease = releases.find((release) => release.status === "published");
    return latestRelease ? this.repositories.findSnapshotByReleaseId(latestRelease.id) : null;
  }

  private notFound(message: string) {
    return new NotFoundException({ code: "NOT_FOUND", message });
  }
}

function paginate<T>(items: T[], cursor: string | undefined, limit: number) {
  const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
  const page = items.slice(offset, offset + limit);
  const nextCursor = offset + limit < items.length ? String(offset + limit) : null;
  return { items: page, nextCursor };
}

function countSnapshotAssets(snapshot: ReleaseSnapshot | undefined) {
  return {
    archive: snapshot?.archiveEntries.length ?? 0,
    seeds: snapshot?.storySeeds.length ?? 0,
    conflicts: snapshot?.conflicts.length ?? 0,
  };
}

function snapshotAssets(snapshot: ReleaseSnapshot, kind?: AssetKind) {
  const archive = snapshot.archiveEntries.map((entry) => ({
    id: entry.id,
    assetId: `archive:${entry.id}`,
    kind: "archive" as const,
    title: entry.title,
    category: entry.category,
    summary: entry.summary,
    body: entry.body,
    related: entry.relations ?? [],
  }));
  const seeds = snapshot.storySeeds.map((seed) => ({
    id: seed.id,
    assetId: `seed:${seed.id}`,
    kind: "seed" as const,
    title: seed.title,
    category: "story-seed",
    summary: seed.hook,
    body: seed.conflict,
    related: seed.questions ?? [],
  }));
  const conflicts = snapshot.conflicts.map((conflict) => ({
    id: conflict.id,
    assetId: `conflict:${conflict.id}`,
    kind: "conflict" as const,
    title: conflict.title,
    category: "conflict",
    summary: conflict.summary,
    body: conflict.body,
    related: conflict.related ?? [],
  }));
  const all = [...archive, ...seeds, ...conflicts];
  return kind ? all.filter((asset) => asset.kind === kind) : all;
}

export function normalizeCommunityAssetKind(value?: string | string[]): AssetKind | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "archive" || raw === "setting" || raw === "settings") return "archive";
  if (raw === "seed" || raw === "seeds") return "seed";
  if (raw === "conflict" || raw === "conflicts") return "conflict";
  return undefined;
}

export function normalizeCommunitySort(value?: string): CommunitySort {
  if (value === "relevance" || value === "stars" || value === "forks" || value === "updated") return value;
  return "updated";
}
