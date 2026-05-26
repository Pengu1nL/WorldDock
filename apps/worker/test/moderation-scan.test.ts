import { describe, expect, it, vi } from "vitest";
import {
  enqueuePendingModerationScanEvents,
  MODERATION_SCAN_JOB_NAME,
  processModerationScanJob,
  scanRepositoryForModeration,
} from "../src/moderation-scan";

const repository = {
  id: "repo_1",
  name: "公开世界",
  summary: "一座安静的海港。",
  tags: ["海港"],
};

describe("moderation scan worker", () => {
  it("flags sensitive words and duplicate report threshold", () => {
    expect(scanRepositoryForModeration({ ...repository, summary: "包含违禁内容。" }, 3)).toEqual([
      "sensitive_word",
      "duplicate_report_threshold",
    ]);
  });

  it("flags repositories from scan jobs", async () => {
    const source = {
      loadRepositoryForModeration: vi.fn(async () => ({ ...repository, summary: "" })),
      countOpenReports: vi.fn(async () => 0),
      flagRepository: vi.fn(async () => {}),
    };

    const result = await processModerationScanJob({ repositoryId: "repo_1" }, source);

    expect(result).toBe("flagged");
    expect(source.flagRepository).toHaveBeenCalledWith("repo_1", "empty_content");
  });

  it("enqueues moderation scan outbox events", async () => {
    const queue = { add: vi.fn(async () => {}) };

    const count = await enqueuePendingModerationScanEvents({
      async listPending() {
        return [
          { id: "out_1", type: "repository.moderation_scan_requested", aggregateId: "repo_1", payload: {} },
          { id: "out_2", type: "repository.published", aggregateId: "repo_1", payload: {} },
        ];
      },
    }, queue);

    expect(count).toBe(1);
    expect(queue.add).toHaveBeenCalledWith(
      MODERATION_SCAN_JOB_NAME,
      { eventId: "out_1", repositoryId: "repo_1" },
      expect.objectContaining({ jobId: "out_1", attempts: 3 }),
    );
  });
});
