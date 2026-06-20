// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssetMarkdownView } from "./asset-markdown-view";

describe("AssetMarkdownView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders inline strong text, blockquotes, and horizontal rules", () => {
    render(
      <AssetMarkdownView
        markdown={[
          "# 重力",
          "",
          "> **核心约束**：等效重力加速度必须低于 1/6g。",
          "",
          "- **旋转离心力**：通过旋转结构产生模拟重力。",
          "",
          "---",
          "",
          "重力是**社会冲突**的物理根源。",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("核心约束").tagName).toBe("STRONG");
    expect(screen.getByText("旋转离心力").tagName).toBe("STRONG");
    expect(screen.getByText("社会冲突").tagName).toBe("STRONG");
    expect(screen.getByText(/等效重力加速度/).closest("blockquote")).toBeInTheDocument();
    expect(document.querySelector("hr")).toBeInTheDocument();
  });
});
