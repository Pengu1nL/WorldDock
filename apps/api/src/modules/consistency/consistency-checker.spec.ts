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
});
