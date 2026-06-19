// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

    fireEvent.click(screen.getByRole("button", { name: /记忆交易许可/ }));

    expect(onOpenAsset).toHaveBeenCalledWith("asset_1");
  });
});
