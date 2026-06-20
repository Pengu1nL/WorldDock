// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldsView, CreateView } from "./view-worlds";

const worlds = [
  {
    id: "tide",
    name: "潮汐之书",
    type: "海洋奇幻",
    tags: ["海洋"],
    summary: "潮汐反向重塑文明制度。",
    maturity: 72,
    status: "draft",
    archive: 4,
    seeds: 2,
    conflicts: 1,
    updated: "2026-06-20T10:00:00.000Z",
    mode: "local",
    hasUnpushed: true,
  },
  {
    id: "ledger",
    name: "账簿世界",
    type: "蒸汽朋克",
    tags: ["审计"],
    summary: "所有关系都要被记账。",
    maturity: 54,
    status: "published",
    archive: 3,
    seeds: 1,
    conflicts: 0,
    updated: "2026-06-19T10:00:00.000Z",
    mode: "local",
    hasUnsaved: true,
  },
];

describe("WorldsView layout", () => {
  afterEach(() => cleanup());

  it("shows workbench summary metrics above the world grid", () => {
    render(
      <WorldsView
        worlds={worlds}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "我的世界" })).toBeInTheDocument();
    expect(screen.getByText("工作台概览")).toBeInTheDocument();
    expect(screen.getByText("未处理改动")).toBeInTheDocument();
    expect(screen.getByText("待发布")).toBeInTheDocument();
    expect(screen.getByText("矛盾线索")).toBeInTheDocument();
  });

  it("does not expose the inert edit-after-create button in confirm state", async () => {
    vi.spyOn(await import("./api"), "generateWorldDraft").mockResolvedValueOnce({
      draft: {
        suggestedName: "潮汐之书",
        suggestedType: "海洋奇幻",
        styles: ["制度"],
        coreSetting: "潮汐反向重塑文明制度。",
        coreConflict: "登记制度与航线自由冲突。",
        directions: ["港口许可", "潮汐税制"],
        firstQuestion: "谁能在反向潮之前离港？",
        tools: [],
      },
      tokenUsage: { totalTokens: 120 },
    } as any);

    render(<CreateView initialInspiration="潮汐反向" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    screen.getByRole("button", { name: /开始推演/ }).click();

    expect(await screen.findByText("雏形已生成")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑后创建" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认并进入工作台/ })).toBeInTheDocument();
  });
});
