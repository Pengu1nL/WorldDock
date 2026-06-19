// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PotentialAssetDrawer } from "./potential-asset-drawer";

describe("PotentialAssetDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders potential asset details and promotes active assets", () => {
    const onClose = vi.fn();
    const onPromote = vi.fn();
    const onDismiss = vi.fn();

    render(
      <PotentialAssetDrawer
        open
        potentialAssets={[
          {
            id: "pa_1",
            type: "rule",
            title: "记忆交易许可",
            summary: "需要登记。",
            status: "active",
          } as any,
        ]}
        onClose={onClose}
        onPromote={onPromote}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("记忆交易许可")).toBeInTheDocument();
    expect(screen.getByText("规则")).toBeInTheDocument();
    expect(screen.getByText("待处理")).toBeInTheDocument();
    expect(screen.getByText("需要登记。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "沉淀" }));

    expect(onPromote).toHaveBeenCalledWith("pa_1");
  });

  it("disables active actions while pending and shows an error", () => {
    render(
      <PotentialAssetDrawer
        open
        potentialAssets={[
          {
            id: "pa_1",
            type: "rule",
            title: "记忆交易许可",
            summary: "需要登记。",
            status: "active",
          } as any,
        ]}
        pendingAction={{ assetId: "pa_1", action: "promote" }}
        error="沉淀失败，请重试"
        onClose={vi.fn()}
        onPromote={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("沉淀失败，请重试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "沉淀" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "忽略" })).toBeDisabled();
  });
});
