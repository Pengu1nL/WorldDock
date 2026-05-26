import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { licenseSchema, releaseSnapshotSchema, type ReleaseDiff } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { OUTBOX_REPOSITORY, type OutboxRepository } from "../outbox/outbox.repository";
import { WORLD_REPOSITORY, type WorldRecord, type WorldRepository } from "../worlds/world.repository";
import { REPOSITORY_REPOSITORY, type PublicRepositoryRecord, type ReleaseRecord, type RepositoryRepository } from "./repository.repository";
import { REPOSITORY_SEARCH_CLIENT, type RepositorySearchClient, type RepositorySearchOptions } from "./repository-search.client";

@Injectable()
export class RepositoryService {
  constructor(
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(REPOSITORY_SEARCH_CLIENT) private readonly searchClient: RepositorySearchClient,
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

  async searchPublicRepositories(query: string, options: RepositorySearchOptions = {}) {
    const normalized = query.trim().toLowerCase();
    const shouldQuerySearchIndex = Boolean(
      normalized || options.tags?.length || (options.sort && options.sort !== "relevance"),
    );
    const searchHits = shouldQuerySearchIndex
      ? await this.searchClient.search(normalized, options).catch(() => null)
      : null;

    if (searchHits) {
      const repositories = await Promise.all(
        searchHits.map((hit) => this.repositories.findById(hit.id)),
      );
      return Promise.all(
        repositories
          .filter((repository): repository is PublicRepositoryRecord => repository !== null && repository.moderationStatus !== "removed")
          .map((repository) => this.toRepositoryDetail(repository)),
      );
    }

    const repositories = await this.repositories.listPublic();
    const filtered = sortRepositories((normalized
      ? repositories.filter((repository) =>
          [repository.name, repository.summary, repository.ownerName, repository.slug, ...repository.tags]
            .join(" ")
            .toLowerCase()
            .includes(normalized))
      : repositories)
      .filter((repository) => hasAllTags(repository, options.tags)), options.sort);
    return Promise.all(filtered.map((repository) => this.toRepositoryDetail(repository)));
  }

  async listReleases(repositoryId: string) {
    const releases = await this.repositories.listReleases(repositoryId);
    return releases.map(toReleaseDetail);
  }

  async starRepository(subject: AuthSubject, repositoryId: string) {
    await this.requirePubliclyVisibleRepository(repositoryId);
    const repository = await this.repositories.starRepository(repositoryId, subject.user.id);
    if (!repository) throw this.notFound("Repository not found.");
    await this.emitRepositoryEvent("repository.starred", repository.id, { repositoryId: repository.id, userId: subject.user.id });
    return this.toRepositoryDetail(repository);
  }

  async unstarRepository(subject: AuthSubject, repositoryId: string) {
    await this.requirePubliclyVisibleRepository(repositoryId);
    const repository = await this.repositories.unstarRepository(repositoryId, subject.user.id);
    if (!repository) throw this.notFound("Repository not found.");
    await this.emitRepositoryEvent("repository.unstarred", repository.id, { repositoryId: repository.id, userId: subject.user.id });
    return this.toRepositoryDetail(repository);
  }

  async forkRepository(subject: AuthSubject, repositoryId: string) {
    const repository = await this.repositories.findById(repositoryId);
    if (!repository || repository.moderationStatus === "removed") throw this.notFound("Repository not found.");
    if (repository.license === "no-fork") {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "This repository does not allow forks." });
    }

    const latestRelease = (await this.repositories.listReleases(repository.id))[0];
    if (!latestRelease) throw this.notFound("Release not found.");
    const snapshot = await this.repositories.findSnapshotByReleaseId(latestRelease.id);
    if (!snapshot) throw this.notFound("Release snapshot not found.");

    const world = await this.worlds.createWorld({
      ownerId: subject.user.id,
      name: `${snapshot.snapshot.world.name} Fork`,
      type: snapshot.snapshot.world.type,
      summary: snapshot.snapshot.world.summary,
      tags: snapshot.snapshot.world.tags,
      mode: "cloud",
      maturity: snapshot.snapshot.world.maturity,
    });
    await Promise.all([
      ...snapshot.snapshot.archiveEntries.map((entry) => this.worlds.createArchiveEntry({ worldId: world.id, ...entry })),
      ...snapshot.snapshot.storySeeds.map((seed) => this.worlds.createStorySeed({ worldId: world.id, ...seed })),
      ...snapshot.snapshot.conflicts.map((conflict) => this.worlds.createConflict({ worldId: world.id, ...conflict })),
    ]);
    const fork = await this.repositories.createFork({
      repositoryId: repository.id,
      sourceReleaseId: latestRelease.id,
      targetWorldId: world.id,
      userId: subject.user.id,
      licenseSnapshot: repository.license,
    });
    await this.emitRepositoryEvent("repository.forked", repository.id, { repositoryId: repository.id, forkId: fork.id, userId: subject.user.id });

    return { world, fork };
  }

  async localPush(subject: AuthSubject, input: {
    name: string;
    summary: string;
    tags: string[];
    releaseNote: string;
    license: string;
    snapshot: {
      world: { name: string; type: string; summary: string; tags: string[]; maturity: number };
      archiveEntries: unknown[];
      storySeeds: unknown[];
      conflicts: unknown[];
    };
  }) {
    if (subject.kind !== "access-token") {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Local Push requires an access token." });
    }
    const license = licenseSchema.parse(input.license);
    const repository = await this.repositories.createRepository({
      worldId: null,
      ownerId: subject.user.id,
      ownerName: subject.user.name,
      slug: slugify(input.name),
      name: input.name,
      summary: input.summary,
      tags: input.tags,
      license,
    });
    const diff = buildDiff(true, input.snapshot.archiveEntries.length, input.snapshot.storySeeds.length);
    const release = await this.repositories.createRelease({
      repositoryId: repository.id,
      version: "v1.0.0",
      note: input.releaseNote,
      license,
      diff,
      source: "local-push",
    });
    const snapshot = releaseSnapshotSchema.parse({
      repositoryId: repository.id,
      releaseId: release.id,
      ...input.snapshot,
      createdAt: release.createdAt.toISOString(),
    });
    await this.repositories.createSnapshot({ repositoryId: repository.id, releaseId: release.id, snapshot });
    await this.emitRepositoryEvent("repository.local_pushed", repository.id, { repositoryId: repository.id, releaseId: release.id });
    await this.emitRepositoryEvent("repository.moderation_scan_requested", repository.id, { repositoryId: repository.id, releaseId: release.id, source: "local-push" });
    return {
      repository: await this.toRepositoryDetail(repository),
      release: toReleaseDetail(release),
    };
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
    await this.emitRepositoryEvent("repository.published", repository.id, { repositoryId: repository.id, releaseId: release.id, worldId: world.id });
    await this.emitRepositoryEvent("repository.moderation_scan_requested", repository.id, { repositoryId: repository.id, releaseId: release.id, worldId: world.id, source: "cloud-publish" });

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
      moderationStatus: repository.moderationStatus,
      moderationReason: repository.moderationReason,
      releases: releases.map(toReleaseSummary),
    };
  }

  private async requirePubliclyVisibleRepository(repositoryId: string) {
    const repository = await this.repositories.findById(repositoryId);
    if (!repository || repository.moderationStatus === "removed") {
      throw this.notFound("Repository not found.");
    }
    return repository;
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

  private async emitRepositoryEvent(type: string, aggregateId: string, payload: unknown) {
    await this.outbox.createEvent({ type, aggregateId, payload });
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

function hasAllTags(repository: PublicRepositoryRecord, tags: string[] = []) {
  if (tags.length === 0) return true;
  const repositoryTags = new Set(repository.tags.map((tag) => tag.toLowerCase()));
  return tags.every((tag) => repositoryTags.has(tag.toLowerCase()));
}

function sortRepositories(repositories: PublicRepositoryRecord[], sort: RepositorySearchOptions["sort"]) {
  const sorted = [...repositories];
  if (sort === "stars") return sorted.sort((left, right) => right.stars - left.stars);
  if (sort === "forks") return sorted.sort((left, right) => right.forks - left.forks);
  if (sort === "updated") return sorted.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  return sorted;
}
