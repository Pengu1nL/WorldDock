import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { worldPackageSchema, type WorldPackage } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { REPOSITORY_REPOSITORY, type RepositoryRepository } from "../repositories/repository.repository";
import { WORLD_REPOSITORY, type WorldRecord, type WorldRepository } from "../worlds/world.repository";

type ExportRecord = {
  id: string;
  userId: string;
  kind: "world" | "account";
  status: "ready";
  payload: unknown;
  createdAt: Date;
};

const exportsStore = new Map<string, ExportRecord>();

@Injectable()
export class ExportsService {
  constructor(
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
  ) {}

  async exportWorld(subject: AuthSubject, worldId: string) {
    const world = await this.requireOwnedWorld(subject, worldId);
    const payload = await this.buildWorldPackage(world);
    const record = this.createExportRecord(subject.user.id, "world", payload);
    return { export: toExportResponse(record) };
  }

  async getExport(subject: AuthSubject, exportId: string) {
    const record = this.requireExport(subject, exportId);
    return { export: toExportResponse(record), package: record.payload };
  }

  async importWorld(subject: AuthSubject, input: { package: unknown }) {
    const worldPackage = worldPackageSchema.parse(input.package);
    const world = await this.worlds.createWorld({
      ownerId: subject.user.id,
      name: worldPackage.world.name,
      type: worldPackage.world.type,
      summary: worldPackage.world.summary,
      tags: worldPackage.world.tags,
      mode: "cloud",
      maturity: worldPackage.world.maturity,
    });
    await Promise.all(worldPackage.assets.map((asset) => this.createImportedAsset(world.id, asset)));
    return { world: await this.toWorldResponse(world) };
  }

  async requestAccountDataExport(subject: AuthSubject) {
    const worlds = await this.worlds.listWorlds(subject.user.id);
    const payload = {
      format: "worlddock.account-export.v1",
      exportedAt: new Date().toISOString(),
      user: {
        id: subject.user.id,
        email: subject.user.email,
        name: subject.user.name,
      },
      worlds: await Promise.all(worlds.map((world) => this.buildWorldPackage(world))),
    };
    const record = this.createExportRecord(subject.user.id, "account", payload);
    return { export: toExportResponse(record) };
  }

  async getAccountDataExport(subject: AuthSubject, exportId: string) {
    const record = this.requireExport(subject, exportId);
    if (record.kind !== "account") throw this.notFound("Account export not found.");
    return { export: toExportResponse(record), data: record.payload };
  }

  private async buildWorldPackage(world: WorldRecord): Promise<WorldPackage> {
    const [archiveEntries, storySeeds, conflicts] = await Promise.all([
      this.worlds.listArchiveEntries(world.id),
      this.worlds.listStorySeeds(world.id),
      this.worlds.listConflicts(world.id),
    ]);
    const repository = await this.repositories.findByWorldId(world.id);
    const releases = repository
      ? (await this.repositories.listReleases(repository.id)).map((release) => ({
          version: release.version,
          note: release.note,
          createdAt: release.createdAt.toISOString(),
        }))
      : [];

    return worldPackageSchema.parse({
      format: "worlddock.world-package.v1",
      exportedAt: new Date().toISOString(),
      world: {
        name: world.name,
        type: world.type,
        summary: world.summary,
        tags: world.tags,
        maturity: world.maturity,
      },
      assets: [
        ...archiveEntries.map((entry) => ({
          kind: "setting",
          title: entry.title,
          summary: entry.summary,
          body: entry.body,
          payload: { category: entry.category, relations: entry.relations ?? [] },
        })),
        ...storySeeds.map((seed) => ({
          kind: "seed",
          title: seed.title,
          summary: seed.hook,
          body: seed.conflict,
          payload: {
            trigger: seed.trigger ?? null,
            protagonists: seed.protagonists ?? null,
            questions: seed.questions ?? [],
          },
        })),
        ...conflicts.map((conflict) => ({
          kind: "conflict",
          title: conflict.title,
          summary: conflict.summary,
          body: conflict.body,
          payload: { related: conflict.related ?? [], derivedSeeds: conflict.derivedSeeds ?? [] },
        })),
      ],
      releases,
    });
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

  private createExportRecord(userId: string, kind: ExportRecord["kind"], payload: unknown) {
    const record: ExportRecord = {
      id: `export_${crypto.randomUUID()}`,
      userId,
      kind,
      status: "ready",
      payload,
      createdAt: new Date(),
    };
    exportsStore.set(record.id, record);
    return record;
  }

  private requireExport(subject: AuthSubject, exportId: string) {
    const record = exportsStore.get(exportId);
    if (!record) throw this.notFound("Export not found.");
    if (record.userId !== subject.user.id) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not have access to this export." });
    }
    return record;
  }

  private async requireOwnedWorld(subject: AuthSubject, worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound("World not found.");
    if (world.ownerId !== subject.user.id) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not have access to this world." });
    }
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
