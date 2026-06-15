import { describe, expect, it } from "vitest";
import { PotentialAssetsAnalyzer } from "./potential-assets.analyzer";

describe("PotentialAssetsAnalyzer", () => {
  it("extracts titled markdown bullets as potential assets", () => {
    const analyzer = new PotentialAssetsAnalyzer();
    const result = analyzer.extract({
      worldId: "world_1",
      sessionId: "session_1",
      runId: "run_1",
      messages: [{
        id: "msg_1",
        role: "assistant",
        content: "### 记忆交易许可\n这是一条世界规则，所有记忆交易都需要登记。\n\n### 红岩联合\n这是一个组织，控制记忆黑市。",
      }],
    });

    expect(result).toEqual([
      expect.objectContaining({ type: "rule", title: "记忆交易许可" }),
      expect.objectContaining({ type: "organization", title: "红岩联合" }),
    ]);
  });

  it("does not create assets from user messages", () => {
    const analyzer = new PotentialAssetsAnalyzer();
    expect(analyzer.extract({
      worldId: "world_1",
      sessionId: "session_1",
      runId: "run_1",
      messages: [{ id: "msg_1", role: "user", content: "### 记忆交易许可\n需要登记。" }],
    })).toEqual([]);
  });
});
