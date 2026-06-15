import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  releaseSnapshotAssetSchema,
  releaseSnapshotSchema,
  worldPackageSchema,
  type LegacyWorldPackageAsset,
  type OfficialWorldPackageAsset,
  type ReleaseSnapshot,
  type ReleaseSnapshotAsset,
  type WorldPackage,
} from "@worlddock/domain";
import { OfficialAssetsService } from "../official-assets/official-assets.service";
import { WORLD_REPOSITORY, type WorldRecord, type WorldRepository } from "../worlds/world.repository";

type ExportRecord = {
  id: string;
  kind: "world";
  status: "ready";
  payload: unknown;
  createdAt: Date;
};

type ImportableAsset = {
  kind: LegacyWorldPackageAsset["kind"];
  title: string;
  summary: string;
  body?: string;
  payload: Record<string, unknown>;
};
type WorldPackageBuild = {
  worldPackage: WorldPackage;
  snapshotAssets: ReleaseSnapshotAsset[];
};
type ImportAssetOptions = {
  id?: string;
  assetIdMap?: Map<string, string>;
  position?: number;
};

const exportsStore = new Map<string, ExportRecord>();

@Injectable()
export class ExportsService {
  constructor(
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Optional() @Inject(OfficialAssetsService) private readonly officialAssets?: OfficialAssetsService,
  ) {}

  async exportWorld(worldId: string) {
    const world = await this.requireWorld(worldId);
    const payload = await this.buildWorldPackage(world);
    const record = this.createExportRecord("world", payload);
    return { export: toExportResponse(record) };
  }

  async getExport(exportId: string) {
    const record = this.requireExport(exportId);
    return { export: toExportResponse(record), package: record.payload };
  }

  async importWorld(input: { package: unknown }) {
    const worldPackage = worldPackageSchema.parse(input.package);
    const world = await this.worlds.createWorld({
      name: worldPackage.world.name,
      type: worldPackage.world.type,
      summary: worldPackage.world.summary,
      tags: worldPackage.world.tags,
      mode: "local",
      maturity: worldPackage.world.maturity,
    });
    if (worldPackage.format === "worlddock.world-package.v2") {
      await Promise.all(worldPackage.assets.map((asset) => this.createImportedOfficialAsset(world.id, asset)));
    } else {
      await Promise.all(worldPackage.assets.map((asset, index) => this.createImportedAsset(world.id, asset, { position: index })));
    }
    return { world: await this.toWorldResponse(world) };
  }

  async importReleaseSnapshot(input: { snapshot: unknown }) {
    const snapshot = releaseSnapshotSchema.parse(input.snapshot);
    assertUniqueSnapshotAssetIds(snapshot.assets);
    const world = await this.worlds.createWorld({
      name: snapshot.package.world.name,
      type: snapshot.package.world.type,
      summary: snapshot.package.world.summary,
      tags: snapshot.package.world.tags,
      mode: "local",
      maturity: snapshot.package.world.maturity,
    });
    if (snapshot.package.format === "worlddock.world-package.v2") {
      try {
        for (const asset of snapshot.package.assets) {
          await this.createImportedOfficialAsset(world.id, asset);
        }
      } catch (error) {
        try {
          await this.worlds.deleteWorld(world.id);
        } catch {
          // Preserve the original import failure for callers.
        }
        throw error;
      }

      return {
        world: await this.toWorldResponse(world),
        remap: {
          assets: [],
          counts: {
            assets: snapshot.package.assets.length,
            archive: 0,
            seeds: 0,
            conflicts: 0,
          },
        },
      };
    }

    const assetIdMap = new Map<string, string>();
    for (const asset of snapshot.assets) {
      assetIdMap.set(asset.id, createLocalAssetId(asset.kind));
    }

    try {
      for (const [index, asset] of snapshot.assets.entries()) {
        await this.createImportedAsset(world.id, asset, {
          id: assetIdMap.get(asset.id),
          assetIdMap,
          position: index,
        });
      }
    } catch (error) {
      try {
        await this.worlds.deleteWorld(world.id);
      } catch {
        // Preserve the original import failure for callers.
      }
      throw error;
    }

    return {
      world: await this.toWorldResponse(world),
      remap: {
        assets: [...assetIdMap.entries()].map(([upstreamId, localId]) => ({ upstreamId, localId })),
        counts: countImportedAssets(snapshot.assets),
      },
    };
  }

  async buildReleaseSnapshot(input: { worldId: string; owner: string; slug: string; name?: string }): Promise<ReleaseSnapshot> {
    const world = await this.requireWorld(input.worldId);
    const built = await this.buildWorldPackagePayload(world);

    return releaseSnapshotSchema.parse({
      contractVersion: "1.0.0",
      repository: {
        owner: input.owner,
        slug: input.slug,
        name: input.name ?? world.name,
      },
      package: built.worldPackage,
      assets: built.snapshotAssets,
      createdAt: new Date().toISOString(),
    });
  }

  private async buildWorldPackage(world: WorldRecord): Promise<WorldPackage> {
    return (await this.buildWorldPackagePayload(world)).worldPackage;
  }

  private async buildWorldPackagePayload(world: WorldRecord): Promise<WorldPackageBuild> {
    const officialAssets = await this.buildOfficialPackageAssets(world.id);
    if (officialAssets.length > 0) {
      const worldPackage = worldPackageSchema.parse({
        format: "worlddock.world-package.v2",
        exportedAt: new Date().toISOString(),
        world: {
          name: world.name,
          type: world.type,
          summary: world.summary,
          tags: world.tags,
          maturity: world.maturity,
        },
        assets: officialAssets,
        releases: [],
      });

      return { worldPackage, snapshotAssets: [] };
    }

    const [archiveEntries, storySeeds, conflicts] = await Promise.all([
      this.worlds.listArchiveEntries(world.id),
      this.worlds.listStorySeeds(world.id),
      this.worlds.listConflicts(world.id),
    ]);
    const assets = [
      ...archiveEntries.map((entry) => ({
        id: entry.id,
        asset: {
          kind: "setting" as const,
          title: entry.title,
          summary: entry.summary,
          body: entry.body,
          payload: { category: entry.category, relations: entry.relations ?? [] },
        },
      })),
      ...storySeeds.map((seed) => ({
        id: seed.id,
        asset: {
          kind: "seed" as const,
          title: seed.title,
          summary: seed.hook,
          body: seed.conflict,
          payload: {
            trigger: seed.trigger ?? null,
            protagonists: seed.protagonists ?? null,
            questions: seed.questions ?? [],
          },
        },
      })),
      ...conflicts.map((conflict) => ({
        id: conflict.id,
        asset: {
          kind: "conflict" as const,
          title: conflict.title,
          summary: conflict.summary,
          body: conflict.body,
          payload: { related: conflict.related ?? [], derivedSeeds: conflict.derivedSeeds ?? [] },
        },
      })),
    ] satisfies Array<{ id: string; asset: LegacyWorldPackageAsset }>;

    const worldPackage = worldPackageSchema.parse({
      format: "worlddock.world-package.v1",
      exportedAt: new Date().toISOString(),
      world: {
        name: world.name,
        type: world.type,
        summary: world.summary,
        tags: world.tags,
        maturity: world.maturity,
      },
      assets: assets.map(({ asset }) => asset),
      releases: [],
    });
    const snapshotAssets = assets.map(({ id, asset }) => releaseSnapshotAssetSchema.parse({ id, ...asset }));

    return { worldPackage, snapshotAssets };
  }

  private async createImportedAsset(worldId: string, asset: ImportableAsset, options: ImportAssetOptions = {}) {
    if (asset.kind === "setting") {
      return this.worlds.createArchiveEntry({
        id: options.id,
        worldId,
        title: asset.title,
        category: stringPayload(asset.payload.category) ?? "Imported",
        summary: asset.summary,
        body: asset.body ?? asset.summary,
        relations: remapAssetIds(stringArrayPayload(asset.payload.relations), options.assetIdMap),
        position: options.position,
      });
    }
    if (asset.kind === "seed") {
      return this.worlds.createStorySeed({
        id: options.id,
        worldId,
        title: asset.title,
        hook: asset.summary,
        trigger: stringPayload(asset.payload.trigger),
        conflict: asset.body ?? asset.summary,
        protagonists: stringPayload(asset.payload.protagonists),
        questions: stringArrayPayload(asset.payload.questions),
        position: options.position,
      });
    }
    return this.worlds.createConflict({
      id: options.id,
      worldId,
      title: asset.title,
      summary: asset.summary,
      body: asset.body ?? asset.summary,
      related: remapAssetIds(stringArrayPayload(asset.payload.related), options.assetIdMap),
      derivedSeeds: remapAssetIds(stringArrayPayload(asset.payload.derivedSeeds), options.assetIdMap),
      position: options.position,
    });
  }

  private async createImportedOfficialAsset(worldId: string, asset: OfficialWorldPackageAsset) {
    return this.requireOfficialAssets().createAsset(worldId, {
      type: asset.type,
      name: asset.name,
      summary: asset.summary,
      markdown: asset.markdown,
      tags: asset.tags,
      metadata: asset.metadata,
    });
  }

  private async buildOfficialPackageAssets(worldId: string): Promise<OfficialWorldPackageAsset[]> {
    if (!this.officialAssets) return [];

    const records: Array<Awaited<ReturnType<OfficialAssetsService["listAssets"]>>["assets"][number]> = [];
    let cursor: string | undefined;
    do {
      const page = await this.officialAssets.listAssets(worldId, { cursor, limit: 50 });
      records.push(...page.assets);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    const details = await Promise.all(records.map((asset) => this.officialAssets!.getAsset(worldId, asset.id)));
    return details.map(({ asset, markdown }) => ({
      type: asset.type,
      name: asset.name,
      summary: asset.summary,
      markdown,
      tags: asset.tags,
      metadata: asset.metadata,
      status: asset.status,
      version: asset.version,
    }));
  }

  private requireOfficialAssets() {
    if (!this.officialAssets) {
      throw new BadRequestException({
        code: "OFFICIAL_ASSETS_UNAVAILABLE",
        message: "Official assets are not configured for this export operation.",
      });
    }
    return this.officialAssets;
  }

  private createExportRecord(kind: ExportRecord["kind"], payload: unknown) {
    const record: ExportRecord = {
      id: `export_${crypto.randomUUID()}`,
      kind,
      status: "ready",
      payload,
      createdAt: new Date(),
    };
    exportsStore.set(record.id, record);
    return record;
  }

  private requireExport(exportId: string) {
    const record = exportsStore.get(exportId);
    if (!record) throw this.notFound("Export not found.");
    return record;
  }

  private async requireWorld(worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound("World not found.");
    return world;
  }

  private async toWorldResponse(world: WorldRecord) {
    const counts = await this.worlds.countAssets(world.id);
    return {
      ...world,
      archive: counts.archive,
      seeds: counts.seeds,
      conflicts: counts.conflicts,
      updated: world.updatedAt.toISOString(),
      createdAt: world.createdAt.toISOString(),
      updatedAt: world.updatedAt.toISOString(),
    };
  }

  private notFound(message: string) {
    return new NotFoundException({ code: "NOT_FOUND", message });
  }
}

function toExportResponse(record: ExportRecord) {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}

function stringPayload(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringArrayPayload(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function assertUniqueSnapshotAssetIds(assets: ReleaseSnapshotAsset[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const asset of assets) {
    if (seen.has(asset.id)) duplicates.add(asset.id);
    seen.add(asset.id);
  }
  if (duplicates.size > 0) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "Release snapshot contains duplicate asset ids.",
      details: { assetIds: [...duplicates] },
    });
  }
}

function remapAssetIds(values: string[], assetIdMap?: Map<string, string>) {
  if (!assetIdMap) return values;
  return values.map((value) => assetIdMap.get(value) ?? value);
}

function createLocalAssetId(kind: ReleaseSnapshotAsset["kind"]) {
  const prefix = kind === "setting" ? "archive" : kind;
  return `${prefix}_${crypto.randomUUID()}`;
}

function countImportedAssets(assets: ReleaseSnapshotAsset[]) {
  return assets.reduce(
    (counts, asset) => {
      counts.assets += 1;
      if (asset.kind === "setting") counts.archive += 1;
      if (asset.kind === "seed") counts.seeds += 1;
      if (asset.kind === "conflict") counts.conflicts += 1;
      return counts;
    },
    { assets: 0, archive: 0, seeds: 0, conflicts: 0 },
  );
}
