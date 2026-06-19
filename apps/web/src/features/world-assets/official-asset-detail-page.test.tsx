// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorldAssetDetail } from "../worlddock/api";
import { OfficialAssetDetailPage } from "./official-asset-detail-page";

describe("OfficialAssetDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  const detail: WorldAssetDetail = {
    asset: {
      id: "asset_1",
      worldId: "world_1",
      type: "rule",
      name: "记忆交易许可",
      summary: "需要登记。",
      documentKey: "rules/memory-permit.md",
      status: "active",
      version: 2,
      tags: ["法律"],
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    markdown: "# 记忆交易许可\n\n## 概括\n\n需要登记。",
    revisions: [
      {
        id: "rev_1",
        assetId: "asset_1",
        version: 1,
        markdown: "# 记忆交易许可\n\n初版。",
        summary: "初版",
        metadata: {},
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "rev_2",
        assetId: "asset_1",
        version: 2,
        markdown: "# 记忆交易许可\n\n## 概括\n\n需要登记。",
        summary: "补充概括",
        metadata: {},
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    indexes: [
      {
        id: "index_1",
        assetId: "asset_1",
        title: "概括",
        summary: "登记要求",
        metadata: {},
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  };

  it("renders markdown detail metadata and edit action", () => {
    const onBack = vi.fn();
    const onStartEdit = vi.fn();

    render(
      <OfficialAssetDetailPage
        detail={detail}
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

  it("disables edit action while creating an edit session", () => {
    const onStartEdit = vi.fn();

    render(
      <OfficialAssetDetailPage
        detail={detail}
        creatingEditSession
        onBack={vi.fn()}
        onStartEdit={onStartEdit}
      />,
    );

    const button = screen.getByRole("button", { name: /创建中/ });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(onStartEdit).not.toHaveBeenCalled();
  });

  it("keeps showing stale markdown when refresh fails after detail loaded", () => {
    render(
      <OfficialAssetDetailPage
        detail={detail}
        error={new Error("Network down")}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("刷新失败，仍显示上次内容。Network down")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "概括" })).toBeInTheDocument();
    expect(screen.getByText("需要登记。")).toBeInTheDocument();
  });
});
