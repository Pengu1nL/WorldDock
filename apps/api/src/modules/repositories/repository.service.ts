import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { licenseSchema, releaseSnapshotSchema, type ReleaseDiff } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { WORLD_REPOSITORY, type WorldRecord, type WorldRepository } from "../worlds/world.repository";
import { REPOSITORY_REPOSITORY, type PublicRepositoryRecord, type ReleaseRecord, type RepositoryRepository } from "./repository.repository";

@Injectable()
export class RepositoryService {
  constructor(
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
  ) {}

  async listPublicRepositories() {
    const repositories = await this.repositories.listPublic();
    return Promise.all(repositories.map((repository) => this.toRepositoryDetail(repository)));
  }

  async getPublicRepository(owner: string, slug: string) {
    const repository = await this.repositories.findPublicByOwnerSlug(owner, slug);
    if (!repository) throw this.notFound("Repository not found.");
    return this.toRepositoryDetail(repository);
  }

  async listReleases(repositoryId: string) {
    const releases = await this.repositories.listReleases(repositoryId);
    return releases.map(toReleaseDetail);
  }

  async publishWorld(subject: AuthSubject, worldId: string, input: { releaseNote: string; license: string }) {
    const world = await this.requireOwnedWorld(subject, worldId);
    const license = licenseSchema.parse(input.license);
    const existing = await this.repositories.findByWorldId(world.id);
    const repository = existing
      ? await this.repositories.updateRepository(existing.id, {
          name: world.name,
          summary: world.summary,
          tags: world.tags,
          license,
        }) ?? existing
      : await this.repositories.createRepository({
          worldId: world.id,
          ownerId: subject.user.id,
          ownerName: subject.user.name,
          slug: slugify(world.name),
          name: world.name,
          summary: world.summary,
          tags: world.tags,
          license,
        });

    const previousReleases = await this.repositories.listReleases(repository.id);
    const [archiveEntries, storySeeds, conflicts] = await Promise.all([
      this.worlds.listArchiveEntries(world.id),
      this.worlds.listStorySeeds(world.id),
      this.worlds.listConflicts(world.id),
    ]);
    const diff = buildDiff(previousReleases.length === 0, archiveEntries.length, storySeeds.length);
    const release = await this.repositories.createRelease({
      repositoryId: repository.id,
      version: nextVersion(previousReleases),
      note: input.releaseNote,
      license,
      diff,
      source: "cloud-publish",
    });
    const snapshot = releaseSnapshotSchema.parse({
      repositoryId: repository.id,
      releaseId: release.id,
      world: {
        name: world.name,
        type: world.type,
        summary: world.summary,
        tags: world.tags,
        maturity: world.maturity,
      },
      archiveEntries,
      storySeeds,
      conflicts,
      createdAt: release.createdAt.toISOString(),
    });
    await this.repositories.createSnapshot({
      repositoryId: repository.id,
      releaseId: release.id,
      snapshot,
    });
    await this.worlds.updateWorld(world.id, { status: "published", visibility: "public" });

    return {
      repository: await this.toRepositoryDetail(repository),
      release: toReleaseDetail(release),
    };
  }

  private async toRepositoryDetail(repository: PublicRepositoryRecord) {
    const releases = await this.repositories.listReleases(repository.id);
    const latest = releases[0];
    return {
      id: repository.id,
      owner: repository.ownerName,
      slug: repository.slug,
      name: repository.name,
      summary: repository.summary,
      readme: repository.summary,
      tags: repository.tags,
      stars: repository.stars,
      forks: repository.forks,
      updated: repository.updatedAt.toISOString(),
      version: latest?.version ?? "v0.0.0",
      visibility: "public" as const,
      license: repository.license,
      releases: releases.map(toReleaseSummary),
    };
  }

  private async requireOwnedWorld(subject: AuthSubject, worldId: string): Promise<WorldRecord> {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound("World not found.");
    if (world.ownerId !== subject.user.id) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not have access to this world." });
    }
    return world;
  }

  private notFound(message: string) {
    return new NotFoundException({ code: "NOT_FOUND", message });
  }
}

function toReleaseDetail(release: ReleaseRecord) {
  return {
    id: release.id,
    repositoryId: release.repositoryId,
    version: release.version,
    note: release.note,
    license: release.license,
    diff: release.diff,
    createdAt: release.createdAt.toISOString(),
  };
}

function toReleaseSummary(release: ReleaseRecord) {
  return {
    version: release.version,
    updated: release.createdAt.toISOString(),
    note: release.note,
    addedSettings: release.diff.addedSettings,
    changedSettings: release.diff.changedSettings,
    removedSettings: release.diff.removedSettings,
    addedSeeds: release.diff.addedSeeds,
    source: release.source,
  };
}

function buildDiff(isFirstRelease: boolean, archiveCount: number, seedCount: number): ReleaseDiff {
  return {
    addedSettings: isFirstRelease ? archiveCount : 0,
    changedSettings: isFirstRelease ? 0 : archiveCount,
    removedSettings: 0,
    addedSeeds: isFirstRelease ? seedCount : 0,
  };
}

function nextVersion(previousReleases: ReleaseRecord[]) {
  if (previousReleases.length === 0) return "v1.0.0";
  const latest = previousReleases[0]?.version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!latest) return `v1.${previousReleases.length}.0`;
  return `v${latest[1]}.${Number(latest[2]) + 1}.0`;
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "world";
}
