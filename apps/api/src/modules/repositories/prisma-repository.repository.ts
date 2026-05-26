import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { releaseDiffSchema, releaseSnapshotSchema } from "@worlddock/domain";
import type { PublicRepositoryRecord, ReleaseRecord, ReleaseSnapshotRecord, RepositoryRepository } from "./repository.repository";

@Injectable()
export class PrismaRepositoryRepository implements RepositoryRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

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
    const repositories = await this.prisma.publicRepository.findMany({ orderBy: { updatedAt: "desc" } });
    return repositories.map(mapRepository);
  }

  async findPublicByOwnerSlug(ownerName: string, slug: string) {
    const repository = await this.prisma.publicRepository.findUnique({
      where: { ownerName_slug: { ownerName, slug } },
    });
    return repository ? mapRepository(repository) : null;
  }

  async createRelease(input: Parameters<RepositoryRepository["createRelease"]>[0]) {
    const release = await this.prisma.repositoryRelease.create({ data: input as never });
    return mapRelease(release);
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

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapRepository(record: PublicRepositoryRecord): PublicRepositoryRecord {
  return record;
}

function mapRelease(record: {
  id: string;
  repositoryId: string;
  version: string;
  note: string;
  license: string;
  diff: unknown;
  source: string;
  createdAt: Date;
}): ReleaseRecord {
  return {
    id: record.id,
    repositoryId: record.repositoryId,
    version: record.version,
    note: record.note,
    license: record.license,
    diff: releaseDiffSchema.parse(record.diff),
    source: parseReleaseSource(record.source),
    createdAt: record.createdAt,
  };
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
