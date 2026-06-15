import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import {
  decodePotentialAssetListCursor,
  encodePotentialAssetListCursor,
  normalizePotentialAssetListLimit,
  type PotentialAssetRecord,
  type PotentialAssetsRepository,
} from "./potential-assets.repository";

@Injectable()
export class PrismaPotentialAssetsRepository implements PotentialAssetsRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createMany(input: Parameters<PotentialAssetsRepository["createMany"]>[0]) {
    const created = [];
    for (const item of input) {
      created.push(await this.prisma.potentialAsset.create({
        data: {
          worldId: item.worldId,
          sessionId: item.sessionId,
          runId: item.runId ?? null,
          type: item.type,
          title: item.title,
          summary: item.summary,
          evidence: item.evidence as never,
          status: item.status ?? "active",
          promotedAssetId: item.promotedAssetId ?? null,
          metadata: (item.metadata ?? {}) as never,
        },
      }));
    }
    return created.map(mapPotentialAsset);
  }

  async listForSession(worldId: string, sessionId: string) {
    const assets = await this.prisma.potentialAsset.findMany({
      where: { worldId, sessionId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return assets.map(mapPotentialAsset);
  }

  async listForRun(worldId: string, runId: string) {
    const assets = await this.prisma.potentialAsset.findMany({
      where: { worldId, runId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return assets.map(mapPotentialAsset);
  }

  async listForWorld(worldId: string, query: Parameters<PotentialAssetsRepository["listForWorld"]>[1] = {}) {
    const where: Record<string, unknown> = { worldId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.cursor) {
      const cursor = decodePotentialAssetListCursor(query.cursor);
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ];
    }

    const limit = normalizePotentialAssetListLimit(query.limit);
    const assets = await this.prisma.potentialAsset.findMany({
      where: where as never,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit + 1,
    });
    const page = assets.slice(0, limit).map(mapPotentialAsset);
    return {
      potentialAssets: page,
      nextCursor: assets.length > limit ? encodePotentialAssetListCursor(page[page.length - 1]) : null,
    };
  }

  async updateStatus(worldId: string, id: string, status: Parameters<PotentialAssetsRepository["updateStatus"]>[2]) {
    const updated = await this.prisma.potentialAsset.updateMany({
      where: { worldId, id },
      data: { status },
    });
    if (updated.count === 0) return null;
    const asset = await this.prisma.potentialAsset.findUnique({ where: { id } });
    return asset ? mapPotentialAsset(asset) : null;
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapPotentialAsset(asset: {
  id: string;
  worldId: string;
  sessionId: string;
  runId: string | null;
  type: string;
  title: string;
  summary: string;
  evidence: unknown;
  status: string;
  promotedAssetId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PotentialAssetRecord {
  return {
    id: asset.id,
    worldId: asset.worldId,
    sessionId: asset.sessionId,
    runId: asset.runId,
    type: asset.type as PotentialAssetRecord["type"],
    title: asset.title,
    summary: asset.summary,
    evidence: Array.isArray(asset.evidence) ? asset.evidence as PotentialAssetRecord["evidence"] : [],
    status: asset.status as PotentialAssetRecord["status"],
    promotedAssetId: asset.promotedAssetId,
    metadata: isRecord(asset.metadata) ? asset.metadata : {},
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
