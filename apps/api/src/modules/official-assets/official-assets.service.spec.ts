import { describe, expect, it, vi } from "vitest";
import { OfficialAssetsService } from "./official-assets.service";

describe("OfficialAssetsService", () => {
  it("deletes stored markdown when repository creation fails", async () => {
    const failure = new Error("database unavailable");
    const repository = {
      createAsset: vi.fn(async () => {
        throw failure;
      }),
    };
    const worlds = {
      findWorldById: vi.fn(async () => ({
        id: "world_1",
        name: "回忆所",
        type: "近未来",
        summary: "记忆可以被买卖。",
        tags: [],
        status: "draft",
        visibility: "private",
        mode: "local",
        maturity: 0,
        coverObjectId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      })),
    };
    const localStorage = {
      saveObject: vi.fn(async () => ({ key: "unused", filePath: "unused", sizeBytes: 1 })),
      deleteObject: vi.fn(async () => undefined),
    };
    const service = new OfficialAssetsService(repository as never, worlds as never, localStorage as never);

    await expect(service.createAsset("world_1", {
      type: "rule",
      name: "记忆交易许可",
      summary: "所有记忆交易都需要登记。",
    })).rejects.toBe(failure);

    expect(localStorage.saveObject).toHaveBeenCalledOnce();
    expect(localStorage.deleteObject).toHaveBeenCalledWith(expect.stringMatching(
      /^worlds\/world_1\/official-assets\/official_asset_.+\.md$/,
    ));
  });
});
