// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listOfficialAssets, type OfficialWorldAsset } from "../worlddock/api";
import { getOfficialAssetCardSummary } from "./official-asset-card";
import { OfficialAssetLibraryPage } from "./official-asset-library-page";

vi.mock("../worlddock/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worlddock/api")>();

  return {
    ...actual,
    listOfficialAssets: vi.fn(),
  };
});

describe("OfficialAssetLibraryPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders type filters and opens an asset from props", () => {
    const onOpenAsset = vi.fn();
    const onCreateAsset = vi.fn();
    const world = { id: "world_1", name: "记忆城邦" };

    const { container } = render(
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

    expect(container.querySelector(".crumb")).not.toBeInTheDocument();
    expect(screen.queryByText(/\/ ren \/ 记忆城邦 \/ assets/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "角色0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "组织1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "地点0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "事件0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "规则1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "画廊视图" }));

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

  it("defaults to a compact list view with a gallery toggle", () => {
    render(
      <OfficialAssetLibraryPage
        world={{ id: "world_1", name: "潮汐之书" }}
        assets={[buildAsset({ id: "asset_1", name: "潮汐律", type: "rule" })]}
        loading={false}
      />,
    );

    expect(screen.getByRole("group", { name: "资产库视图切换" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "列表视图" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "画廊视图" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("潮汐律")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开资产 潮汐律" })).toBeInTheDocument();
    expect(screen.getByText("潮汐律定义文明周期。")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("0 项问题")).toBeInTheDocument();
  });

  it("keeps remote type counts sourced from the complete asset list", async () => {
    const assets = [
      buildAsset({
        id: "asset_rule_1",
        name: "重力",
        summary: "人工重力只能通过旋转离心力或飞船加速实现。",
      }),
      buildAsset({
        id: "asset_rule_2",
        name: "无土栽培基因风险",
        summary: "太空无土栽培面临三大基因风险源。",
      }),
    ];

    vi.mocked(listOfficialAssets).mockImplementation(async (_worldId, query = {}) => ({
      assets: query.type ? assets.filter((asset) => asset.type === query.type) : assets,
      nextCursor: null,
    }));

    renderWithQueryClient(<OfficialAssetLibraryPage world={{ id: "world_1", name: "宇宙纪元" }} />);

    expect(await screen.findByRole("button", { name: "全部2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "规则2" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "角色0" }));

    await waitFor(() => {
      expect(screen.getByText("暂无角色")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "全部2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "规则2" })).toBeInTheDocument();
  });
});

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function buildAsset(overrides: Partial<OfficialWorldAsset> = {}): OfficialWorldAsset {
  return {
    id: "asset_1",
    worldId: "world_1",
    type: "rule",
    name: "潮汐律",
    summary: "潮汐律定义文明周期。",
    documentKey: "rules/tide-law.md",
    status: "active",
    version: 1,
    tags: ["制度"],
    metadata: {},
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}
