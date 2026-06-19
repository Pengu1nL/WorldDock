// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetPatchList } from "./asset-patch-list";

describe("AssetPatchList", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders structured add diff lines and reverts applied patches", () => {
    const onRevert = vi.fn();

    render(
      <AssetPatchList
        patches={[
          {
            id: "patch_1",
            status: "applied",
            assetVersionFrom: 1,
            assetVersionTo: 2,
            diff: [{ type: "add", text: "登记许可必须每年续期。", lineTo: 4 }],
          } as any,
        ]}
        onRevert={onRevert}
      />,
    );

    expect(screen.getByText("+")).toBeInTheDocument();
    expect(screen.getByText("登记许可必须每年续期。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    expect(onRevert).toHaveBeenCalledWith("patch_1");
  });
});
