import { describe, expect, it, vi } from "vitest";
import type { PotentialAssetRecord } from "./potential-assets.repository";
import { PrismaPotentialAssetsRepository } from "./prisma-potential-assets.repository";

describe("PrismaPotentialAssetsRepository", () => {
  it("uses Prisma JSON equals filters for metadata-locked updates", async () => {
    let asset = potentialAsset({ metadata: { detector: "test" } });
    const updateCalls: Array<{ where: Record<string, unknown> }> = [];
    const repository = new PrismaPotentialAssetsRepository();
    Object.defineProperty(repository, "prisma", {
      value: {
        potentialAsset: {
          findFirst: vi.fn(async () => asset),
          findUnique: vi.fn(async () => asset),
          updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<PotentialAssetRecord> }) => {
            updateCalls.push({ where });
            if (where.metadata && !isJsonEqualsFilter(where.metadata)) {
              throw new Error("metadata where filter must use equals");
            }
            asset = { ...asset, ...data, updatedAt: new Date("2026-05-28T10:00:01.000Z") };
            return { count: 1 };
          }),
        },
      },
    });

    await repository.dismiss("world_1", "pa_1");

    asset = potentialAsset({ metadata: { detector: "test" } });
    await repository.claimPromotion("world_1", "pa_1", { promotionToken: "promotion_1" });

    asset = potentialAsset({ metadata: { detector: "test", promotionToken: "promotion_1" } });
    await repository.completePromotion("world_1", "pa_1", "official_asset_pa_1", "promotion_1", {
      officialAssetId: "official_asset_pa_1",
    });

    asset = potentialAsset({ metadata: { detector: "test", promotionToken: "promotion_2" } });
    await repository.rollbackPromotion("world_1", "pa_1", "promotion_2", { detector: "test" });

    expect(updateCalls).toHaveLength(4);
    expect(updateCalls.map((call) => call.where.metadata)).toEqual([
      { equals: { detector: "test" } },
      { equals: { detector: "test" } },
      { equals: { detector: "test", promotionToken: "promotion_1" } },
      { equals: { detector: "test", promotionToken: "promotion_2" } },
    ]);
  });
});

function potentialAsset(overrides: Partial<PotentialAssetRecord> = {}): PotentialAssetRecord {
  const timestamp = new Date("2026-05-28T10:00:00.000Z");
  return {
    id: "pa_1",
    worldId: "world_1",
    sessionId: "session_1",
    runId: null,
    type: "rule",
    title: "记忆交易许可",
    summary: "需要登记。",
    evidence: [],
    status: "active",
    promotedAssetId: null,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function isJsonEqualsFilter(value: unknown) {
  return typeof value === "object" && value !== null && "equals" in value;
}
