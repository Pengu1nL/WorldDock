import { describe, expect, it } from "vitest";
import { SafetyGate } from "./safety-gate";
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
    expect(describeWorldTools({ kind: "consistency_repair" }).map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "apply_world_asset_patch",
      "resolve_consistency_issue",
    ]));
  });
});
