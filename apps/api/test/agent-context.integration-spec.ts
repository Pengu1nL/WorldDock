import { describe, expect, it } from "vitest";
import { selectInitialWorldContext } from "../src/modules/agent/context-builder";
import { SafetyGate } from "../src/modules/agent/pi/safety-gate";

describe("agent context progressive disclosure", () => {
  it("starts every run with one manifest, ranked cards, and matching briefs", () => {
    const refs = selectInitialWorldContext({
      prompt: "继续推演《记忆交易法》的漏洞",
      manifest: {
        worldId: "world_1",
        name: "回忆所",
        type: "近未来",
        summary: "记忆可以被买卖。",
        tags: ["记忆"],
        status: "draft",
        visibility: "private",
        assetCounts: { archive: 2, seeds: 1, conflicts: 0 },
        recentChanges: [],
        index: [],
      },
      cards: [
        { worldId: "world_1", targetId: "asset_1", kind: "setting", title: "《记忆交易法》", excerpt: "交易制度。", tags: [], relations: [], score: 1 },
        { worldId: "world_1", targetId: "asset_2", kind: "seed", title: "继承的童年", excerpt: "陌生童年。", tags: [], relations: [], score: 5 },
      ],
      briefs: [
        { worldId: "world_1", targetId: "asset_1", kind: "setting", title: "《记忆交易法》", excerpt: "交易制度。", tags: [], relations: [], summary: "认证机构主持交易。", facts: [], openQuestions: [], sourcePointers: [], score: 1 },
      ],
    });

    expect(refs.map((ref) => ref.level)).toEqual(["manifest", "card", "card", "brief"]);
    expect(refs[1]).toMatchObject({ targetId: "asset_1", title: "《记忆交易法》" });
  });

  it("blocks detail and source-fragment expansion before card or brief disclosure", () => {
    const gate = new SafetyGate();

    expect(() =>
      gate.assertToolAllowed({
        id: "tool_1",
        name: "get_asset_detail",
        arguments: { assetId: "asset_1" },
      }),
    ).toThrow("Blocked premature asset expansion");

    expect(() =>
      gate.assertToolAllowed({
        id: "tool_2",
        name: "get_asset_detail",
        arguments: { assetId: "asset_1" },
      }, new Set(["asset_1"])),
    ).not.toThrow();
  });
});
