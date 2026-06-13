import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type { AssetCounts, WorldRepository } from "./world.repository";

@Injectable()
export class PrismaWorldRepository implements WorldRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createWorld(input: Parameters<WorldRepository["createWorld"]>[0]) {
    return this.prisma.world.create({
      data: {
        name: input.name,
        type: input.type,
        summary: input.summary,
        tags: input.tags,
        mode: input.mode,
        maturity: input.maturity ?? 0,
      },
    }) as ReturnType<WorldRepository["createWorld"]>;
  }

  async listWorlds() {
    return this.prisma.world.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
    }) as ReturnType<WorldRepository["listWorlds"]>;
  }

  async findWorldById(id: string) {
    return this.prisma.world.findFirst({ where: { id, deletedAt: null } }) as ReturnType<WorldRepository["findWorldById"]>;
  }

  async updateWorld(id: string, input: Parameters<WorldRepository["updateWorld"]>[1]) {
    const updated = await this.prisma.world.updateMany({
      where: { id, deletedAt: null },
      data: input,
    });
    if (updated.count === 0) return null;
    return this.prisma.world.findUnique({ where: { id } }) as ReturnType<WorldRepository["updateWorld"]>;
  }

  async deleteWorld(id: string) {
    return this.updateWorld(id, { status: "unpublished", deletedAt: new Date() });
  }

  async duplicateWorldAssets(input: { sourceWorldId: string; targetWorldId: string }) {
    const { sourceWorldId, targetWorldId } = input;
    await this.prisma.$transaction(async (tx) => {
      const [archiveEntries, storySeeds, conflicts, relations] = await Promise.all([
        tx.archiveEntry.findMany({ where: { worldId: sourceWorldId } }),
        tx.storySeed.findMany({ where: { worldId: sourceWorldId } }),
        tx.conflict.findMany({ where: { worldId: sourceWorldId } }),
        tx.worldAssetRelation.findMany({ where: { worldId: sourceWorldId } }),
      ]);

      const idMap = new Map<string, string>();
      const createdArchives: Array<{ id: string; relations: string[] }> = [];
      const createdConflicts: Array<{ id: string; related: string[]; derivedSeeds: string[] }> = [];

      for (const entry of archiveEntries) {
        const created = await tx.archiveEntry.create({
          data: {
            worldId: targetWorldId,
            title: entry.title,
            category: entry.category,
            summary: entry.summary,
            body: entry.body,
            relations: entry.relations,
            position: entry.position,
          },
        });
        idMap.set(entry.id, created.id);
        createdArchives.push({ id: created.id, relations: entry.relations });
      }

      for (const seed of storySeeds) {
        const created = await tx.storySeed.create({
          data: {
            worldId: targetWorldId,
            title: seed.title,
            hook: seed.hook,
            trigger: seed.trigger,
            conflict: seed.conflict,
            protagonists: seed.protagonists,
            questions: seed.questions,
            position: seed.position,
          },
        });
        idMap.set(seed.id, created.id);
      }

      for (const conflict of conflicts) {
        const created = await tx.conflict.create({
          data: {
            worldId: targetWorldId,
            title: conflict.title,
            summary: conflict.summary,
            body: conflict.body,
            related: conflict.related,
            derivedSeeds: conflict.derivedSeeds,
            position: conflict.position,
          },
        });
        idMap.set(conflict.id, created.id);
        createdConflicts.push({
          id: created.id,
          related: conflict.related,
          derivedSeeds: conflict.derivedSeeds,
        });
      }

      for (const archive of createdArchives) {
        await tx.archiveEntry.update({
          where: { id: archive.id },
          data: { relations: remapAssetIds(archive.relations, idMap) },
        });
      }

      for (const conflict of createdConflicts) {
        await tx.conflict.update({
          where: { id: conflict.id },
          data: {
            related: remapAssetIds(conflict.related, idMap),
            derivedSeeds: remapAssetIds(conflict.derivedSeeds, idMap),
          },
        });
      }

      for (const relation of relations) {
        const sourceAssetId = idMap.get(relation.sourceAssetId);
        const targetAssetId = idMap.get(relation.targetAssetId);
        if (!sourceAssetId || !targetAssetId) continue;
        await tx.worldAssetRelation.create({
          data: { worldId: targetWorldId, sourceAssetId, targetAssetId },
        });
      }
    });
  }

  async listArchiveEntries(worldId: string) {
    return this.prisma.archiveEntry.findMany({
      where: { worldId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  async createArchiveEntry(input: Parameters<WorldRepository["createArchiveEntry"]>[0]) {
    return this.prisma.archiveEntry.create({ data: input });
  }

  async listStorySeeds(worldId: string) {
    return this.prisma.storySeed.findMany({
      where: { worldId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  async createStorySeed(input: Parameters<WorldRepository["createStorySeed"]>[0]) {
    return this.prisma.storySeed.create({ data: input });
  }

  async listConflicts(worldId: string) {
    return this.prisma.conflict.findMany({
      where: { worldId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  async createConflict(input: Parameters<WorldRepository["createConflict"]>[0]) {
    return this.prisma.conflict.create({ data: input });
  }

  async listAssetRelations(worldId: string) {
    const relations = await this.prisma.worldAssetRelation.findMany({
      where: { worldId },
      orderBy: { createdAt: "asc" },
    });
    return relations.map((relation) => ({
      sourceAssetId: relation.sourceAssetId,
      targetAssetId: relation.targetAssetId,
    }));
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

function remapAssetIds(values: string[], idMap: Map<string, string>) {
  return values.map((value) => idMap.get(value) ?? value);
}
