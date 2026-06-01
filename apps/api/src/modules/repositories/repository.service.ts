import { BadRequestException, ForbiddenException, Inject, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { licenseSchema, releaseSnapshotSchema, type ReleaseChange, type ReleaseDiff, type ReleaseSnapshot } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { EntitlementsService } from "../billing/entitlements.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OUTBOX_REPOSITORY, type OutboxRepository } from "../outbox/outbox.repository";
import { WORLD_REPOSITORY, type WorldRecord, type WorldRepository } from "../worlds/world.repository";
import { REPOSITORY_REPOSITORY, type ForkRecord, type PublicRepositoryRecord, type ReleaseRecord, type RepositoryRepository } from "./repository.repository";
import { REPOSITORY_SEARCH_CLIENT, type RepositorySearchClient, type RepositorySearchOptions } from "./repository-search.client";

@Injectable()
export class RepositoryService {
  constructor(
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(REPOSITORY_SEARCH_CLIENT) private readonly searchClient: RepositorySearchClient,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
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

  async previewWorldRelease(subject: AuthSubject, worldId: string, input: { releaseNote?: string; license?: string }) {
    const world = await this.requireOwnedWorld(subject, worldId);
    const existing = await this.repositories.findByWorldId(world.id);
    const previousRelease = existing ? latestPublishedRelease(await this.repositories.listReleases(existing.id)) : null;
    const previousSnapshot = previousRelease ? await this.repositories.findSnapshotByReleaseId(previousRelease.id) : null;
    const currentSnapshot = await this.buildCurrentSnapshot(existing?.id ?? "preview_repository", "preview_release", world, new Date());
    const changes = buildReleaseChanges(previousSnapshot?.snapshot, currentSnapshot);
    const checks = [
      {
        code: "assets" as const,
        ok: countSnapshotAssets(currentSnapshot) > 0,
        message: "至少需要一个已保存资产。",
      },
      {
        code: "license" as const,
        ok: Boolean(input.license && licenseSchema.safeParse(input.license).success),
        message: "需要选择有效授权方式。",
      },
      {
        code: "release_note" as const,
        ok: Boolean(input.releaseNote?.trim()),
        message: "需要填写发布说明。",
      },
      {
        code: "moderation" as const,
        ok: moderationPreScanPasses(world, input.releaseNote ?? ""),
        message: "发布前审核预扫描未通过。",
      },
      {
        code: "entitlement" as const,
        ok: this.entitlements.getAlphaEntitlements().publicPublishing,
        message: "当前账户不包含公开发布权益。",
      },
    ];
    return { ok: checks.every((check) => check.ok), checks, changes };
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

    const latestRelease = latestPublishedRelease(await this.repositories.listReleases(repository.id));
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
    const fork = await this.repositories.createFork({
      repositoryId: repository.id,
      sourceReleaseId: latestRelease.id,
      targetWorldId: world.id,
      userId: subject.user.id,
      licenseSnapshot: repository.license,
    });
    const assetMaps = (await Promise.all(
      snapshotAssetIds(snapshot.snapshot).map((upstreamAssetId) =>
        this.worlds.createAssetFromSnapshot({
          worldId: world.id,
          upstreamAssetId,
          targetAssetId: deterministicForkTargetAssetId(fork.id, upstreamAssetId),
          snapshot: snapshot.snapshot,
        })),
    )).filter((map): map is NonNullable<typeof map> => map !== null);
    const persistedAssetMaps = await this.repositories.createForkAssetMaps(assetMaps.map((map) => ({ forkId: fork.id, ...map })));
    await this.worlds.remapForkAssetReferences({ worldId: world.id, assetMaps: persistedAssetMaps });
    const relationsReplaced = await this.worlds.replaceForkAssetRelationsFromSnapshot({
      worldId: world.id,
      snapshot: snapshot.snapshot,
      assetMaps: persistedAssetMaps,
    });
    if (!relationsReplaced) {
      throw new InternalServerErrorException({
        code: "FORK_RELATION_REMAP_FAILED",
        message: "Fork relation remap failed.",
      });
    }
    await this.emitRepositoryEvent("repository.forked", repository.id, { repositoryId: repository.id, forkId: fork.id, userId: subject.user.id });
    await this.notifications.safeEmitUserEvent(subject.user.id, {
      type: "repository_forked",
      title: "Fork 已创建",
      body: `${repository.name} 已复制到你的世界列表。`,
      targetType: "fork",
      targetId: fork.id,
      metadata: { repositoryId: repository.id, worldId: world.id, sourceReleaseId: latestRelease.id },
      dedupeKey: `repository-forked:${fork.id}:actor`,
    });
    if (repository.ownerId !== subject.user.id) {
      await this.notifications.safeEmitUserEvent(repository.ownerId, {
        type: "repository_forked",
        title: "你的仓库被 Fork",
        body: `${repository.name} 被一位 Alpha 用户 Fork。`,
        targetType: "repository",
        targetId: repository.id,
        metadata: { forkId: fork.id, sourceReleaseId: latestRelease.id },
        dedupeKey: `repository-forked:${fork.id}:owner`,
      });
    }

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
    const snapshot = releaseSnapshotSchema.parse({
      repositoryId: "preview_repository",
      releaseId: "preview_release",
      ...input.snapshot,
      createdAt: new Date().toISOString(),
    });
    const changes = buildReleaseChanges(null, snapshot);
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
      changes,
      source: "local-push",
    });
    const persistedSnapshot = releaseSnapshotSchema.parse({
      repositoryId: repository.id,
      releaseId: release.id,
      ...input.snapshot,
      createdAt: release.createdAt.toISOString(),
    });
    await this.repositories.createSnapshot({ repositoryId: repository.id, releaseId: release.id, snapshot: persistedSnapshot });
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
    const preflight = await this.previewWorldRelease(subject, world.id, input);
    if (!preflight.ok) {
      throw new BadRequestException({ code: "PUBLISH_BLOCKED", message: "Release preflight failed.", checks: preflight.checks });
    }
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
    const currentSnapshot = await this.buildCurrentSnapshot(repository.id, "preview_release", world, new Date());
    const previousRelease = latestPublishedRelease(previousReleases);
    const previousSnapshot = previousRelease ? await this.repositories.findSnapshotByReleaseId(previousRelease.id) : null;
    const changes = buildReleaseChanges(previousSnapshot?.snapshot, currentSnapshot);
    const diff = summarizeChanges(changes);
    const release = await this.repositories.createRelease({
      repositoryId: repository.id,
      version: nextVersion(previousReleases),
      note: input.releaseNote,
      license,
      diff,
      changes,
      source: "cloud-publish",
    });
    const snapshot = releaseSnapshotSchema.parse({
      repositoryId: repository.id,
      releaseId: release.id,
      world: currentSnapshot.world,
      archiveEntries: currentSnapshot.archiveEntries,
      storySeeds: currentSnapshot.storySeeds,
      conflicts: currentSnapshot.conflicts,
      assetRelations: currentSnapshot.assetRelations,
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
    await this.notifications.safeEmitUserEvent(subject.user.id, {
      type: "world_published",
      title: "世界已发布",
      body: `${world.name} 已发布到界仓。`,
      targetType: "world",
      targetId: world.id,
      metadata: { repositoryId: repository.id, releaseId: release.id },
      dedupeKey: `world-published:${release.id}`,
    });
    await this.notifications.safeEmitUserEvent(subject.user.id, {
      type: "release_published",
      title: "Release 已生成",
      body: `${repository.name} ${release.version} 已生成公开快照。`,
      targetType: "release",
      targetId: release.id,
      metadata: { repositoryId: repository.id, version: release.version },
      dedupeKey: `release-published:${release.id}`,
    });

    return {
      repository: await this.toRepositoryDetail(repository),
      release: toReleaseDetail(release),
    };
  }

  async rollbackRelease(subject: AuthSubject, releaseId: string) {
    const release = await this.repositories.findReleaseById(releaseId);
    if (!release) throw this.notFound("Release not found.");
    const repository = await this.repositories.findById(release.repositoryId);
    if (!repository) throw this.notFound("Repository not found.");
    this.requireRepositoryOwner(subject, repository);
    if (release.status !== "published") {
      throw new BadRequestException({ code: "INVALID_RELEASE_STATE", message: "Only published releases can be rolled back." });
    }
    if (!repository.worldId) {
      throw new BadRequestException({ code: "INVALID_RELEASE_SOURCE", message: "Only cloud-published releases can be rolled back." });
    }
    const publishedReleases = (await this.repositories.listReleases(repository.id)).filter((item) => item.status === "published");
    if (publishedReleases[0]?.id !== release.id) {
      throw new BadRequestException({ code: "INVALID_RELEASE_STATE", message: "Only the latest published release can be rolled back." });
    }
    const activeRelease = publishedReleases[1];
    if (!activeRelease) {
      throw new BadRequestException({ code: "INVALID_RELEASE_STATE", message: "Rollback requires a previous published release." });
    }
    const activeSnapshot = await this.requireSnapshot(activeRelease.id);
    const event = {
      type: "repository.release_rolled_back",
      aggregateId: repository.id,
      payload: {
        repositoryId: repository.id,
        releaseId: release.id,
        activeReleaseId: activeRelease.id,
      },
    };
    if (!this.repositories.rollbackReleaseWithSnapshot) {
      throw new InternalServerErrorException({
        code: "ROLLBACK_TRANSACTION_UNAVAILABLE",
        message: "Rollback requires transactional repository support.",
      });
    }

    const rolledBack = await this.repositories.rollbackReleaseWithSnapshot({
      releaseId: release.id,
      activeReleaseId: activeRelease.id,
      repositoryId: repository.id,
      worldId: repository.worldId,
      snapshot: activeSnapshot.snapshot,
      event,
    });
    if (!rolledBack) throw this.notFound("Release not found.");
    return { release: toReleaseDetail(rolledBack), activeRelease: toReleaseDetail(activeRelease) };
  }

  async getForkUpstreamDiff(subject: AuthSubject, forkId: string) {
    const fork = await this.requireOwnedFork(subject, forkId);
    return this.buildForkSyncPreview(fork);
  }

  async syncFork(subject: AuthSubject, forkId: string) {
    const fork = await this.requireOwnedFork(subject, forkId);
    const preview = await this.buildForkSyncPreview(fork);
    if (!preview.hasUpstreamChanges) {
      const updatedFork = fork.sourceReleaseId === preview.upstreamReleaseId
        ? fork
        : await this.repositories.updateForkSourceRelease(fork.id, preview.upstreamReleaseId);
      return { ...preview, sourceReleaseId: updatedFork?.sourceReleaseId ?? preview.upstreamReleaseId, applied: [], skipped: [] };
    }

    const sourceSnapshot = await this.requireSnapshot(fork.sourceReleaseId);
    const upstreamSnapshot = await this.requireSnapshot(preview.upstreamReleaseId);
    const assetMaps = await this.repositories.listForkAssetMaps(fork.id);
    const assetMapByUpstreamId = new Map(assetMaps.map((map) => [map.upstreamAssetId, map]));
    const existingTargetAssets = await this.listWorldAssetIds(fork.targetWorldId);
    const assetChanges = preview.changes.filter((change) => !isRelationChange(change));
    const relationChanges = preview.changes.filter(isRelationChange);
    const forkRelationsMatchSource = relationChanges.length === 0
      ? true
      : await this.worlds.forkAssetRelationsMatchSnapshot({
          worldId: fork.targetWorldId,
          snapshot: sourceSnapshot.snapshot,
          assetMaps,
        });
    const applied: ReleaseChange[] = [];
    const skipped: ReleaseChange[] = [];
    const appliedRemovedAssetIds: string[] = [];
    let shouldRemapForkReferences = false;

    for (const change of assetChanges) {
      if (change.kind === "added") {
        const existingMap = assetMapByUpstreamId.get(change.assetId);
        if (existingMap && existingTargetAssets.has(existingMap.targetAssetId)) {
          applied.push(change);
          continue;
        }
        const created = await this.worlds.createAssetFromSnapshot({
          worldId: fork.targetWorldId,
          upstreamAssetId: change.assetId,
          targetAssetId: deterministicForkTargetAssetId(fork.id, change.assetId),
          snapshot: upstreamSnapshot.snapshot,
        });
        if (!created) {
          skipped.push(change);
          continue;
        }
        const map = await this.repositories.upsertForkAssetMap({ forkId: fork.id, ...created });
        assetMapByUpstreamId.set(map.upstreamAssetId, map);
        existingTargetAssets.add(map.targetAssetId);
        applied.push(change);
        shouldRemapForkReferences = true;
        continue;
      }

      const targetAsset = assetMapByUpstreamId.get(change.assetId);
      const result = await this.worlds.applyForkSnapshotChange({
        worldId: fork.targetWorldId,
        targetAsset,
        assetMaps: [...assetMapByUpstreamId.values()],
        sourceSnapshot: sourceSnapshot.snapshot,
        upstreamSnapshot: upstreamSnapshot.snapshot,
        change,
      });
      if (result.status === "applied") {
        applied.push(change);
        if (change.kind === "removed") {
          appliedRemovedAssetIds.push(change.assetId);
        }
      } else {
        skipped.push(change);
      }
    }

    if (shouldRemapForkReferences) {
      await this.worlds.remapForkAssetReferences({ worldId: fork.targetWorldId, assetMaps: [...assetMapByUpstreamId.values()] });
    }

    if (relationChanges.length > 0) {
      if (skipped.length > 0) {
        skipped.push(...relationChanges);
      } else if (forkRelationsMatchSource) {
        const relationsReplaced = await this.worlds.replaceForkAssetRelationsFromSnapshot({
          worldId: fork.targetWorldId,
          snapshot: upstreamSnapshot.snapshot,
          assetMaps: [...assetMapByUpstreamId.values()],
        });
        if (relationsReplaced) {
          applied.push(...relationChanges);
        } else {
          skipped.push(...relationChanges);
        }
      } else {
        const forkRelationsMatchUpstream = await this.worlds.forkAssetRelationsMatchSnapshot({
          worldId: fork.targetWorldId,
          snapshot: upstreamSnapshot.snapshot,
          assetMaps: [...assetMapByUpstreamId.values()],
        });
        if (forkRelationsMatchUpstream) {
          applied.push(...relationChanges);
        } else {
          skipped.push(...relationChanges);
        }
      }
    }

    const updatedFork = skipped.length === 0
      ? await this.repositories.updateForkSourceRelease(fork.id, preview.upstreamReleaseId)
      : fork;
    if (skipped.length === 0) {
      for (const assetId of appliedRemovedAssetIds) {
        await this.repositories.deleteForkAssetMap(fork.id, assetId);
      }
    }
    await this.emitRepositoryEvent("repository.fork_synced", fork.repositoryId, {
      repositoryId: fork.repositoryId,
      forkId: fork.id,
      sourceReleaseId: updatedFork?.sourceReleaseId ?? fork.sourceReleaseId,
      applied: applied.map((change) => change.assetId),
      skipped: skipped.map((change) => change.assetId),
    });
    return { ...preview, sourceReleaseId: updatedFork?.sourceReleaseId ?? fork.sourceReleaseId, applied, skipped };
  }

  private async listWorldAssetIds(worldId: string) {
    const [archiveEntries, storySeeds, conflicts] = await Promise.all([
      this.worlds.listArchiveEntries(worldId),
      this.worlds.listStorySeeds(worldId),
      this.worlds.listConflicts(worldId),
    ]);
    return new Set([
      ...archiveEntries.map((entry) => `archive:${entry.id}`),
      ...storySeeds.map((seed) => `seed:${seed.id}`),
      ...conflicts.map((conflict) => `conflict:${conflict.id}`),
    ]);
  }

  async detachFork(subject: AuthSubject, forkId: string) {
    const fork = await this.requireOwnedFork(subject, forkId);
    const deleted = await this.repositories.deleteFork(fork.id);
    if (!deleted) throw this.notFound("Fork not found.");
    await this.emitRepositoryEvent("repository.fork_detached", fork.repositoryId, { repositoryId: fork.repositoryId, forkId: fork.id });
    return { forkId: fork.id, detached: true };
  }

  private async buildCurrentSnapshot(repositoryId: string, releaseId: string, world: WorldRecord, createdAt: Date) {
    const [archiveEntries, storySeeds, conflicts, assetRelations] = await Promise.all([
      this.worlds.listArchiveEntries(world.id),
      this.worlds.listStorySeeds(world.id),
      this.worlds.listConflicts(world.id),
      this.worlds.listAssetRelations(world.id),
    ]);
    return releaseSnapshotSchema.parse({
      repositoryId,
      releaseId,
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
      assetRelations,
      createdAt: createdAt.toISOString(),
    });
  }

  private async buildForkSyncPreview(fork: ForkRecord) {
    const upstreamRelease = latestPublishedRelease(await this.repositories.listReleases(fork.repositoryId));
    if (!upstreamRelease) throw this.notFound("Release not found.");
    const sourceSnapshot = await this.requireSnapshot(fork.sourceReleaseId);
    const upstreamSnapshot = await this.requireSnapshot(upstreamRelease.id);
    const changes = buildReleaseChanges(sourceSnapshot.snapshot, upstreamSnapshot.snapshot);
    return {
      forkId: fork.id,
      repositoryId: fork.repositoryId,
      sourceReleaseId: fork.sourceReleaseId,
      upstreamReleaseId: upstreamRelease.id,
      hasUpstreamChanges: changes.length > 0,
      changes,
    };
  }

  private async requireSnapshot(releaseId: string) {
    const snapshot = await this.repositories.findSnapshotByReleaseId(releaseId);
    if (!snapshot) throw this.notFound("Release snapshot not found.");
    return snapshot;
  }

  private async requireOwnedFork(subject: AuthSubject, forkId: string) {
    const fork = await this.repositories.findForkById(forkId);
    if (!fork) throw this.notFound("Fork not found.");
    if (fork.userId !== subject.user.id) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not have access to this fork." });
    }
    return fork;
  }

  private requireRepositoryOwner(subject: AuthSubject, repository: PublicRepositoryRecord) {
    if (repository.ownerId !== subject.user.id) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not have access to this repository." });
    }
  }

  private async toRepositoryDetail(repository: PublicRepositoryRecord) {
    const releases = await this.repositories.listReleases(repository.id);
    const latest = latestPublishedRelease(releases);
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
    status: release.status,
    note: release.note,
    license: release.license,
    diff: release.diff,
    changes: release.changes,
    createdAt: release.createdAt.toISOString(),
  };
}

function toReleaseSummary(release: ReleaseRecord) {
  return {
    version: release.version,
    status: release.status,
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

function buildReleaseChanges(before: ReleaseSnapshot | null | undefined, after: ReleaseSnapshot): ReleaseChange[] {
  const beforeAssets = before ? snapshotAssetMap(before) : new Map<string, SnapshotAsset>();
  const afterAssets = snapshotAssetMap(after);
  const beforeRelations = before ? snapshotRelationMap(before) : new Map<string, SnapshotAsset>();
  const afterRelations = snapshotRelationMap(after);
  const changes: ReleaseChange[] = [];

  for (const [assetId, asset] of afterAssets) {
    const previous = beforeAssets.get(assetId);
    if (!previous) {
      changes.push({ assetId, kind: "added", title: asset.title, afterHash: asset.hash });
    } else if (previous.hash !== asset.hash) {
      changes.push({ assetId, kind: "changed", title: asset.title, beforeHash: previous.hash, afterHash: asset.hash });
    }
  }

  for (const [assetId, asset] of beforeAssets) {
    if (!afterAssets.has(assetId)) {
      changes.push({ assetId, kind: "removed", title: asset.title, beforeHash: asset.hash });
    }
  }

  for (const [assetId, relation] of afterRelations) {
    if (!beforeRelations.has(assetId)) {
      changes.push({ assetId, kind: "added", title: relation.title, afterHash: relation.hash });
    }
  }

  for (const [assetId, relation] of beforeRelations) {
    if (!afterRelations.has(assetId)) {
      changes.push({ assetId, kind: "removed", title: relation.title, beforeHash: relation.hash });
    }
  }

  return changes.sort((left, right) => left.assetId.localeCompare(right.assetId));
}

function summarizeChanges(changes: ReleaseChange[]): ReleaseDiff {
  return {
    addedSettings: changes.filter((change) => change.kind === "added" && change.assetId.startsWith("archive:")).length,
    changedSettings: changes.filter((change) => change.kind === "changed" && change.assetId.startsWith("archive:")).length,
    removedSettings: changes.filter((change) => change.kind === "removed" && change.assetId.startsWith("archive:")).length,
    addedSeeds: changes.filter((change) => change.kind === "added" && change.assetId.startsWith("seed:")).length,
  };
}

type SnapshotAsset = {
  title: string;
  hash: string;
};

function snapshotAssetMap(snapshot: ReleaseSnapshot) {
  const assets = new Map<string, SnapshotAsset>();
  for (const entry of snapshot.archiveEntries) {
    assets.set(`archive:${entry.id}`, { title: entry.title, hash: stableHash(entry) });
  }
  for (const seed of snapshot.storySeeds) {
    assets.set(`seed:${seed.id}`, { title: seed.title, hash: stableHash(seed) });
  }
  for (const conflict of snapshot.conflicts) {
    assets.set(`conflict:${conflict.id}`, { title: conflict.title, hash: stableHash(conflict) });
  }
  return assets;
}

function snapshotRelationMap(snapshot: ReleaseSnapshot) {
  const relations = new Map<string, SnapshotAsset>();
  for (const relation of snapshot.assetRelations) {
    const relationHash = stableHash(relation);
    relations.set(`relation:${relationHash}`, {
      title: `Relation ${relation.sourceAssetId} -> ${relation.targetAssetId}`,
      hash: relationHash,
    });
  }
  return relations;
}

function isRelationChange(change: ReleaseChange) {
  return change.assetId.startsWith("relation:");
}

function stableHash(value: unknown) {
  return createHash("sha256").update(stableStringify(stripTimestampFields(value))).digest("hex").slice(0, 16);
}

function countSnapshotAssets(snapshot: ReleaseSnapshot) {
  return snapshot.archiveEntries.length + snapshot.storySeeds.length + snapshot.conflicts.length;
}

function moderationPreScanPasses(world: WorldRecord, releaseNote: string) {
  const text = `${world.name}\n${world.summary}\n${world.tags.join(" ")}\n${releaseNote}`.toLowerCase();
  return !["malware", "credential leak", "api key", "spam-only"].some((term) => text.includes(term));
}

function nextVersion(previousReleases: ReleaseRecord[]) {
  if (previousReleases.length === 0) return "v1.0.0";
  const latest = previousReleases[0]?.version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!latest) return `v1.${previousReleases.length}.0`;
  return `v${latest[1]}.${Number(latest[2]) + 1}.0`;
}

function latestPublishedRelease(releases: ReleaseRecord[]) {
  return releases.find((release) => release.status === "published") ?? null;
}

function snapshotAssetIds(snapshot: ReleaseSnapshot) {
  return [
    ...snapshot.archiveEntries.map((entry) => `archive:${entry.id}`),
    ...snapshot.storySeeds.map((seed) => `seed:${seed.id}`),
    ...snapshot.conflicts.map((conflict) => `conflict:${conflict.id}`),
  ];
}

function deterministicForkTargetAssetId(forkId: string, upstreamAssetId: string) {
  const parsed = parseTypedAssetId(upstreamAssetId);
  if (!parsed) return undefined;
  const digest = createHash("sha256").update(`${forkId}\0${upstreamAssetId}`).digest("hex").slice(0, 24);
  return `${parsed.kind}:${parsed.kind}_${digest}`;
}

function parseTypedAssetId(assetId: string) {
  const separator = assetId.indexOf(":");
  if (separator === -1) return null;
  const kind = assetId.slice(0, separator);
  const id = assetId.slice(separator + 1);
  if (!id || (kind !== "archive" && kind !== "seed" && kind !== "conflict")) return null;
  return { kind, id } as const;
}

function stripTimestampFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripTimestampFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["createdAt", "updatedAt"].includes(key))
      .map(([key, nested]) => [key, stripTimestampFields(nested)]),
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
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
