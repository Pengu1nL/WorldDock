import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type { AssetCounts, WorldRepository } from "./world.repository";

@Injectable()
export class PrismaWorldRepository implements WorldRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createWorld(input: Parameters<WorldRepository["createWorld"]>[0]) {
    return this.prisma.world.create({
      data: {
        ownerId: input.ownerId,
        name: input.name,
        type: input.type,
        summary: input.summary,
        tags: input.tags,
        mode: input.mode,
        maturity: input.maturity ?? 0,
      },
    }) as ReturnType<WorldRepository["createWorld"]>;
  }

  async listWorlds(ownerId: string) {
    return this.prisma.world.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    }) as ReturnType<WorldRepository["listWorlds"]>;
  }

  async findWorldById(id: string) {
    return this.prisma.world.findUnique({ where: { id } }) as ReturnType<WorldRepository["findWorldById"]>;
  }

  async updateWorld(id: string, input: Parameters<WorldRepository["updateWorld"]>[1]) {
    const updated = await this.prisma.world.updateMany({
      where: { id },
      data: input,
    });
    if (updated.count === 0) return null;
    return this.findWorldById(id);
  }

  async archiveWorld(id: string) {
    return this.updateWorld(id, { status: "unpublished" });
  }

  async listArchiveEntries(worldId: string) {
    return this.prisma.archiveEntry.findMany({
      where: { worldId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createArchiveEntry(input: Parameters<WorldRepository["createArchiveEntry"]>[0]) {
    return this.prisma.archiveEntry.create({ data: input });
  }

  async listStorySeeds(worldId: string) {
    return this.prisma.storySeed.findMany({
      where: { worldId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createStorySeed(input: Parameters<WorldRepository["createStorySeed"]>[0]) {
    return this.prisma.storySeed.create({ data: input });
  }

  async listConflicts(worldId: string) {
    return this.prisma.conflict.findMany({
      where: { worldId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createConflict(input: Parameters<WorldRepository["createConflict"]>[0]) {
    return this.prisma.conflict.create({ data: input });
  }

  async countAssets(worldId: string): Promise<AssetCounts> {
    const [archive, seeds, conflicts] = await Promise.all([
      this.prisma.archiveEntry.count({ where: { worldId } }),
      this.prisma.storySeed.count({ where: { worldId } }),
      this.prisma.conflict.count({ where: { worldId } }),
    ]);

    return { archive, seeds, conflicts };
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
