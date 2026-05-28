import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type { WorldAsset, WorldAssetKind } from "@worlddock/domain";

export type WorldAssetRecord = WorldAsset;

export type CreateWorldAssetInput = {
  kind: WorldAssetKind;
  title: string;
  category?: string;
  summary: string;
  body?: string;
  payload?: Record<string, unknown>;
  position?: number;
};

export type UpdateWorldAssetInput = Partial<Omit<CreateWorldAssetInput, "kind">>;

@Injectable()
export class WorldAssetsService implements OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async listAssets(worldId: string, query: { kind?: WorldAssetKind; q?: string; cursor?: string }) {
    const [archiveEntries, storySeeds, conflicts] = await Promise.all([
      query.kind && query.kind !== "setting" ? [] : this.prisma.archiveEntry.findMany({ where: { worldId } }),
      query.kind && query.kind !== "seed" ? [] : this.prisma.storySeed.findMany({ where: { worldId } }),
      query.kind && query.kind !== "conflict" ? [] : this.prisma.conflict.findMany({ where: { worldId } }),
    ]);
    let assets = [
      ...archiveEntries.map(mapArchiveEntry),
      ...storySeeds.map(mapStorySeed),
      ...conflicts.map(mapConflict),
    ].sort((a, b) => a.position - b.position || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    if (query.q) {
      const keyword = query.q.toLowerCase();
      assets = assets.filter((asset) =>
        asset.title.toLowerCase().includes(keyword) ||
        asset.summary.toLowerCase().includes(keyword) ||
        asset.body?.toLowerCase().includes(keyword),
      );
    }
    if (query.cursor) {
      const cursorIndex = assets.findIndex((asset) => asset.id === query.cursor);
      if (cursorIndex >= 0) assets = assets.slice(cursorIndex + 1);
    }

    return { assets: assets.slice(0, 50), nextCursor: assets.length > 50 ? assets[49]?.id ?? null : null };
  }

  async createAsset(worldId: string, input: CreateWorldAssetInput) {
    if (input.kind === "setting") {
      return mapArchiveEntry(await this.prisma.archiveEntry.create({
        data: {
          worldId,
          title: input.title,
          category: input.category ?? "世界设定",
          summary: input.summary,
          body: input.body ?? input.summary,
          relations: readStringArray(input.payload?.relations),
          position: input.position ?? 0,
        },
      }));
    }
    if (input.kind === "seed") {
      return mapStorySeed(await this.prisma.storySeed.create({
        data: {
          worldId,
          title: input.title,
          hook: readString(input.payload?.hook) ?? input.summary,
          trigger: readString(input.payload?.trigger),
          conflict: readString(input.payload?.conflict) ?? input.body ?? input.summary,
          protagonists: readString(input.payload?.protagonists),
          questions: readStringArray(input.payload?.questions),
          position: input.position ?? 0,
        },
      }));
    }
    return mapConflict(await this.prisma.conflict.create({
      data: {
        worldId,
        title: input.title,
        summary: input.summary,
        body: input.body ?? input.summary,
        related: readStringArray(input.payload?.related),
        derivedSeeds: readStringArray(input.payload?.derivedSeeds),
        position: input.position ?? 0,
      },
    }));
  }

  async getAsset(worldId: string, assetId: string) {
    const raw = await this.findRawAsset(worldId, assetId);
    return raw ? mapRawAsset(raw) : null;
  }

  async updateAsset(worldId: string, assetId: string, input: UpdateWorldAssetInput) {
    const raw = await this.findRawAsset(worldId, assetId);
    if (!raw) return null;
    if (raw.kind === "setting") {
      return mapArchiveEntry(await this.prisma.archiveEntry.update({
        where: { id: assetId },
        data: {
          title: input.title,
          category: input.category,
          summary: input.summary,
          body: input.body,
          relations: input.payload?.relations === undefined ? undefined : readStringArray(input.payload.relations),
          position: input.position,
        },
      }));
    }
    if (raw.kind === "seed") {
      return mapStorySeed(await this.prisma.storySeed.update({
        where: { id: assetId },
        data: {
          title: input.title,
          hook: input.summary ?? readString(input.payload?.hook),
          trigger: readString(input.payload?.trigger),
          conflict: input.body ?? readString(input.payload?.conflict),
          protagonists: readString(input.payload?.protagonists),
          questions: input.payload?.questions === undefined ? undefined : readStringArray(input.payload.questions),
          position: input.position,
        },
      }));
    }
    return mapConflict(await this.prisma.conflict.update({
      where: { id: assetId },
      data: {
        title: input.title,
        summary: input.summary,
        body: input.body,
        related: input.payload?.related === undefined ? undefined : readStringArray(input.payload.related),
        derivedSeeds: input.payload?.derivedSeeds === undefined ? undefined : readStringArray(input.payload.derivedSeeds),
        position: input.position,
      },
    }));
  }

  async deleteAsset(worldId: string, assetId: string) {
    const raw = await this.findRawAsset(worldId, assetId);
    if (!raw) return null;
    if (raw.kind === "setting") await this.prisma.archiveEntry.delete({ where: { id: assetId } });
    if (raw.kind === "seed") await this.prisma.storySeed.delete({ where: { id: assetId } });
    if (raw.kind === "conflict") await this.prisma.conflict.delete({ where: { id: assetId } });
    await this.prisma.worldAssetRelation.deleteMany({
      where: {
        worldId,
        OR: [{ sourceAssetId: assetId }, { targetAssetId: assetId }],
      },
    });
    return mapRawAsset(raw);
  }

  async reorderAssets(worldId: string, assetIds: string[]) {
    await Promise.all(assetIds.map(async (assetId, position) => {
      const raw = await this.findRawAsset(worldId, assetId);
      if (!raw) return;
      if (raw.kind === "setting") await this.prisma.archiveEntry.update({ where: { id: assetId }, data: { position } });
      if (raw.kind === "seed") await this.prisma.storySeed.update({ where: { id: assetId }, data: { position } });
      if (raw.kind === "conflict") await this.prisma.conflict.update({ where: { id: assetId }, data: { position } });
    }));
    return this.listAssets(worldId, {});
  }

  async addRelation(worldId: string, sourceAssetId: string, targetAssetId: string) {
    const [source, target] = await Promise.all([
      this.findRawAsset(worldId, sourceAssetId),
      this.findRawAsset(worldId, targetAssetId),
    ]);
    if (!source || !target) return null;
    const relation = await this.prisma.worldAssetRelation.upsert({
      where: { worldId_sourceAssetId_targetAssetId: { worldId, sourceAssetId, targetAssetId } },
      create: { worldId, sourceAssetId, targetAssetId },
      update: {},
    });
    return mapRelation(relation);
  }

  async deleteRelation(worldId: string, sourceAssetId: string, targetAssetId: string) {
    await this.prisma.worldAssetRelation.deleteMany({ where: { worldId, sourceAssetId, targetAssetId } });
    return { worldId, sourceAssetId, targetAssetId };
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  private async findRawAsset(worldId: string, assetId: string) {
    const [setting, seed, conflict] = await Promise.all([
      this.prisma.archiveEntry.findFirst({ where: { id: assetId, worldId } }),
      this.prisma.storySeed.findFirst({ where: { id: assetId, worldId } }),
      this.prisma.conflict.findFirst({ where: { id: assetId, worldId } }),
    ]);
    if (setting) return { kind: "setting" as const, record: setting };
    if (seed) return { kind: "seed" as const, record: seed };
    if (conflict) return { kind: "conflict" as const, record: conflict };
    return null;
  }
}

function mapRawAsset(raw: { kind: "setting" | "seed" | "conflict"; record: any }) {
  if (raw.kind === "setting") return mapArchiveEntry(raw.record);
  if (raw.kind === "seed") return mapStorySeed(raw.record);
  return mapConflict(raw.record);
}

function mapArchiveEntry(entry: {
  id: string;
  worldId: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  relations: string[];
  position?: number;
  createdAt: Date;
  updatedAt: Date;
}): WorldAssetRecord {
  return {
    id: entry.id,
    worldId: entry.worldId,
    kind: "setting",
    title: entry.title,
    category: entry.category,
    summary: entry.summary,
    body: entry.body,
    payload: { relations: entry.relations },
    position: entry.position ?? 0,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function mapStorySeed(seed: {
  id: string;
  worldId: string;
  title: string;
  hook: string;
  trigger?: string | null;
  conflict: string;
  protagonists?: string | null;
  questions: string[];
  position?: number;
  createdAt: Date;
  updatedAt: Date;
}): WorldAssetRecord {
  return {
    id: seed.id,
    worldId: seed.worldId,
    kind: "seed",
    title: seed.title,
    category: "故事种子",
    summary: seed.hook,
    body: seed.conflict,
    payload: {
      hook: seed.hook,
      trigger: seed.trigger,
      conflict: seed.conflict,
      protagonists: seed.protagonists,
      questions: seed.questions,
    },
    position: seed.position ?? 0,
    createdAt: seed.createdAt.toISOString(),
    updatedAt: seed.updatedAt.toISOString(),
  };
}

function mapConflict(conflict: {
  id: string;
  worldId: string;
  title: string;
  summary: string;
  body: string;
  related: string[];
  derivedSeeds: string[];
  position?: number;
  createdAt: Date;
  updatedAt: Date;
}): WorldAssetRecord {
  return {
    id: conflict.id,
    worldId: conflict.worldId,
    kind: "conflict",
    title: conflict.title,
    category: "冲突",
    summary: conflict.summary,
    body: conflict.body,
    payload: { related: conflict.related, derivedSeeds: conflict.derivedSeeds },
    position: conflict.position ?? 0,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
  };
}

function mapRelation(relation: { worldId: string; sourceAssetId: string; targetAssetId: string; createdAt: Date }) {
  return {
    worldId: relation.worldId,
    sourceAssetId: relation.sourceAssetId,
    targetAssetId: relation.targetAssetId,
    createdAt: relation.createdAt.toISOString(),
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
