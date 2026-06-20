// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getOfficialAssetCardSummary } from "./official-asset-card";
import { OfficialAssetLibraryPage } from "./official-asset-library-page";

describe("OfficialAssetLibraryPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders type filters and opens an asset from props", () => {
    const onOpenAsset = vi.fn();
    const onCreateAsset = vi.fn();
    const world = { id: "world_1", name: "记忆城邦" };

    render(
      <OfficialAssetLibraryPage
        world={world}
        assets={[
          {
            id: "asset_1",
            type: "rule",
            name: "记忆交易许可",
            summary: "需要登记。",
            version: 1,
            tags: ["法律"],
          },
          {
            id: "asset_2",
            type: "organization",
            name: "红岩联合",
            summary: "控制黑市。",
            version: 1,
            tags: [],
          },
        ] as any}
        loading={false}
        onOpenAsset={onOpenAsset}
        onCreateAsset={onCreateAsset}
      />,
    );

    expect(screen.getByText("全部")).toBeInTheDocument();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(screen.getByText("组织")).toBeInTheDocument();
    expect(screen.getByText("地点")).toBeInTheDocument();
    expect(screen.getByText("事件")).toBeInTheDocument();
    expect(screen.getByText("规则")).toBeInTheDocument();
    const assetButton = screen.getByRole("button", { name: /记忆交易许可/ });
    const coverImage = assetButton.querySelector("img");

    expect(assetButton).toHaveStyle({ aspectRatio: "3 / 4" });
    expect(coverImage?.getAttribute("src")).toContain("worlddock-asset-cover-placeholder.png");

    fireEvent.click(assetButton);

    expect(onOpenAsset).toHaveBeenCalledWith("asset_1");
  });

  it("renders a bounded summary for long asset descriptions", () => {
    const longSummary =
      "本世界不存在人工重力场发生器或反重力装置，所有人工重力只能通过旋转离心力或飞船加速实现，旋转模拟重力上限为1/6g（月球重力级），因结构强度无法承受更高旋转速率。由此导致不可逆的地空生理分化。";

    render(
      <OfficialAssetLibraryPage
        world={{ id: "world_1", name: "宇宙纪元" }}
        assets={[
          {
            id: "asset_1",
            type: "rule",
            name: "重力",
            summary: longSummary,
            version: 1,
            tags: [],
          },
        ] as any}
        loading={false}
        onOpenAsset={vi.fn()}
      />,
    );

    const summary = getOfficialAssetCardSummary(longSummary);

    expect(summary).toHaveLength(72);
    expect(summary.endsWith("…")).toBe(true);
    expect(screen.getByText(summary)).toBeInTheDocument();
    expect(screen.queryByText("摘要")).not.toBeInTheDocument();
    expect(screen.queryByText(longSummary)).not.toBeInTheDocument();
  });
});
