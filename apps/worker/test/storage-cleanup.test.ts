import { describe, expect, it, vi } from "vitest";
import { cleanupOrphanedStorageObjects } from "../src/storage-cleanup";

describe("storage cleanup worker", () => {
  it("deletes stale cleanup candidates and marks them deleted", async () => {
    const source = {
      listCleanupCandidates: vi.fn(async () => [{ id: "object_1", bucket: "worlddock", key: "pending/file.png" }]),
      deleteObject: vi.fn(async () => {}),
      markDeleted: vi.fn(async () => {}),
    };
    const now = new Date("2026-05-26T12:00:00.000Z");

    const count = await cleanupOrphanedStorageObjects(source, { now, olderThanMs: 60_000 });

    expect(count).toBe(1);
    expect(source.deleteObject).toHaveBeenCalledWith({ id: "object_1", bucket: "worlddock", key: "pending/file.png" });
    expect(source.markDeleted).toHaveBeenCalledWith("object_1", now);
  });
});
