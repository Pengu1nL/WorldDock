import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { moderationStatusSchema, releaseChangeSchema, releaseDiffSchema, releaseSnapshotSchema, releaseStatusSchema } from "@worlddock/domain";
import type { ForkAssetMapRecord, ForkRecord, PublicRepositoryRecord, ReleaseRecord, ReleaseSnapshotRecord, RepositoryCollectionRecord, RepositoryRepository } from "./repository.repository";

@Injectable()
export class PrismaRepositoryRepository implements RepositoryRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async findById(id: string) {
    const repository = await this.prisma.publicRepository.findUnique({ where: { id } });
    return repository ? mapRepository(repository) : null;
  }

  async findByWorldId(worldId: string) {
    const repository = await this.prisma.publicRepository.findUnique({ where: { worldId } });
    return repository ? mapRepository(repository) : null;
  }

  async createRepository(input: Parameters<RepositoryRepository["createRepository"]>[0]) {
    const repository = await this.prisma.publicRepository.create({ data: input });
    return mapRepository(repository);
  }

  async updateRepository(id: string, input: Parameters<RepositoryRepository["updateRepository"]>[1]) {
    const updated = await this.prisma.publicRepository.updateMany({ where: { id }, data: input });
    if (updated.count === 0) return null;
    const repository = await this.prisma.publicRepository.findUnique({ where: { id } });
    return repository ? mapRepository(repository) : null;
  }

  async listPublic() {
    const repositories = await this.prisma.publicRepository.findMany({
      where: { moderationStatus: { not: "removed" } },
      orderBy: { updatedAt: "desc" },
    });
    return repositories.map(mapRepository);
  }

  async findPublicByOwnerSlug(ownerName: string, slug: string) {
    const repository = await this.prisma.publicRepository.findUnique({
      where: { ownerName_slug: { ownerName, slug } },
    });
    return repository && repository.moderationStatus !== "removed" ? mapRepository(repository) : null;
  }

  async setModerationStatus(id: string, input: Parameters<RepositoryRepository["setModerationStatus"]>[1]) {
    const updated = await this.prisma.publicRepository.updateMany({
      where: { id },
      data: {
        moderationStatus: input.status,
        moderationReason: input.reason ?? null,
        moderatedAt: input.moderatedAt,
      },
    });
    if (updated.count === 0) return null;
    const repository = await this.prisma.publicRepository.findUnique({ where: { id } });
    return repository ? mapRepository(repository) : null;
  }

  async createRelease(input: Parameters<RepositoryRepository["createRelease"]>[0]) {
    const release = await this.prisma.repositoryRelease.create({
      data: {
        ...input,
        status: input.status ?? "published",
        changes: input.changes ?? [],
      } as never,
    });
    return mapRelease(release);
  }

  async findReleaseById(id: string) {
    const release = await this.prisma.repositoryRelease.findUnique({ where: { id } });
    return release ? mapRelease(release) : null;
  }

  async updateReleaseStatus(id: string, status: Parameters<RepositoryRepository["updateReleaseStatus"]>[1]) {
    const updated = await this.prisma.repositoryRelease.updateMany({ where: { id }, data: { status } });
    if (updated.count === 0) return null;
    return this.findReleaseById(id);
  }

  async rollbackReleaseWithSnapshot(input: NonNullable<RepositoryRepository["rollbackReleaseWithSnapshot"]> extends (input: infer Input) => unknown ? Input : never) {
    const release = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.repositoryRelease.updateMany({
        where: { id: input.releaseId, repositoryId: input.repositoryId, status: "published" },
        data: { status: "rolled_back" },
      });
      if (updated.count === 0) return null;
      await restoreWorldFromSnapshot(tx, input.worldId, input.snapshot);
      await tx.outboxEvent.create({ data: input.event as never });
      return tx.repositoryRelease.findUnique({ where: { id: input.releaseId } });
    });
    return release ? mapRelease(release) : null;
  }

  async listReleases(repositoryId: string) {
    const releases = await this.prisma.repositoryRelease.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "desc" },
    });
    return releases.map(mapRelease);
  }

  async createSnapshot(input: Parameters<RepositoryRepository["createSnapshot"]>[0]) {
    const snapshot = await this.prisma.releaseSnapshot.create({ data: input as never });
    return mapSnapshot(snapshot);
  }

  async findSnapshotByReleaseId(releaseId: string) {
    const snapshot = await this.prisma.releaseSnapshot.findUnique({ where: { releaseId } });
    return snapshot ? mapSnapshot(snapshot) : null;
  }

  async starRepository(repositoryId: string, userId: string) {
    await this.prisma.repositoryStar.upsert({
      where: { repositoryId_userId: { repositoryId, userId } },
      create: { repositoryId, userId },
      update: {},
    });
    const stars = await this.prisma.repositoryStar.count({ where: { repositoryId } });
    const repository = await this.prisma.publicRepository.update({
      where: { id: repositoryId },
      data: { stars },
    });
    return mapRepository(repository);
  }

  async unstarRepository(repositoryId: string, userId: string) {
    await this.prisma.repositoryStar.deleteMany({ where: { repositoryId, userId } });
    const stars = await this.prisma.repositoryStar.count({ where: { repositoryId } });
    const repository = await this.prisma.publicRepository.update({
      where: { id: repositoryId },
      data: { stars },
    });
    return mapRepository(repository);
  }

  async createFork(input: Parameters<RepositoryRepository["createFork"]>[0]) {
    const fork = await this.prisma.repositoryFork.create({ data: input });
    const forks = await this.prisma.repositoryFork.count({ where: { repositoryId: input.repositoryId } });
    await this.prisma.publicRepository.update({ where: { id: input.repositoryId }, data: { forks } });
    return fork;
  }

  async findForkById(id: string) {
    const fork = await this.prisma.repositoryFork.findUnique({ where: { id } });
    return fork ? mapFork(fork) : null;
  }

  async updateForkSourceRelease(id: string, sourceReleaseId: string) {
    const updated = await this.prisma.repositoryFork.updateMany({ where: { id }, data: { sourceReleaseId } });
    if (updated.count === 0) return null;
    return this.findForkById(id);
  }

  async deleteFork(id: string) {
    const fork = await this.findForkById(id);
    if (!fork) return null;
    await this.prisma.repositoryFork.delete({ where: { id } });
    const forks = await this.prisma.repositoryFork.count({ where: { repositoryId: fork.repositoryId } });
    await this.prisma.publicRepository.update({ where: { id: fork.repositoryId }, data: { forks } });
    return fork;
  }

  async listForksForRepository(repositoryId: string) {
    const forks = await this.prisma.repositoryFork.findMany({ where: { repositoryId }, orderBy: { createdAt: "desc" } });
    return forks.map(mapFork);
  }

  async createForkAssetMaps(input: Parameters<RepositoryRepository["createForkAssetMaps"]>[0]) {
    if (input.length === 0) return [];
    await this.prisma.repositoryForkAssetMap.createMany({ data: input });
    const forkIds = [...new Set(input.map((item) => item.forkId))];
    const upstreamAssetIds = input.map((item) => item.upstreamAssetId);
    const maps = await this.prisma.repositoryForkAssetMap.findMany({
      where: { forkId: { in: forkIds }, upstreamAssetId: { in: upstreamAssetIds } },
      orderBy: { createdAt: "asc" },
    });
    return maps.map(mapForkAssetMap);
  }

  async listForkAssetMaps(forkId: string) {
    const maps = await this.prisma.repositoryForkAssetMap.findMany({
      where: { forkId },
      orderBy: { createdAt: "asc" },
    });
    return maps.map(mapForkAssetMap);
  }

  async upsertForkAssetMap(input: Parameters<RepositoryRepository["upsertForkAssetMap"]>[0]) {
    const map = await this.prisma.repositoryForkAssetMap.upsert({
      where: { forkId_upstreamAssetId: { forkId: input.forkId, upstreamAssetId: input.upstreamAssetId } },
      create: input,
      update: {
        targetAssetId: input.targetAssetId,
        kind: input.kind,
      },
    });
    return mapForkAssetMap(map);
  }

  async deleteForkAssetMap(forkId: string, upstreamAssetId: string) {
    const map = await this.prisma.repositoryForkAssetMap.findUnique({
      where: { forkId_upstreamAssetId: { forkId, upstreamAssetId } },
    });
    if (!map) return null;
    await this.prisma.repositoryForkAssetMap.delete({ where: { id: map.id } });
    return mapForkAssetMap(map);
  }

  async saveToCollection(input: Parameters<RepositoryRepository["saveToCollection"]>[0]) {
    const collection = await this.prisma.repositoryCollection.upsert({
      where: {
        repositoryId_userId_name: {
          repositoryId: input.repositoryId,
          userId: input.userId,
          name: input.name ?? "saved",
        },
      },
      create: {
        repositoryId: input.repositoryId,
        userId: input.userId,
        name: input.name ?? "saved",
      },
      update: {},
    });
    return mapCollection(collection);
  }

  async removeFromCollection(input: Parameters<RepositoryRepository["removeFromCollection"]>[0]) {
    const collection = await this.prisma.repositoryCollection.findFirst({
      where: {
        id: input.collectionId,
        repositoryId: input.repositoryId,
        userId: input.userId,
      },
    });
    if (!collection) return null;
    await this.prisma.repositoryCollection.delete({ where: { id: collection.id } });
    return mapCollection(collection);
  }

  async listCollectionsForUser(userId: string) {
    const collections = await this.prisma.repositoryCollection.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return collections.map(mapCollection);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapRepository(record: Omit<PublicRepositoryRecord, "moderationStatus"> & { moderationStatus: string }): PublicRepositoryRecord {
  return {
    ...record,
    moderationStatus: moderationStatusSchema.parse(record.moderationStatus),
  };
}

function mapRelease(record: {
  id: string;
  repositoryId: string;
  version: string;
  status: string;
  note: string;
  license: string;
  diff: unknown;
  changes: unknown;
  source: string;
  createdAt: Date;
}): ReleaseRecord {
  return {
    id: record.id,
    repositoryId: record.repositoryId,
    version: record.version,
    status: releaseStatusSchema.parse(record.status),
    note: record.note,
    license: record.license,
    diff: releaseDiffSchema.parse(record.diff),
    changes: zodReleaseChanges(record.changes),
    source: parseReleaseSource(record.source),
    createdAt: record.createdAt,
  };
}

function zodReleaseChanges(value: unknown) {
  return releaseChangeSchema.array().parse(value);
}

function mapSnapshot(record: {
  id: string;
  repositoryId: string;
  releaseId: string;
  snapshot: unknown;
  createdAt: Date;
}): ReleaseSnapshotRecord {
  return {
    id: record.id,
    repositoryId: record.repositoryId,
    releaseId: record.releaseId,
    snapshot: releaseSnapshotSchema.parse(record.snapshot),
    createdAt: record.createdAt,
  };
}

function parseReleaseSource(value: string): ReleaseRecord["source"] {
  if (value === "cloud-publish" || value === "local-push") return value;
  throw new Error(`Unknown release source: ${value}`);
}

function mapFork(record: ForkRecord): ForkRecord {
  return record;
}

function mapForkAssetMap(record: Omit<ForkAssetMapRecord, "kind"> & { kind: string }): ForkAssetMapRecord {
  return {
    ...record,
    kind: parseForkAssetKind(record.kind),
  };
}

function parseForkAssetKind(value: string): ForkAssetMapRecord["kind"] {
  if (value === "archive" || value === "seed" || value === "conflict") return value;
  throw new Error(`Unknown fork asset map kind: ${value}`);
}

function mapCollection(record: RepositoryCollectionRecord): RepositoryCollectionRecord {
  return record;
}

async function restoreWorldFromSnapshot(tx: any, worldId: string, snapshot: ReleaseSnapshotRecord["snapshot"]) {
  await tx.archiveEntry.deleteMany({ where: { worldId } });
  await tx.storySeed.deleteMany({ where: { worldId } });
  await tx.conflict.deleteMany({ where: { worldId } });
  await tx.world.update({
    where: { id: worldId },
    data: {
      name: snapshot.world.name,
      type: snapshot.world.type,
      summary: snapshot.world.summary,
      tags: snapshot.world.tags,
      maturity: snapshot.world.maturity,
      status: "published",
      visibility: "public",
    },
  });
  for (const entry of snapshot.archiveEntries) {
    await tx.archiveEntry.create({
      data: {
        id: entry.id,
        worldId,
        title: entry.title,
        category: entry.category,
        summary: entry.summary,
        body: entry.body,
        relations: entry.relations ?? [],
      },
    });
  }
  for (const seed of snapshot.storySeeds) {
    await tx.storySeed.create({
      data: {
        id: seed.id,
        worldId,
        title: seed.title,
        hook: seed.hook,
        trigger: seed.trigger,
        conflict: seed.conflict,
        protagonists: seed.protagonists,
        questions: seed.questions ?? [],
      },
    });
  }
  for (const conflict of snapshot.conflicts) {
    await tx.conflict.create({
      data: {
        id: conflict.id,
        worldId,
        title: conflict.title,
        summary: conflict.summary,
        body: conflict.body,
        related: conflict.related ?? [],
        derivedSeeds: conflict.derivedSeeds ?? [],
      },
    });
  }
  await tx.worldAssetRelation.deleteMany({ where: { worldId } });
  const snapshotAssetIds = new Set([
    ...snapshot.archiveEntries.map((entry) => entry.id),
    ...snapshot.storySeeds.map((seed) => seed.id),
    ...snapshot.conflicts.map((conflict) => conflict.id),
  ]);
  for (const relation of snapshot.assetRelations) {
    if (!snapshotAssetIds.has(relation.sourceAssetId) || !snapshotAssetIds.has(relation.targetAssetId)) continue;
    await tx.worldAssetRelation.create({
      data: { worldId, sourceAssetId: relation.sourceAssetId, targetAssetId: relation.targetAssetId },
    });
  }
}
