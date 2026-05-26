import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { storageObjectStatusSchema, storagePurposeSchema, storageVisibilitySchema } from "@worlddock/domain";
import type { StorageObjectRecord, StorageRepository } from "./storage.repository";

@Injectable()
export class PrismaStorageRepository implements StorageRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createObject(input: Parameters<StorageRepository["createObject"]>[0]) {
    const object = await this.prisma.storageObject.create({ data: input });
    return mapStorageObject(object);
  }

  async findObjectById(id: string) {
    const object = await this.prisma.storageObject.findUnique({ where: { id } });
    return object ? mapStorageObject(object) : null;
  }

  async attachObject(id: string, input: Parameters<StorageRepository["attachObject"]>[1]) {
    const updated = await this.prisma.storageObject.updateMany({
      where: { id, deletedAt: null },
      data: { ...input, status: "attached" },
    });
    if (updated.count === 0) return null;
    return this.findObjectById(id);
  }

  async markDeleted(id: string, deletedAt: Date) {
    const updated = await this.prisma.storageObject.updateMany({
      where: { id },
      data: { status: "deleted", deletedAt },
    });
    if (updated.count === 0) return null;
    return this.findObjectById(id);
  }

  async listCleanupCandidates(before: Date, limit = 100) {
    const objects = await this.prisma.storageObject.findMany({
      where: {
        deletedAt: null,
        status: { in: ["pending", "orphaned"] },
        createdAt: { lt: before },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return objects.map(mapStorageObject);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapStorageObject(record: {
  id: string;
  ownerId: string;
  bucket: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  purpose: string;
  visibility: string;
  status: string;
  worldId: string | null;
  repositoryId: string | null;
  releaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): StorageObjectRecord {
  return {
    ...record,
    purpose: storagePurposeSchema.parse(record.purpose),
    visibility: storageVisibilitySchema.parse(record.visibility),
    status: storageObjectStatusSchema.parse(record.status),
  };
}
