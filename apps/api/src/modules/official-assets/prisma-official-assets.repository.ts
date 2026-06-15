import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { officialWorldAssetStatusSchema, officialWorldAssetTypeSchema, worldAssetPatchStatusSchema } from "@worlddock/contract/assets";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import {
  decodeOfficialAssetListCursor,
  encodeOfficialAssetListCursor,
  normalizeOfficialAssetListLimit,
  OfficialAssetPatchConflictError,
  type OfficialAssetPatchRecord,
  type OfficialAssetPatchesRepository,
  type OfficialAssetDetailRecord,
  type OfficialAssetRecord,
  type OfficialAssetRevisionRecord,
  type OfficialAssetsRepository,
  type OfficialAssetSectionIndexRecord,
} from "./official-assets.repository";

@Injectable()
export class PrismaOfficialAssetsRepository implements OfficialAssetsRepository, OfficialAssetPatchesRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createAsset(input: Parameters<OfficialAssetsRepository["createAsset"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.officialWorldAsset.create({
        data: {
          id: input.id,
          worldId: input.worldId,
          type: input.type,
          name: input.name,
          summary: input.summary,
          documentKey: input.documentKey,
          status: "active",
          version: 1,
          tags: input.tags ?? [],
          metadata: (input.metadata ?? {}) as never,
        },
      });
      const revision = await tx.officialWorldAssetRevision.create({
        data: {
          worldId: input.worldId,
          assetId: asset.id,
          version: 1,
          markdown: input.initialRevision.markdown,
          summary: input.initialRevision.summary,
          metadata: (input.initialRevision.metadata ?? {}) as never,
        },
      });
      const indexes = [];
      for (const section of input.indexes) {
        indexes.push(await tx.officialWorldAssetIndex.create({
          data: {
            worldId: input.worldId,
            assetId: asset.id,
            title: section.title,
            summary: section.summary,
            metadata: (section.metadata ?? {}) as never,
          },
        }));
      }
      return {
        asset: mapOfficialAsset(asset),
        revisions: [mapOfficialAssetRevision(revision)],
        indexes: indexes.map(mapOfficialAssetIndex),
      };
    });
  }

  async updateAsset(
    worldId: string,
    assetId: string,
    input: Parameters<OfficialAssetsRepository["updateAsset"]>[2],
  ): Promise<OfficialAssetDetailRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.officialWorldAsset.findFirst({
        where: { worldId, id: assetId },
      });
      if (!current) return null;

      const archivedAt = nextArchivedAt({
        currentStatus: current.status,
        currentArchivedAt: current.archivedAt,
        nextStatus: input.status,
      });

      const asset = await tx.officialWorldAsset.update({
        where: { id: current.id },
        data: {
          name: input.name,
          summary: input.summary,
          tags: input.tags,
          metadata: input.metadata === undefined ? undefined : input.metadata as never,
          status: input.status,
          archivedAt,
        },
        include: {
          revisions: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
          indexes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
      });
      return {
        asset: mapOfficialAsset(asset),
        revisions: asset.revisions.map(mapOfficialAssetRevision),
        indexes: asset.indexes.map(mapOfficialAssetIndex),
      };
    });
  }

  async listAssets(worldId: string, query: Parameters<OfficialAssetsRepository["listAssets"]>[1] = {}) {
    const where: Record<string, unknown> = { worldId };
    if (query.type) where.type = query.type;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { summary: { contains: query.q, mode: "insensitive" } },
      ];
    }
    if (query.cursor) {
      const cursor = decodeOfficialAssetListCursor(query.cursor);
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        },
      ];
    }

    const limit = normalizeOfficialAssetListLimit(query.limit);
    const assets = await this.prisma.officialWorldAsset.findMany({
      where: where as never,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit + 1,
    });
    const page = assets.slice(0, limit).map(mapOfficialAsset);
    return {
      assets: page,
      nextCursor: assets.length > limit ? encodeOfficialAssetListCursor(page[page.length - 1]) : null,
    };
  }

  async getAsset(worldId: string, assetId: string): Promise<OfficialAssetDetailRecord | null> {
    const asset = await this.prisma.officialWorldAsset.findFirst({
      where: { worldId, id: assetId },
      include: {
        revisions: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
        indexes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
    if (!asset) return null;
    return {
      asset: mapOfficialAsset(asset),
      revisions: asset.revisions.map(mapOfficialAssetRevision),
      indexes: asset.indexes.map(mapOfficialAssetIndex),
    };
  }

  async applyPatch(input: Parameters<OfficialAssetPatchesRepository["applyPatch"]>[0]): Promise<OfficialAssetPatchRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.officialWorldAsset.findFirst({
        where: { worldId: input.worldId, id: input.assetId },
        include: {
          revisions: { orderBy: [{ version: "desc" }, { createdAt: "desc" }], take: 1 },
        },
      });
      if (!current) return null;
      const latestRevision = current.revisions[0] ?? null;
      if (
        current.version !== input.expectedVersion ||
        (latestRevision?.id ?? null) !== input.expectedBeforeRevisionId
      ) {
        throw new OfficialAssetPatchConflictError();
      }

      const versionFrom = input.expectedVersion;
      const versionTo = input.expectedVersion + 1;
      const updated = await tx.officialWorldAsset.updateMany({
        where: {
          id: current.id,
          worldId: input.worldId,
          version: input.expectedVersion,
        },
        data: {
          summary: input.summary,
          version: versionTo,
        },
      });
      if (updated.count !== 1) throw new OfficialAssetPatchConflictError();

      const revision = await tx.officialWorldAssetRevision.create({
        data: {
          worldId: input.worldId,
          assetId: input.assetId,
          version: versionTo,
          markdown: input.afterMarkdown,
          summary: input.summary,
          metadata: {
            sessionId: input.sessionId,
            source: "patch",
          },
        },
      });

      await tx.officialWorldAssetIndex.deleteMany({
        where: { worldId: input.worldId, assetId: input.assetId },
      });
      for (const section of input.indexes) {
        await tx.officialWorldAssetIndex.create({
          data: {
            worldId: input.worldId,
            assetId: input.assetId,
            title: section.title,
            summary: section.summary,
            metadata: (section.metadata ?? {}) as never,
          },
        });
      }

      const appliedAt = new Date();
      const patch = await tx.worldAssetPatch.create({
        data: {
          worldId: input.worldId,
          assetId: input.assetId,
          beforeRevisionId: input.expectedBeforeRevisionId,
          afterRevisionId: revision.id,
          beforeMarkdown: input.beforeMarkdown,
          afterMarkdown: input.afterMarkdown,
          diff: input.diff,
          assetVersionFrom: versionFrom,
          assetVersionTo: versionTo,
          status: "applied",
          metadata: {
            ...(input.metadata ?? {}),
            sessionId: input.sessionId,
          } as never,
          appliedAt,
        },
      });

      return mapOfficialAssetPatch(patch);
    });
  }

  async listPatches(worldId: string, assetId: string): Promise<OfficialAssetPatchRecord[]> {
    const patches = await this.prisma.worldAssetPatch.findMany({
      where: { worldId, assetId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    return patches.map(mapOfficialAssetPatch);
  }

  async getPatch(worldId: string, assetId: string, patchId: string): Promise<OfficialAssetPatchRecord | null> {
    const patch = await this.prisma.worldAssetPatch.findFirst({
      where: { worldId, assetId, id: patchId },
    });
    return patch ? mapOfficialAssetPatch(patch) : null;
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapOfficialAsset(asset: {
  id: string;
  worldId: string;
  type: string;
  name: string;
  summary: string;
  documentKey: string;
  status: string;
  version: number;
  tags: string[];
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): OfficialAssetRecord {
  return {
    id: asset.id,
    worldId: asset.worldId,
    type: officialWorldAssetTypeSchema.parse(asset.type),
    name: asset.name,
    summary: asset.summary,
    documentKey: asset.documentKey,
    status: officialWorldAssetStatusSchema.parse(asset.status),
    version: asset.version,
    tags: [...asset.tags],
    metadata: isRecord(asset.metadata) ? asset.metadata : {},
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    archivedAt: asset.archivedAt,
  };
}

function nextArchivedAt(input: {
  currentStatus: string;
  currentArchivedAt: Date | null;
  nextStatus: string | undefined;
}) {
  if (input.nextStatus === undefined) return undefined;
  if (input.nextStatus === "active") return null;
  if (input.currentStatus !== "archived" || input.currentArchivedAt === null) return new Date();
  return undefined;
}

function mapOfficialAssetRevision(revision: {
  id: string;
  worldId: string;
  assetId: string;
  version: number;
  markdown: string;
  summary: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): OfficialAssetRevisionRecord {
  return {
    id: revision.id,
    worldId: revision.worldId,
    assetId: revision.assetId,
    version: revision.version,
    markdown: revision.markdown,
    summary: revision.summary,
    metadata: isRecord(revision.metadata) ? revision.metadata : {},
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
  };
}

function mapOfficialAssetIndex(index: {
  id: string;
  worldId: string;
  assetId: string;
  title: string;
  summary: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): OfficialAssetSectionIndexRecord {
  return {
    id: index.id,
    worldId: index.worldId,
    assetId: index.assetId,
    title: index.title,
    summary: index.summary,
    metadata: isRecord(index.metadata) ? index.metadata : {},
    createdAt: index.createdAt,
    updatedAt: index.updatedAt,
  };
}

function mapOfficialAssetPatch(patch: {
  id: string;
  worldId: string;
  assetId: string;
  batchId: string | null;
  beforeRevisionId: string | null;
  afterRevisionId: string | null;
  beforeMarkdown: string;
  afterMarkdown: string;
  diff: string | null;
  assetVersionFrom: number;
  assetVersionTo: number;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  appliedAt: Date | null;
  revertedAt: Date | null;
}): OfficialAssetPatchRecord {
  const metadata = isRecord(patch.metadata) ? patch.metadata : {};
  return {
    id: patch.id,
    worldId: patch.worldId,
    assetId: patch.assetId,
    sessionId: typeof metadata.sessionId === "string" ? metadata.sessionId : null,
    batchId: patch.batchId,
    beforeRevisionId: patch.beforeRevisionId,
    afterRevisionId: patch.afterRevisionId,
    beforeMarkdown: patch.beforeMarkdown,
    afterMarkdown: patch.afterMarkdown,
    diff: patch.diff,
    assetVersionFrom: patch.assetVersionFrom,
    assetVersionTo: patch.assetVersionTo,
    status: worldAssetPatchStatusSchema.parse(patch.status),
    metadata,
    createdAt: patch.createdAt,
    updatedAt: patch.updatedAt,
    appliedAt: patch.appliedAt,
    revertedAt: patch.revertedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
