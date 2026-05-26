import { describe, expect, it } from "vitest";
import {
  publishWorldResponseSchema,
  releaseSnapshotSchema,
  repositoryDetailSchema,
} from "../src";

describe("repository release contracts", () => {
  it("validates immutable release snapshots with public assets only", () => {
    const snapshot = releaseSnapshotSchema.parse({
      repositoryId: "repo_1",
      releaseId: "rel_1",
      world: {
        name: "回忆所",
        type: "近未来",
        summary: "记忆可以被买卖。",
        tags: ["记忆"],
        maturity: 64,
      },
      archiveEntries: [{ id: "a1", title: "规则", category: "世界规则", summary: "摘要", body: "正文" }],
      storySeeds: [{ id: "s1", title: "种子", hook: "钩子", trigger: "触发", conflict: "冲突", protagonists: "主角", questions: ["问题"] }],
      conflicts: [{ id: "c1", title: "冲突", summary: "摘要", body: "正文", related: [], derivedSeeds: [] }],
      createdAt: "2026-05-26T12:00:00.000Z",
    });

    expect(JSON.stringify(snapshot)).not.toContain("apiKey");
  });

  it("validates publish responses with repository detail and release metadata", () => {
    const response = publishWorldResponseSchema.parse({
      repository: {
        id: "repo_1",
        owner: "ren",
        slug: "memory-market",
        name: "回忆所",
        summary: "记忆交易社会。",
        tags: ["记忆"],
        stars: 0,
        forks: 0,
        updated: "刚刚",
        version: "v1.0.0",
        visibility: "public",
        license: "free-fork-attribution",
        releases: [{
          version: "v1.0.0",
          updated: "刚刚",
          note: "初始发布",
          addedSettings: 1,
          changedSettings: 0,
          removedSettings: 0,
          addedSeeds: 1,
          source: "cloud-publish",
        }],
      },
      release: {
        id: "rel_1",
        repositoryId: "repo_1",
        version: "v1.0.0",
        note: "初始发布",
        license: "free-fork-attribution",
        diff: { addedSettings: 1, changedSettings: 0, removedSettings: 0, addedSeeds: 1 },
        createdAt: "2026-05-26T12:00:00.000Z",
      },
    });

    expect(repositoryDetailSchema.parse(response.repository).version).toBe("v1.0.0");
  });
});
