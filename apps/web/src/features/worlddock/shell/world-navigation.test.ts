import { describe, expect, it } from "vitest";
import { getWorldNavigationItems, normalizeWorldDockView } from "./world-navigation";

describe("world navigation", () => {
  it("uses the new product IA", () => {
    const items = getWorldNavigationItems({ hasWorld: true });

    expect(items.map((item) => item.label)).toEqual([
      "推演",
      "资产库",
      "矛盾",
      "发布",
    ]);
    expect(items.map((item) => item.id)).toEqual([
      "exploration",
      "asset-library",
      "consistency",
      "publish",
    ]);
    expect(items.map((item) => item.icon)).toEqual([
      "session",
      "assets",
      "consistency",
      "push",
    ]);
  });

  it("hides world navigation items when no world is open", () => {
    expect(getWorldNavigationItems({ hasWorld: false })).toEqual([]);
  });

  it("passes through new view ids", () => {
    expect(normalizeWorldDockView("consistency")).toBe("consistency");
  });

  it("falls back unknown view ids to worlds", () => {
    expect(normalizeWorldDockView("unknown-view")).toBe("worlds");
  });

  it("normalizes legacy view ids", () => {
    expect(normalizeWorldDockView("workbench")).toBe("exploration");
    expect(normalizeWorldDockView("archive")).toBe("asset-library");
    expect(normalizeWorldDockView("seeds")).toBe("asset-library");
  });

  it("keeps legacy conflicts events on asset-library during the transition", () => {
    // Phase 9.2 keeps old conflicts events compatible while the new consistency page settles.
    expect(normalizeWorldDockView("conflicts")).toBe("asset-library");
  });
});
