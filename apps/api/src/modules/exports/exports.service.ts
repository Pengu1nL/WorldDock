import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  releaseSnapshotAssetSchema,
  releaseSnapshotSchema,
  worldPackageSchema,
  type ReleaseSnapshot,
  type ReleaseSnapshotAsset,
  type WorldPackage,
} from "@worlddock/domain";
import { WORLD_REPOSITORY, type WorldRecord, type WorldRepository } from "../worlds/world.repository";

type ExportRecord = {
  id: string;
  kind: "world";
  status: "ready";
  payload: unknown;
  createdAt: Date;
};

type WorldPackageAsset = WorldPackage["assets"][number];
type WorldPackageBuild = {
  worldPackage: WorldPackage;
  snapshotAssets: ReleaseSnapshotAsset[];
};

const exportsStore = new Map<string, ExportRecord>();

@Injectable()
export class ExportsService {
  constructor(
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
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
    await Promise.all(worldPackage.assets.map((asset) => this.createImportedAsset(world.id, asset)));
    return { world: await this.toWorldResponse(world) };
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
    ] satisfies Array<{ id: string; asset: WorldPackageAsset }>;

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

  private async createImportedAsset(worldId: string, asset: WorldPackage["assets"][number]) {
    if (asset.kind === "setting") {
      return this.worlds.createArchiveEntry({
        worldId,
        title: asset.title,
        category: stringPayload(asset.payload.category) ?? "Imported",
        summary: asset.summary,
        body: asset.body ?? asset.summary,
        relations: stringArrayPayload(asset.payload.relations),
      });
    }
    if (asset.kind === "seed") {
      return this.worlds.createStorySeed({
        worldId,
        title: asset.title,
        hook: asset.summary,
        trigger: stringPayload(asset.payload.trigger),
        conflict: asset.body ?? asset.summary,
        protagonists: stringPayload(asset.payload.protagonists),
        questions: stringArrayPayload(asset.payload.questions),
      });
    }
    return this.worlds.createConflict({
      worldId,
      title: asset.title,
      summary: asset.summary,
      body: asset.body ?? asset.summary,
      related: stringArrayPayload(asset.payload.related),
      derivedSeeds: stringArrayPayload(asset.payload.derivedSeeds),
    });
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
