import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type {
  ChapterRecord,
  NarrativesRepository,
  NarrativeAssetKind,
  NarrativeAssetRecord,
  NarrativeRecord,
} from "./narratives.repository";

@Injectable()
export class PrismaNarrativesRepository implements NarrativesRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createNarrative(input: Parameters<NarrativesRepository["createNarrative"]>[0]) {
    const created = await this.prisma.narrative.create({ data: input as never });
    return mapNarrative(created);
  }

  async listNarratives(query: Parameters<NarrativesRepository["listNarratives"]>[0] = {}) {
    const records = await this.prisma.narrative.findMany({
      where: query.worldId ? { worldId: query.worldId } : undefined,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    return records.map(mapNarrative);
  }

  async findNarrativeById(id: string) {
    const record = await this.prisma.narrative.findUnique({ where: { id } });
    return record ? mapNarrative(record) : null;
  }

  async updateNarrative(id: string, input: Parameters<NarrativesRepository["updateNarrative"]>[1]) {
    const updated = await this.prisma.narrative.updateMany({ where: { id }, data: input as never });
    if (updated.count === 0) return null;
    return this.findNarrativeById(id);
  }

  async deleteNarrative(id: string) {
    const existing = await this.findNarrativeById(id);
    if (!existing) return null;
    await this.prisma.narrative.delete({ where: { id } });
    return existing;
  }

  async countNarrativeChildren(narrativeId: string) {
    const [chapters, assets] = await Promise.all([
      this.prisma.chapter.count({ where: { narrativeId } }),
      this.prisma.narrativeAsset.count({ where: { narrativeId } }),
    ]);
    return { chapters, assets };
  }

  async listChapters(narrativeId: string) {
    const records = await this.prisma.chapter.findMany({
      where: { narrativeId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return records.map(mapChapter);
  }

  async findChapter(narrativeId: string, chapterId: string) {
    const record = await this.prisma.chapter.findFirst({ where: { id: chapterId, narrativeId } });
    return record ? mapChapter(record) : null;
  }

  async createChapter(input: Parameters<NarrativesRepository["createChapter"]>[0]) {
    const created = await this.prisma.chapter.create({ data: input as never });
    return mapChapter(created);
  }

  async updateChapter(
    narrativeId: string,
    chapterId: string,
    input: Parameters<NarrativesRepository["updateChapter"]>[2],
  ) {
    const updated = await this.prisma.chapter.updateMany({ where: { id: chapterId, narrativeId }, data: input as never });
    if (updated.count === 0) return null;
    return this.findChapter(narrativeId, chapterId);
  }

  async deleteChapter(narrativeId: string, chapterId: string) {
    const existing = await this.findChapter(narrativeId, chapterId);
    if (!existing) return null;
    await this.prisma.chapter.delete({ where: { id: chapterId } });
    return existing;
  }

  async listAssets(narrativeId: string, query: Parameters<NarrativesRepository["listAssets"]>[1] = {}) {
    const records = await this.prisma.narrativeAsset.findMany({
      where: {
        narrativeId,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { summary: { contains: query.q, mode: "insensitive" } }] } : {}),
      } as never,
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    return records.map(mapAsset);
  }

  async findAsset(narrativeId: string, assetId: string) {
    const record = await this.prisma.narrativeAsset.findFirst({ where: { id: assetId, narrativeId } });
    return record ? mapAsset(record) : null;
  }

  async findAssetByName(narrativeId: string, kind: NarrativeAssetKind, name: string) {
    const record = await this.prisma.narrativeAsset.findFirst({
      where: { narrativeId, kind, name: { equals: name, mode: "insensitive" } } as never,
      orderBy: { createdAt: "asc" },
    });
    return record ? mapAsset(record) : null;
  }

  async createAsset(input: Parameters<NarrativesRepository["createAsset"]>[0]) {
    const created = await this.prisma.narrativeAsset.create({ data: input as never });
    return mapAsset(created);
  }

  async updateAsset(narrativeId: string, assetId: string, input: Parameters<NarrativesRepository["updateAsset"]>[2]) {
    const updated = await this.prisma.narrativeAsset.updateMany({ where: { id: assetId, narrativeId }, data: input as never });
    if (updated.count === 0) return null;
    return this.findAsset(narrativeId, assetId);
  }

  async createAssetVersion(input: Parameters<NarrativesRepository["createAssetVersion"]>[0]) {
    const created = await this.prisma.narrativeAssetVersion.create({ data: input as never });
    return {
      ...created,
      snapshot: parseMetadata(created.snapshot),
      diff: created.diff ? parseMetadata(created.diff) : null,
    };
  }

  async listAssetVersions(assetId: string) {
    const records = await this.prisma.narrativeAssetVersion.findMany({
      where: { assetId },
      orderBy: { createdAt: "asc" },
    });
    return records.map((record) => ({
      ...record,
      snapshot: parseMetadata(record.snapshot),
      diff: record.diff ? parseMetadata(record.diff) : null,
    }));
  }

  async createAssetRelation(input: Parameters<NarrativesRepository["createAssetRelation"]>[0]) {
    return this.prisma.narrativeAssetRelation.create({ data: input });
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapNarrative(record: {
  id: string;
  worldId: string | null;
  title: string;
	  synopsis: string | null;
	  status: string;
	  metadata: unknown;
	  visualStyle: unknown;
	  createdAt: Date;
	  updatedAt: Date;
	}): NarrativeRecord {
	  return {
	    ...record,
	    status: parseNarrativeStatus(record.status),
	    metadata: parseMetadata(record.metadata),
	    visualStyle: parseMetadata(record.visualStyle),
	  };
	}

function mapChapter(record: {
  id: string;
  narrativeId: string;
  order: number;
  title: string;
  content: string;
  wordCount: number;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ChapterRecord {
  return {
    ...record,
    status: parseChapterStatus(record.status),
    metadata: parseMetadata(record.metadata),
  };
}

function mapAsset(record: {
  id: string;
  narrativeId: string;
  kind: string;
  name: string;
  summary: string;
  body: string | null;
  tags: string[];
  appearance: string | null;
  mood: string | null;
  visualPrompt: string | null;
  nameEmbedding: unknown | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): NarrativeAssetRecord {
  return {
    ...record,
    kind: parseAssetKind(record.kind),
    metadata: parseMetadata(record.metadata),
  };
}

function parseNarrativeStatus(value: string): NarrativeRecord["status"] {
  if (value === "draft" || value === "in_progress" || value === "completed" || value === "archived") return value;
  throw new Error(`Unknown narrative status: ${value}`);
}

function parseChapterStatus(value: string): ChapterRecord["status"] {
  if (value === "draft" || value === "completed" || value === "revised") return value;
  throw new Error(`Unknown chapter status: ${value}`);
}

function parseAssetKind(value: string): NarrativeAssetKind {
  if (value === "character" || value === "location" || value === "item" || value === "event" || value === "concept" || value === "faction") {
    return value;
  }
  throw new Error(`Unknown narrative asset kind: ${value}`);
}

function parseMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
