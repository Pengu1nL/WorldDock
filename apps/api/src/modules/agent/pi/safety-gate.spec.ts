import { describe, expect, it, vi } from "vitest";
import { SafetyGate } from "./safety-gate";
import { createWorldToolRegistry } from "./world-tools";
import { describeWorldTools } from "./world-tool-registry";

describe("SafetyGate session policies", () => {
  it("blocks write tools in world exploration", () => {
    const gate = new SafetyGate();

    expect(() => gate.assertToolAllowed({
      id: "tool_1",
      name: "create_world_asset",
      arguments: { worldId: "world_1" },
    }, new Set(), { kind: "world_exploration" })).toThrow(/Blocked unsafe pi tool/);
  });

  it("allows create_world_asset for asset deposition intent", () => {
    const gate = new SafetyGate();

    expect(() => gate.assertToolAllowed({
      id: "tool_1",
      name: "create_world_asset",
      arguments: { worldId: "world_1", type: "rule", name: "记忆交易许可" },
    }, new Set(), { kind: "world_exploration", intent: "asset_deposition" })).not.toThrow();
  });
});

describe("describeWorldTools session policies", () => {
  it("keeps default world exploration to read and pending suggestion tools", () => {
    const names = describeWorldTools({ kind: "world_exploration" }).map((tool) => tool.name);

    expect(names).toContain("get_world_manifest");
    expect(names).toContain("propose_setting");
    expect(names).not.toContain("create_world_asset");
    expect(names).not.toContain("apply_world_asset_patch");
    expect(names).not.toContain("resolve_consistency_issue");
  });

  it("describes formal asset tools only for matching session policies", () => {
    expect(describeWorldTools({ kind: "world_exploration", intent: "asset_deposition" }).map((tool) => tool.name)).toContain("create_world_asset");
    expect(describeWorldTools({ kind: "asset_edit" }).map((tool) => tool.name)).toContain("apply_world_asset_patch");
    expect(describeWorldTools({ kind: "asset_edit" }).map((tool) => tool.name)).not.toContain("resolve_consistency_issue");
    expect(describeWorldTools({ kind: "consistency_repair" }).map((tool) => tool.name)).toContain("resolve_consistency_issue");
    expect(describeWorldTools({ kind: "consistency_repair" }).map((tool) => tool.name)).not.toContain("apply_world_asset_patch");
  });

  it("describes apply_world_asset_patch with direct asset edit inputs", () => {
    const tool = describeWorldTools({ kind: "asset_edit" }).find((item) => item.name === "apply_world_asset_patch");

    expect(tool).toMatchObject({
      description: expect.stringContaining("asset edit"),
      inputSchema: {
        type: "object",
        required: ["worldId", "assetId", "sessionId", "afterMarkdown"],
      },
    });
  });

  it("describes resolve_consistency_issue with batch patch inputs", () => {
    const tool = describeWorldTools({ kind: "consistency_repair" }).find((item) => item.name === "resolve_consistency_issue");

    expect(tool).toMatchObject({
      inputSchema: {
        type: "object",
        required: ["worldId", "issueId", "sessionId", "patches"],
      },
    });
  });

  it("limits asset deposition tools to read tools and create_world_asset", () => {
    const names = describeWorldTools({ kind: "world_exploration", intent: "asset_deposition" }).map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining([
      "get_world_manifest",
      "search_world_assets",
      "get_asset_brief",
      "get_asset_detail",
      "get_asset_source_fragments",
      "list_local_releases",
      "create_world_asset",
    ]));
    expect(names).not.toContain("propose_setting");
    expect(names.filter((name) => name.startsWith("propose_"))).toEqual([]);
    expect(names).not.toContain("apply_world_asset_patch");
    expect(names).not.toContain("resolve_consistency_issue");
  });
});

describe("apply_world_asset_patch tool handler", () => {
  it("calls the patch service and preserves markdown whitespace", async () => {
    const applyPatch = vi.fn(async (input) => ({
      id: "patch_1",
      ...input,
    }));
    const registry = createWorldToolRegistry({} as never, undefined, { applyPatch } as never);
    const afterMarkdown = "\n# 记忆交易许可\n\n## 概括\n\n登记许可必须每年续期。\n";

    await registry.execute("apply_world_asset_patch", {
      worldId: "world_1",
      assetId: "asset_1",
      sessionId: "session_1",
      afterMarkdown,
      reason: "补充续期规则",
    });

    expect(applyPatch).toHaveBeenCalledWith({
      worldId: "world_1",
      assetId: "asset_1",
      sessionId: "session_1",
      afterMarkdown,
      reason: "补充续期规则",
    });
  });
});

describe("resolve_consistency_issue tool handler", () => {
  it("calls the consistency batch path and preserves markdown whitespace", async () => {
    const applyPatchBatch = vi.fn(async (input) => ({
      id: "batch_1",
      ...input,
    }));
    const registry = createWorldToolRegistry({} as never, undefined, undefined, { applyPatchBatch } as never);
    const afterMarkdown = "\n# 自由交易日\n\n## 概括\n\n自由交易日当天仍需登记，但费用为零。\n";

    await registry.execute("resolve_consistency_issue", {
      worldId: "world_1",
      issueId: "issue_1",
      sessionId: "session_1",
      patches: [{
        assetId: "asset_2",
        afterMarkdown,
        reason: "统一登记口径",
      }],
    });

    expect(applyPatchBatch).toHaveBeenCalledWith({
      worldId: "world_1",
      issueId: "issue_1",
      sessionId: "session_1",
      patches: [{
        assetId: "asset_2",
        afterMarkdown,
        reason: "统一登记口径",
      }],
    });
  });

  it("rejects blank patches before calling the consistency service", async () => {
    const applyPatchBatch = vi.fn();
    const registry = createWorldToolRegistry({} as never, undefined, undefined, { applyPatchBatch } as never);

    await expect(registry.execute("resolve_consistency_issue", {
      worldId: "world_1",
      issueId: "issue_1",
      sessionId: "session_1",
      patches: [{ assetId: "", afterMarkdown: "" }],
    })).rejects.toThrow(/assetId and afterMarkdown/);
    expect(applyPatchBatch).not.toHaveBeenCalled();
  });
});
