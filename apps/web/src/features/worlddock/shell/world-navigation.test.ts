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

  it("normalizes legacy view ids", () => {
    expect(normalizeWorldDockView("workbench")).toBe("exploration");
    expect(normalizeWorldDockView("archive")).toBe("asset-library");
    expect(normalizeWorldDockView("seeds")).toBe("asset-library");
    expect(normalizeWorldDockView("conflicts")).toBe("asset-library");
  });
});
