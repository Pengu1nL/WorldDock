import { describe, expect, it } from "vitest";
import { getWorldNavigationItems, normalizeWorldDockView } from "./world-navigation";

describe("world navigation", () => {
  it("uses the new product IA", () => {
    const items = getWorldNavigationItems({ hasWorld: true });

    expect(items.map((item) => item.label)).toEqual([
      "推演",
      "故事",
      "资产库",
      "矛盾",
    ]);
    expect(items.map((item) => item.id)).toEqual([
      "exploration",
      "stories",
      "asset-library",
      "consistency",
    ]);
    expect(items.map((item) => item.icon)).toEqual([
      "session",
      "explore",
      "assets",
      "consistency",
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
    expect(normalizeWorldDockView("publish")).toBe("exploration");
  });

  it("does not map retired pool view ids", () => {
    expect(normalizeWorldDockView("archive")).toBe("worlds");
    expect(normalizeWorldDockView("seeds")).toBe("worlds");
    expect(normalizeWorldDockView("conflicts")).toBe("worlds");
  });
});
