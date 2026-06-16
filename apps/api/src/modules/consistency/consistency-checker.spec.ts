import { describe, expect, it } from "vitest";
import { ConsistencyChecker } from "./consistency-checker";

describe("ConsistencyChecker", () => {
  it("detects direct contradiction markers across asset summaries", () => {
    const checker = new ConsistencyChecker();
    const issues = checker.check([
      {
        assetId: "asset_1",
        type: "rule",
        name: "记忆交易许可",
        summary: "记忆交易必须登记。",
        markdown: "所有记忆交易必须登记。",
      },
      {
        assetId: "asset_2",
        type: "event",
        name: "自由交易日",
        summary: "记忆交易无需登记。",
        markdown: "自由交易日当天记忆交易无需登记。",
      },
    ]);

    expect(issues).toEqual([
      expect.objectContaining({
        title: expect.stringContaining("记忆交易"),
        severity: "normal",
        subjectAssetIds: ["asset_1", "asset_2"],
      }),
    ]);
  });

  it("emits one issue for each shared keyword in the same asset pair", () => {
    const checker = new ConsistencyChecker();
    const issues = checker.check([
      {
        assetId: "asset_1",
        type: "rule",
        name: "复合规则",
        summary: "alpha 必须登记。beta 需要批准。",
        markdown: "alpha 必须登记。beta 需要批准。",
      },
      {
        assetId: "asset_2",
        type: "event",
        name: "复合例外",
        summary: "alpha 无需登记。beta 例外放行。",
        markdown: "alpha 无需登记。beta 例外放行。",
      },
    ]);

    expect(issues).toHaveLength(2);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining("alpha"),
          keyword: "alpha",
          severity: "normal",
          subjectAssetIds: ["asset_1", "asset_2"],
        }),
        expect.objectContaining({
          title: expect.stringContaining("beta"),
          keyword: "beta",
          severity: "normal",
          subjectAssetIds: ["asset_1", "asset_2"],
        }),
      ]),
    );
  });

  it("does not report conflicts between permissive markers", () => {
    const checker = new ConsistencyChecker();
    const issues = checker.check([
      {
        assetId: "asset_1",
        type: "event",
        name: "豁免日",
        summary: "记忆交易不需要登记。",
        markdown: "记忆交易不需要登记。",
      },
      {
        assetId: "asset_2",
        type: "event",
        name: "自由日",
        summary: "记忆交易无需登记。",
        markdown: "记忆交易无需登记。",
      },
    ]);

    expect(issues).toEqual([]);
  });

  it("matches reusable Chinese keyword phrases with different context prefixes", () => {
    const checker = new ConsistencyChecker();
    const issues = checker.check([
      {
        assetId: "asset_1",
        type: "rule",
        name: "登记规则",
        summary: "所有记忆交易必须登记。",
        markdown: "所有记忆交易必须登记。",
      },
      {
        assetId: "asset_2",
        type: "event",
        name: "自由交易日",
        summary: "自由交易日当天记忆交易无需登记。",
        markdown: "自由交易日当天记忆交易无需登记。",
      },
    ]);

    expect(issues).toEqual([
      expect.objectContaining({
        title: expect.stringContaining("记忆交易"),
        keyword: "记忆交易",
        severity: "normal",
        subjectAssetIds: ["asset_1", "asset_2"],
      }),
    ]);
  });

  it("uses the complete asset name as a stable keyword", () => {
    const checker = new ConsistencyChecker();
    const issues = checker.check([
      {
        assetId: "asset_1",
        type: "rule",
        name: "Memory Market A",
        summary: "必须登记。",
        markdown: "必须登记。",
      },
      {
        assetId: "asset_2",
        type: "event",
        name: "Memory Market A",
        summary: "无需登记。",
        markdown: "无需登记。",
      },
    ]);

    expect(issues).toEqual([
      expect.objectContaining({
        title: expect.stringContaining("Memory Market A"),
        keyword: "Memory Market A",
        severity: "normal",
        subjectAssetIds: ["asset_1", "asset_2"],
      }),
    ]);
  });

  it("deduplicates the same asset pair and keyword across summary and markdown", () => {
    const checker = new ConsistencyChecker();
    const issues = checker.check([
      {
        assetId: "asset_1",
        type: "rule",
        name: "登记规则",
        summary: "记忆交易必须登记。",
        markdown: "记忆交易必须登记。",
      },
      {
        assetId: "asset_2",
        type: "event",
        name: "自由交易日",
        summary: "记忆交易无需登记。",
        markdown: "记忆交易无需登记。",
      },
    ]);

    expect(issues.filter((issue) => issue.keyword === "记忆交易")).toHaveLength(1);
  });
});
