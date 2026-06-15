import { describe, expect, it } from "vitest";
import { buildInitialAssetMarkdown, extractAssetSummary, indexMarkdownSections } from "./asset-markdown";

describe("asset markdown helpers", () => {
  it("builds typed initial markdown and indexes headings", () => {
    const markdown = buildInitialAssetMarkdown({
      type: "rule",
      name: "记忆交易许可",
      summary: "所有记忆交易都需要登记。",
    });

    expect(markdown).toContain("# 记忆交易许可");
    expect(markdown).toContain("## 概括");
    expect(extractAssetSummary(markdown)).toBe("所有记忆交易都需要登记。");
    expect(indexMarkdownSections(markdown)[0]).toMatchObject({ heading: "记忆交易许可", level: 1 });
  });
});
