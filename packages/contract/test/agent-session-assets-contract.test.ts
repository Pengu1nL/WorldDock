import { describe, expect, it } from "vitest";
import {
  agentSessionSchema,
  agentSessionMessageSchema,
  potentialAssetSchema,
  worldAssetDetailSchema,
  worldAssetPatchBatchSchema,
  consistencyIssueSchema,
} from "@worlddock/contract";

describe("agent session and asset contracts", () => {
  it("parses the unified session shape", () => {
    const parsed = agentSessionSchema.parse({
      id: "session_1",
      worldId: "world_1",
      kind: "world_exploration",
      title: "记忆交易推演",
      status: "active",
      current: true,
      metadata: { source: "user" },
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
    });
    expect(parsed.kind).toBe("world_exploration");
    expect(parsed.metadata).toEqual({ source: "user" });
  });

  it("parses message, potential asset, official asset, issue, and patch batch", () => {
    expect(
      agentSessionMessageSchema.parse({
        id: "msg_1",
        sessionId: "session_1",
        role: "assistant",
        content: "可以先确认记忆交易的边界。",
        status: "complete",
        metadata: {},
        createdAt: "2026-06-14T00:00:00.000Z",
      }).role,
    ).toBe("assistant");

    expect(
      potentialAssetSchema.parse({
        id: "pa_1",
        worldId: "world_1",
        sessionId: "session_1",
        runId: "run_1",
        type: "rule",
        title: "记忆交易许可",
        summary: "记忆交易需要登记。",
        evidence: [{ messageId: "msg_1", quote: "需要登记", confidence: 0.81 }],
        status: "active",
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
      }).type,
    ).toBe("rule");

    expect(
      worldAssetDetailSchema.parse({
        asset: {
          id: "asset_1",
          worldId: "world_1",
          type: "rule",
          name: "记忆交易许可",
          summary: "记忆交易需要登记。",
          documentKey: "worlds/world_1/assets/asset_1.md",
          status: "active",
          version: 1,
          tags: ["法律"],
          metadata: {},
          createdAt: "2026-06-14T00:00:00.000Z",
          updatedAt: "2026-06-14T00:00:00.000Z",
        },
        markdown: "# 记忆交易许可\n\n记忆交易需要登记。",
        indexes: [],
        revisions: [],
      }).asset.type,
    ).toBe("rule");

    expect(
      consistencyIssueSchema.parse({
        id: "issue_1",
        worldId: "world_1",
        title: "许可口径冲突",
        description: "登记制与自由交易描述冲突。",
        severity: "normal",
        status: "open",
        subjectAssetIds: ["asset_1"],
        evidence: [],
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
      }).status,
    ).toBe("open");

    expect(
      worldAssetPatchBatchSchema.parse({
        id: "batch_1",
        worldId: "world_1",
        sessionId: "session_2",
        issueId: "issue_1",
        status: "applied",
        patchIds: ["patch_1"],
        createdAt: "2026-06-14T00:00:00.000Z",
        appliedAt: "2026-06-14T00:00:00.000Z",
        revertedAt: null,
      }).patchIds,
    ).toEqual(["patch_1"]);
  });
});
