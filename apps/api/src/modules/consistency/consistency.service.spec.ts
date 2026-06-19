import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type {
  OfficialAssetDetailRecord,
  OfficialAssetRecord,
  OfficialAssetsRepository,
} from "../official-assets/official-assets.repository";
import type { WorldRepository, WorldRecord } from "../worlds/world.repository";
import type { ConsistencyRepository } from "./consistency.repository";
import { ConsistencyService } from "./consistency.service";

describe("ConsistencyService", () => {
  it("rejects manually created issues whose subject assets are not official assets in the world", async () => {
    const { consistencyIssues, service } = createConsistencyService({
      assets: [buildOfficialAsset({ id: "official_asset_1", worldId: "world_1" })],
    });

    await expect(service.createIssue({
      worldId: "world_1",
      title: "登记口径冲突",
      description: "必须登记与无需登记冲突。",
      subjectAssetIds: ["official_asset_1", "official_asset_missing"],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(consistencyIssues.createIssueIfOpenDedupeKeyAbsent).not.toHaveBeenCalled();
  });
});

function createConsistencyService({ assets }: { assets: OfficialAssetRecord[] }) {
  const world = buildWorld();
  const consistencyIssues: ConsistencyRepository = {
    createIssueIfOpenDedupeKeyAbsent: vi.fn(async (input) => ({
      id: "issue_1",
      ...input,
      metadata: input.metadata ?? {},
      status: "open",
      createdAt: new Date("2026-06-19T00:00:00.000Z"),
      updatedAt: new Date("2026-06-19T00:00:00.000Z"),
      resolvedAt: null,
    })),
    getIssue: vi.fn(async () => null),
    listIssues: vi.fn(async () => ({ issues: [], nextCursor: null })),
    updateIssueStatus: vi.fn(async () => null),
  };
  const officialAssets: OfficialAssetsRepository = {
    createAsset: vi.fn(async () => {
      throw new Error("createAsset is not used in this test.");
    }),
    getAsset: vi.fn(async (worldId, assetId) => {
      const asset = assets.find((candidate) => candidate.id === assetId && candidate.worldId === worldId);
      return asset ? buildOfficialAssetDetail(asset) : null;
    }),
    listAssets: vi.fn(async (worldId) => ({
      assets: assets.filter((asset) => asset.worldId === worldId),
      nextCursor: null,
    })),
    updateAsset: vi.fn(async () => null),
  };
  const worlds = {
    findWorldById: vi.fn(async (worldId: string) => (worldId === world.id ? world : null)),
  } as unknown as WorldRepository;

  return {
    consistencyIssues,
    service: new ConsistencyService(
      consistencyIssues,
      officialAssets,
      worlds,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}

function buildOfficialAsset(overrides: Partial<OfficialAssetRecord> = {}): OfficialAssetRecord {
  return {
    id: "official_asset_1",
    worldId: "world_1",
    type: "rule",
    name: "记忆交易许可",
    summary: "所有记忆交易必须登记。",
    documentKey: "world_1/rule/official_asset_1",
    status: "active",
    version: 1,
    tags: [],
    metadata: {},
    createdAt: new Date("2026-06-19T00:00:00.000Z"),
    updatedAt: new Date("2026-06-19T00:00:00.000Z"),
    archivedAt: null,
    ...overrides,
  };
}

function buildOfficialAssetDetail(asset: OfficialAssetRecord): OfficialAssetDetailRecord {
  return {
    asset,
    revisions: [],
    indexes: [],
  };
}

function buildWorld(): WorldRecord {
  return {
    id: "world_1",
    name: "回忆所",
    type: "近未来",
    summary: "记忆可以被买卖。",
    tags: ["记忆"],
    status: "draft",
    visibility: "private",
    mode: "local",
    maturity: 12,
    coverObjectId: null,
    createdAt: new Date("2026-06-19T00:00:00.000Z"),
    updatedAt: new Date("2026-06-19T00:00:00.000Z"),
    deletedAt: null,
  };
}
