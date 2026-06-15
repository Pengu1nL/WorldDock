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
    expect(result[0]?.summary).toBe("这是一条世界规则，所有记忆交易都需要登记。");
    expect(result[0]?.evidence).toEqual([{
      messageId: "msg_1",
      quote: "### 记忆交易许可 这是一条世界规则，所有记忆交易都需要登记。",
      confidence: 0.62,
    }]);
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

  it("ignores markdown headings inside fenced code blocks", () => {
    const analyzer = new PotentialAssetsAnalyzer();

    expect(analyzer.extract({
      worldId: "world_1",
      sessionId: "session_1",
      runId: "run_1",
      messages: [{
        id: "msg_1",
        role: "assistant",
        content: "```markdown\n### 红岩联合\n这是一个示例，不应成为资产。\n```\n\n## 真实港口\n这是一个地点，记忆走私船会在这里靠岸。",
      }],
    })).toEqual([
      expect.objectContaining({ type: "location", title: "真实港口" }),
    ]);
  });

  it("truncates summaries to 240 characters", () => {
    const analyzer = new PotentialAssetsAnalyzer();
    const longSummary = "记".repeat(241);
    const [asset] = analyzer.extract({
      worldId: "world_1",
      sessionId: "session_1",
      runId: "run_1",
      messages: [{
        id: "msg_1",
        role: "assistant",
        content: `### 长篇规则\n${longSummary}`,
      }],
    });

    expect(asset?.summary).toHaveLength(240);
    expect(asset?.summary).toBe("记".repeat(240));
    expect(asset?.evidence[0]?.messageId).toBe("msg_1");
    expect(asset?.evidence[0]?.confidence).toBe(0.62);
    expect(asset?.evidence[0]?.quote).toContain("### 长篇规则");
  });
});
