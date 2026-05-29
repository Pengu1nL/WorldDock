import { describe, expect, it, vi } from "vitest";
import { WorldAssetsService } from "./world-assets.service";

describe("WorldAssetsService", () => {
  it("hydrates stored relation labels into listed assets", async () => {
    const service = new WorldAssetsService();
    (service as any).prisma = createPrismaStub();

    const settings = await service.listAssets("world_1", { kind: "setting" });
    expect(settings.assets).toHaveLength(1);
    expect(settings.assets[0]?.payload.relations).toEqual(["旧标签"]);
    expect(settings.assets[0]?.payload.relationLabels).toEqual(["继承的童年"]);
    expect(settings.assets[0]?.payload.relationTargets).toEqual([
      { targetAssetId: "seed_1", label: "继承的童年" },
    ]);

    const conflicts = await service.listAssets("world_1", { kind: "conflict" });
    expect(conflicts.assets).toHaveLength(1);
    expect(conflicts.assets[0]?.payload.related).toEqual(["原始关联"]);
    expect(conflicts.assets[0]?.payload.relationLabels).toEqual(["《记忆交易法》"]);
  });

  it("does not write relation-table labels back into legacy fields", async () => {
    const service = new WorldAssetsService();
    const prisma = createPrismaStub();
    (service as any).prisma = prisma;

    const settings = await service.listAssets("world_1", { kind: "setting" });
    await service.updateAsset("world_1", "setting_1", {
      title: settings.assets[0]?.title,
      summary: settings.assets[0]?.summary,
      body: settings.assets[0]?.body,
      payload: settings.assets[0]?.payload,
    });

    expect(prisma.archiveEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ relations: ["旧标签"] }),
    }));
  });

  it("removes stale legacy labels when deleting a relation", async () => {
    const service = new WorldAssetsService();
    const prisma = createPrismaStub();
    prisma.__data.archiveEntries[0].relations = ["旧标签", "继承的童年"];
    (service as any).prisma = prisma;

    await service.deleteRelation("world_1", "setting_1", "seed_1");

    expect(prisma.worldAssetRelation.deleteMany).toHaveBeenCalledWith({
      where: { worldId: "world_1", sourceAssetId: "setting_1", targetAssetId: "seed_1" },
    });
    expect(prisma.archiveEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "setting_1" },
      data: { relations: ["旧标签"] },
    }));
  });
});

function createPrismaStub() {
  const now = new Date("2026-05-29T00:00:00.000Z");
  const archiveEntries = [{
    id: "setting_1",
    worldId: "world_1",
    title: "《记忆交易法》",
    category: "世界规则",
    summary: "确立记忆资产交易制度。",
    body: "只有认证机构可以主持记忆交易。",
    relations: ["旧标签"],
    position: 0,
    createdAt: now,
    updatedAt: now,
  }];
  const storySeeds = [{
    id: "seed_1",
    worldId: "world_1",
    title: "继承的童年",
    hook: "她继承了一段陌生童年。",
    trigger: null,
    conflict: "人格权与继承权冲突。",
    protagonists: null,
    questions: [],
    position: 1,
    createdAt: now,
    updatedAt: now,
  }];
  const conflicts = [{
    id: "conflict_1",
    worldId: "world_1",
    title: "撤销权争议",
    summary: "撤销交易会影响继承链。",
    body: "一段记忆被多人主张所有权。",
    related: ["原始关联"],
    derivedSeeds: [],
    position: 2,
    createdAt: now,
    updatedAt: now,
  }];
  const relations = [
    { worldId: "world_1", sourceAssetId: "setting_1", targetAssetId: "seed_1", createdAt: now },
    { worldId: "world_1", sourceAssetId: "conflict_1", targetAssetId: "setting_1", createdAt: now },
  ];

  return {
    __data: { archiveEntries, storySeeds, conflicts, relations },
    archiveEntry: {
      findMany: vi.fn(async (args: any) => filterRecords(archiveEntries, args)),
      findFirst: vi.fn(async (args: any) => findRecord(archiveEntries, args)),
      update: vi.fn(async (args: any) => updateRecord(archiveEntries, args)),
    },
    storySeed: {
      findMany: vi.fn(async (args: any) => filterRecords(storySeeds, args)),
      findFirst: vi.fn(async (args: any) => findRecord(storySeeds, args)),
      update: vi.fn(async (args: any) => updateRecord(storySeeds, args)),
    },
    conflict: {
      findMany: vi.fn(async (args: any) => filterRecords(conflicts, args)),
      findFirst: vi.fn(async (args: any) => findRecord(conflicts, args)),
      update: vi.fn(async (args: any) => updateRecord(conflicts, args)),
    },
    worldAssetRelation: {
      findMany: vi.fn(async (args: any) => relations.filter((relation) =>
        relation.worldId === args.where.worldId &&
        args.where.sourceAssetId.in.includes(relation.sourceAssetId),
      )),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

function filterRecords<T extends { id: string; worldId: string; title: string }>(records: T[], args: any) {
  const filtered = records.filter((record) =>
    record.worldId === args.where.worldId &&
    (!args.where.id?.in || args.where.id.in.includes(record.id)),
  );
  if (!args.select) return filtered;
  return filtered.map((record) => ({ id: record.id, title: record.title }));
}

function findRecord<T extends { id: string; worldId: string }>(records: T[], args: any) {
  return records.find((record) =>
    record.id === args.where.id &&
    record.worldId === args.where.worldId,
  ) ?? null;
}

function updateRecord<T extends { id: string }>(records: T[], args: any) {
  const index = records.findIndex((record) => record.id === args.where.id);
  if (index < 0) return null;
  records[index] = { ...records[index], ...args.data };
  return records[index];
}
