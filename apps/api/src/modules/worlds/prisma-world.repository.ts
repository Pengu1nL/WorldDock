import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createHash } from "node:crypto";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type { AssetCounts, ForkSnapshotAssetMap, WorldRepository } from "./world.repository";

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
      where: { ownerId, deletedAt: null },
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

  async replaceWorldFromSnapshot(input: Parameters<WorldRepository["replaceWorldFromSnapshot"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.archiveEntry.deleteMany({ where: { worldId: input.worldId } });
      await tx.storySeed.deleteMany({ where: { worldId: input.worldId } });
      await tx.conflict.deleteMany({ where: { worldId: input.worldId } });

      const updated = await tx.world.updateMany({
        where: { id: input.worldId, deletedAt: null },
        data: {
          name: input.snapshot.world.name,
          type: input.snapshot.world.type,
          summary: input.snapshot.world.summary,
          tags: input.snapshot.world.tags,
          maturity: input.snapshot.world.maturity,
          status: input.status,
          visibility: input.visibility,
        },
      });
      if (updated.count === 0) return null;

      for (const entry of input.snapshot.archiveEntries) {
        await tx.archiveEntry.create({
          data: {
            id: entry.id,
            worldId: input.worldId,
            title: entry.title,
            category: entry.category,
            summary: entry.summary,
            body: entry.body,
            relations: entry.relations ?? [],
          },
        });
      }
      for (const seed of input.snapshot.storySeeds) {
        await tx.storySeed.create({
          data: {
            id: seed.id,
            worldId: input.worldId,
            title: seed.title,
            hook: seed.hook,
            trigger: seed.trigger,
            conflict: seed.conflict,
            protagonists: seed.protagonists,
            questions: seed.questions ?? [],
          },
        });
      }
      for (const conflict of input.snapshot.conflicts) {
        await tx.conflict.create({
          data: {
            id: conflict.id,
            worldId: input.worldId,
            title: conflict.title,
            summary: conflict.summary,
            body: conflict.body,
            related: conflict.related ?? [],
            derivedSeeds: conflict.derivedSeeds ?? [],
          },
        });
      }

      await tx.worldAssetRelation.deleteMany({ where: { worldId: input.worldId } });
      const snapshotAssetIds = new Set(releaseSnapshotRawAssetIds(input.snapshot));
      for (const relation of input.snapshot.assetRelations) {
        if (!snapshotAssetIds.has(relation.sourceAssetId) || !snapshotAssetIds.has(relation.targetAssetId)) continue;
        await tx.worldAssetRelation.create({
          data: {
            worldId: input.worldId,
            sourceAssetId: relation.sourceAssetId,
            targetAssetId: relation.targetAssetId,
          },
        });
      }

      return tx.world.findUnique({ where: { id: input.worldId } }) as ReturnType<WorldRepository["replaceWorldFromSnapshot"]>;
    });
  }

  async createAssetFromSnapshot(input: Parameters<WorldRepository["createAssetFromSnapshot"]>[0]) {
    const asset = findSnapshotAsset(input.snapshot, input.upstreamAssetId);
    if (!asset) return null;
    const targetAssetId = input.targetAssetId ? parseAssetId(input.targetAssetId) : null;

    if (asset.kind === "archive") {
      if (targetAssetId?.kind === "archive") {
        const existing = await this.prisma.archiveEntry.findFirst({ where: { id: targetAssetId.id, worldId: input.worldId } });
        if (existing) return toForkAssetMap(input.upstreamAssetId, input.targetAssetId!, "archive");
      }
      const created = await this.prisma.archiveEntry.create({
        data: {
          id: targetAssetId?.kind === "archive" ? targetAssetId.id : undefined,
          worldId: input.worldId,
          title: asset.record.title,
          category: asset.record.category,
          summary: asset.record.summary,
          body: asset.record.body,
          relations: asset.record.relations ?? [],
        },
      });
      return toForkAssetMap(input.upstreamAssetId, `archive:${created.id}`, "archive");
    }
    if (asset.kind === "seed") {
      if (targetAssetId?.kind === "seed") {
        const existing = await this.prisma.storySeed.findFirst({ where: { id: targetAssetId.id, worldId: input.worldId } });
        if (existing) return toForkAssetMap(input.upstreamAssetId, input.targetAssetId!, "seed");
      }
      const created = await this.prisma.storySeed.create({
        data: {
          id: targetAssetId?.kind === "seed" ? targetAssetId.id : undefined,
          worldId: input.worldId,
          title: asset.record.title,
          hook: asset.record.hook,
          trigger: asset.record.trigger,
          conflict: asset.record.conflict,
          protagonists: asset.record.protagonists,
          questions: asset.record.questions ?? [],
        },
      });
      return toForkAssetMap(input.upstreamAssetId, `seed:${created.id}`, "seed");
    }

    if (targetAssetId?.kind === "conflict") {
      const existing = await this.prisma.conflict.findFirst({ where: { id: targetAssetId.id, worldId: input.worldId } });
      if (existing) return toForkAssetMap(input.upstreamAssetId, input.targetAssetId!, "conflict");
    }
    const created = await this.prisma.conflict.create({
      data: {
        id: targetAssetId?.kind === "conflict" ? targetAssetId.id : undefined,
        worldId: input.worldId,
        title: asset.record.title,
        summary: asset.record.summary,
        body: asset.record.body,
        related: asset.record.related ?? [],
        derivedSeeds: asset.record.derivedSeeds ?? [],
      },
    });
    return toForkAssetMap(input.upstreamAssetId, `conflict:${created.id}`, "conflict");
  }

  async applyForkSnapshotChange(input: Parameters<WorldRepository["applyForkSnapshotChange"]>[0]) {
    const source = findSnapshotAsset(input.sourceSnapshot, input.change.assetId);
    if (!source) return { status: "skipped" as const, change: input.change, reason: "missing_source" as const };
    const upstream = input.change.kind === "changed" ? findSnapshotAsset(input.upstreamSnapshot, input.change.assetId) : null;
    if (input.change.kind === "changed" && !upstream) {
      return { status: "skipped" as const, change: input.change, reason: "missing_upstream" as const };
    }
    if (!input.targetAsset) {
      return { status: "skipped" as const, change: input.change, reason: "missing_source" as const };
    }

    const target = await this.findTargetAsset(input.worldId, input.targetAsset);
    const remappedSource = remapSnapshotAssetReferences(source, input.assetMaps ?? []);
    const remappedUpstream = upstream ? remapSnapshotAssetReferences(upstream, input.assetMaps ?? []) : null;
    if (!target) {
      return input.change.kind === "removed"
        ? { status: "applied" as const, change: input.change }
        : { status: "skipped" as const, change: input.change, reason: "local_conflict" as const };
    }
    if (target.kind !== source.kind) {
      return { status: "skipped" as const, change: input.change, reason: "local_conflict" as const };
    }

    const parsedTarget = parseAssetId(input.targetAsset.targetAssetId);
    if (!parsedTarget) return { status: "skipped" as const, change: input.change, reason: "missing_source" as const };

    if (input.change.kind === "changed" && remappedUpstream && stableAssetHash(target.record) === stableAssetHash(remappedUpstream.record)) {
      return { status: "applied" as const, change: input.change };
    }

    if (stableAssetHash(target.record) !== stableAssetHash(remappedSource.record)) {
      return { status: "skipped" as const, change: input.change, reason: "local_conflict" as const };
    }

    if (input.change.kind === "removed") {
      await this.prisma.$transaction(async (tx) => {
        await tx.worldAssetRelation.deleteMany({
          where: {
            worldId: input.worldId,
            OR: [{ sourceAssetId: parsedTarget.id }, { targetAssetId: parsedTarget.id }],
          },
        });
        if (parsedTarget.kind === "archive") await tx.archiveEntry.deleteMany({ where: { id: parsedTarget.id, worldId: input.worldId } });
        if (parsedTarget.kind === "seed") await tx.storySeed.deleteMany({ where: { id: parsedTarget.id, worldId: input.worldId } });
        if (parsedTarget.kind === "conflict") await tx.conflict.deleteMany({ where: { id: parsedTarget.id, worldId: input.worldId } });
      });
      return { status: "applied" as const, change: input.change };
    }

    if (!upstream) return { status: "skipped" as const, change: input.change, reason: "missing_upstream" as const };
    const updateAsset = remapSnapshotAssetReferences(upstream, input.assetMaps ?? []);
    if (updateAsset.kind === "archive" && parsedTarget.kind === "archive") {
      await this.prisma.archiveEntry.updateMany({
        where: { id: parsedTarget.id, worldId: input.worldId },
        data: {
          title: updateAsset.record.title,
          category: updateAsset.record.category,
          summary: updateAsset.record.summary,
          body: updateAsset.record.body,
          relations: updateAsset.record.relations ?? [],
        },
      });
      return { status: "applied" as const, change: input.change };
    }
    if (updateAsset.kind === "seed" && parsedTarget.kind === "seed") {
      await this.prisma.storySeed.updateMany({
        where: { id: parsedTarget.id, worldId: input.worldId },
        data: {
          title: updateAsset.record.title,
          hook: updateAsset.record.hook,
          trigger: updateAsset.record.trigger,
          conflict: updateAsset.record.conflict,
          protagonists: updateAsset.record.protagonists,
          questions: updateAsset.record.questions ?? [],
        },
      });
      return { status: "applied" as const, change: input.change };
    }
    if (updateAsset.kind === "conflict" && parsedTarget.kind === "conflict") {
      await this.prisma.conflict.updateMany({
        where: { id: parsedTarget.id, worldId: input.worldId },
        data: {
          title: updateAsset.record.title,
          summary: updateAsset.record.summary,
          body: updateAsset.record.body,
          related: updateAsset.record.related ?? [],
          derivedSeeds: updateAsset.record.derivedSeeds ?? [],
        },
      });
      return { status: "applied" as const, change: input.change };
    }

    return { status: "skipped" as const, change: input.change, reason: "local_conflict" as const };
  }

  async remapForkAssetReferences(input: Parameters<WorldRepository["remapForkAssetReferences"]>[0]) {
    await this.prisma.$transaction(async (tx) => {
      const [archiveEntries, conflicts] = await Promise.all([
        tx.archiveEntry.findMany({ where: { worldId: input.worldId } }),
        tx.conflict.findMany({ where: { worldId: input.worldId } }),
      ]);

      for (const entry of archiveEntries) {
        const relations = remapKnownAssetRefs(entry.relations, input.assetMaps);
        if (!sameStringArray(relations, entry.relations)) {
          await tx.archiveEntry.update({ where: { id: entry.id }, data: { relations } });
        }
      }

      for (const conflict of conflicts) {
        const related = remapKnownAssetRefs(conflict.related, input.assetMaps);
        const derivedSeeds = remapKnownAssetRefs(conflict.derivedSeeds, input.assetMaps);
        if (!sameStringArray(related, conflict.related) || !sameStringArray(derivedSeeds, conflict.derivedSeeds)) {
          await tx.conflict.update({
            where: { id: conflict.id },
            data: { related, derivedSeeds },
          });
        }
      }
    });
  }

  async replaceForkAssetRelationsFromSnapshot(input: Parameters<WorldRepository["replaceForkAssetRelationsFromSnapshot"]>[0]) {
    const relations = remapSnapshotAssetRelations(input.snapshot, input.assetMaps);
    if (!relations) return false;
    await this.prisma.$transaction(async (tx) => {
      await tx.worldAssetRelation.deleteMany({ where: { worldId: input.worldId } });
      for (const relation of relations) {
        await tx.worldAssetRelation.create({
          data: {
            worldId: input.worldId,
            sourceAssetId: relation.sourceAssetId,
            targetAssetId: relation.targetAssetId,
          },
        });
      }
    });
    return true;
  }

  async forkAssetRelationsMatchSnapshot(input: Parameters<WorldRepository["forkAssetRelationsMatchSnapshot"]>[0]) {
    const expected = remapSnapshotAssetRelations(input.snapshot, input.assetMaps);
    if (!expected) return false;
    const current = await this.listAssetRelations(input.worldId);
    return sameAssetRelations(current, expected);
  }

  private async findTargetAsset(worldId: string, targetAsset: ForkSnapshotAssetMap) {
    const parsed = parseAssetId(targetAsset.targetAssetId);
    if (!parsed) return null;
    if (parsed.kind === "archive") {
      const record = await this.prisma.archiveEntry.findFirst({ where: { id: parsed.id, worldId } });
      return record ? { kind: "archive" as const, record } : null;
    }
    if (parsed.kind === "seed") {
      const record = await this.prisma.storySeed.findFirst({ where: { id: parsed.id, worldId } });
      return record ? { kind: "seed" as const, record } : null;
    }
    const record = await this.prisma.conflict.findFirst({ where: { id: parsed.id, worldId } });
    return record ? { kind: "conflict" as const, record } : null;
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

type SnapshotAsset =
  | { kind: "archive"; record: Parameters<WorldRepository["createArchiveEntry"]>[0] & { id: string } }
  | { kind: "seed"; record: Parameters<WorldRepository["createStorySeed"]>[0] & { id: string } }
  | { kind: "conflict"; record: Parameters<WorldRepository["createConflict"]>[0] & { id: string } };

function findSnapshotAsset(snapshot: Parameters<WorldRepository["createAssetFromSnapshot"]>[0]["snapshot"], assetId: string): SnapshotAsset | null {
  const parsed = parseAssetId(assetId);
  if (!parsed) return null;
  if (parsed.kind === "archive") {
    const record = snapshot.archiveEntries.find((entry) => entry.id === parsed.id);
    return record ? { kind: "archive", record: { ...record, worldId: "" } } : null;
  }
  if (parsed.kind === "seed") {
    const record = snapshot.storySeeds.find((seed) => seed.id === parsed.id);
    return record ? { kind: "seed", record: { ...record, worldId: "" } } : null;
  }
  const record = snapshot.conflicts.find((conflict) => conflict.id === parsed.id);
  return record ? { kind: "conflict", record: { ...record, worldId: "" } } : null;
}

function parseAssetId(assetId: string) {
  const separator = assetId.indexOf(":");
  if (separator === -1) return null;
  const kind = assetId.slice(0, separator);
  const id = assetId.slice(separator + 1);
  if (!id || (kind !== "archive" && kind !== "seed" && kind !== "conflict")) return null;
  return { kind, id } as const;
}

function toForkAssetMap(upstreamAssetId: string, targetAssetId: string, kind: ForkSnapshotAssetMap["kind"]) {
  return { upstreamAssetId, targetAssetId, kind };
}

function releaseSnapshotRawAssetIds(snapshot: Parameters<WorldRepository["replaceWorldFromSnapshot"]>[0]["snapshot"]) {
  return [
    ...snapshot.archiveEntries.map((entry) => entry.id),
    ...snapshot.storySeeds.map((seed) => seed.id),
    ...snapshot.conflicts.map((conflict) => conflict.id),
  ];
}

function remapSnapshotAssetReferences(asset: SnapshotAsset, assetMaps: ForkSnapshotAssetMap[]): SnapshotAsset {
  if (asset.kind === "archive") {
    return {
      kind: "archive",
      record: { ...asset.record, relations: remapKnownAssetRefs(asset.record.relations ?? [], assetMaps) },
    };
  }
  if (asset.kind === "conflict") {
    return {
      kind: "conflict",
      record: {
        ...asset.record,
        related: remapKnownAssetRefs(asset.record.related ?? [], assetMaps),
        derivedSeeds: remapKnownAssetRefs(asset.record.derivedSeeds ?? [], assetMaps),
      },
    };
  }
  return asset;
}

function remapKnownAssetRefs(values: string[], assetMaps: ForkSnapshotAssetMap[]) {
  if (values.length === 0 || assetMaps.length === 0) return values;
  const remap = new Map<string, string>();
  for (const assetMap of assetMaps) {
    remap.set(assetMap.upstreamAssetId, assetMap.targetAssetId);
  }
  return values.map((value) => remap.get(value) ?? value);
}

function remapSnapshotAssetRelations(
  snapshot: Parameters<WorldRepository["replaceForkAssetRelationsFromSnapshot"]>[0]["snapshot"],
  assetMaps: ForkSnapshotAssetMap[],
) {
  const rawIdMap = new Map<string, string>();
  for (const assetMap of assetMaps) {
    const upstream = parseAssetId(assetMap.upstreamAssetId);
    const target = parseAssetId(assetMap.targetAssetId);
    if (!upstream || !target) continue;
    rawIdMap.set(upstream.id, target.id);
  }

  const relations: Array<{ sourceAssetId: string; targetAssetId: string }> = [];
  for (const relation of snapshot.assetRelations) {
    const sourceAssetId = rawIdMap.get(relation.sourceAssetId);
    const targetAssetId = rawIdMap.get(relation.targetAssetId);
    if (!sourceAssetId || !targetAssetId) return null;
    relations.push({ sourceAssetId, targetAssetId });
  }
  return relations;
}

function sameAssetRelations(
  left: Array<{ sourceAssetId: string; targetAssetId: string }>,
  right: Array<{ sourceAssetId: string; targetAssetId: string }>,
) {
  if (left.length !== right.length) return false;
  const normalizedLeft = left.map(formatAssetRelation).sort();
  const normalizedRight = right.map(formatAssetRelation).sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function formatAssetRelation(relation: { sourceAssetId: string; targetAssetId: string }) {
  return `${relation.sourceAssetId}\0${relation.targetAssetId}`;
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function stableAssetHash(value: unknown) {
  return createHash("sha256").update(stableStringify(stripVolatileAssetFields(value))).digest("hex").slice(0, 16);
}

function stripVolatileAssetFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatileAssetFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["id", "worldId", "position", "createdAt", "updatedAt"].includes(key))
      .map(([key, nested]) => [key, stripVolatileAssetFields(nested)]),
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function remapAssetIds(values: string[], idMap: Map<string, string>) {
  return values.map((value) => idMap.get(value) ?? value);
}
