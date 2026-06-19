import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { officialWorldAssetTypeSchema } from "@worlddock/contract/assets";
import { potentialAssetEvidenceSchema, potentialAssetStatusSchema } from "@worlddock/contract/potential-assets";
import {
  decodePotentialAssetListCursor,
  encodePotentialAssetListCursor,
  normalizePotentialAssetListLimit,
  type PotentialAssetRecord,
  type PotentialAssetsRepository,
} from "./potential-assets.repository";

const ACTIVE_DEDUPE_INDEX_NAME = "potential_assets_active_session_type_title_key";

@Injectable()
export class PrismaPotentialAssetsRepository implements PotentialAssetsRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createMany(input: Parameters<PotentialAssetsRepository["createMany"]>[0]) {
    const created = [];
    for (const item of input) {
      try {
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
      } catch (error) {
        if (isActiveDedupeUniqueConstraintError(error)) continue;
        throw error;
      }
    }
    return created.map(mapPotentialAsset);
  }

  async findById(worldId: string, id: string) {
    const asset = await this.prisma.potentialAsset.findFirst({ where: { worldId, id } });
    return asset ? mapPotentialAsset(asset) : null;
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

  async dismiss(worldId: string, id: string) {
    const updated = await this.prisma.potentialAsset.updateMany({
      where: { worldId, id, status: "active" },
      data: { status: "dismissed" },
    });
    if (updated.count > 0) {
      const asset = await this.prisma.potentialAsset.findUnique({ where: { id } });
      return asset ? mapPotentialAsset(asset) : null;
    }

    const dismissed = await this.prisma.potentialAsset.findFirst({ where: { worldId, id, status: "dismissed" } });
    return dismissed ? mapPotentialAsset(dismissed) : null;
  }

  async markPromoted(
    worldId: string,
    id: string,
    promotedAssetId: string,
    metadata: Record<string, unknown> = {},
  ) {
    const current = await this.prisma.potentialAsset.findFirst({ where: { worldId, id, status: "active" } });
    if (!current) return null;
    const currentMetadata = isRecord(current.metadata) ? current.metadata : {};
    const updated = await this.prisma.potentialAsset.updateMany({
      where: { worldId, id, status: "active" },
      data: {
        status: "promoted",
        promotedAssetId,
        metadata: { ...currentMetadata, ...metadata } as never,
      },
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
    type: officialWorldAssetTypeSchema.parse(asset.type),
    title: asset.title,
    summary: asset.summary,
    evidence: potentialAssetEvidenceSchema.array().parse(asset.evidence),
    status: potentialAssetStatusSchema.parse(asset.status),
    promotedAssetId: asset.promotedAssetId,
    metadata: isRecord(asset.metadata) ? asset.metadata : {},
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActiveDedupeUniqueConstraintError(error: unknown) {
  if (!isRecord(error) || error.code !== "P2002") return false;

  const meta = isRecord(error.meta) ? error.meta : {};
  const target = meta.target;
  if (typeof target === "string" && target.includes(ACTIVE_DEDUPE_INDEX_NAME)) return true;
  if (Array.isArray(target) && target.some((item) => typeof item === "string" && item.includes(ACTIVE_DEDUPE_INDEX_NAME))) {
    return true;
  }

  return typeof error.message === "string" && error.message.includes(ACTIVE_DEDUPE_INDEX_NAME);
}
