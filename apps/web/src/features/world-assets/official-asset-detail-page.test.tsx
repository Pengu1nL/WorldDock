// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfficialAssetDetailPage } from "./official-asset-detail-page";

describe("OfficialAssetDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders markdown detail metadata and edit action", () => {
    const onBack = vi.fn();
    const onStartEdit = vi.fn();

    render(
      <OfficialAssetDetailPage
        detail={{
          asset: {
            id: "asset_1",
            type: "rule",
            name: "记忆交易许可",
            summary: "需要登记。",
            version: 2,
            tags: ["法律"],
          },
          markdown: "# 记忆交易许可\n\n## 概括\n\n需要登记。",
          revisions: [{ id: "rev_1", version: 1 }, { id: "rev_2", version: 2 }],
          indexes: [{ heading: "概括", level: 2 }],
        } as any}
        patches={[]}
        onBack={onBack}
        onStartEdit={onStartEdit}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "记忆交易许可" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "概括" })).toBeInTheDocument();
    expect(screen.getByText("需要登记。")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));

    expect(onStartEdit).toHaveBeenCalledWith("asset_1");
  });
});
