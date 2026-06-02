import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Message } from "./view-workbench";

describe("WorldDock workbench message rendering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders agent markdown as structured content by default", () => {
    const html = renderToStaticMarkup(
      <Message
        msg={{
          id: "m1",
          role: "agent",
          mode: "expand",
          text: "## 扩写完成\n\n- 世界规则：**天梯**连接地月轨道。\n- 后果：债务成为通行权。",
        }}
        savedIds={[]}
        onSave={() => undefined}
        onOpenDetail={() => undefined}
        onOpenContext={() => undefined}
      />,
    );

    expect(html).toContain("<h2");
    expect(html).toContain("扩写完成");
    expect(html.match(/<li/g) ?? []).toHaveLength(2);
    expect(html).toContain("<strong");
    expect(html).toContain("天梯");
  });

  it("renders horizontal rules, ordered lists, and unordered lists", () => {
    const html = renderToStaticMarkup(
      <Message
        msg={{
          id: "m1",
          role: "agent",
          mode: "expand",
          text: [
            "## 推演清单",
            "",
            "1. 先确认天梯债务规则",
            "2. 再安排静海城走私线",
            "",
            "---",
            "",
            "- 北极星能源",
            "- 轨道工业公司",
          ].join("\n"),
        }}
        savedIds={[]}
        onSave={() => undefined}
        onOpenDetail={() => undefined}
        onOpenContext={() => undefined}
      />,
    );

    expect(html).toContain("<hr");
    expect(html).toContain("<ol");
    expect(html).toContain("<ul");
    expect(html.match(/<li/g) ?? []).toHaveLength(4);
  });

  it("uses agent suggestion ids for duplicate-safe keys and saved state", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const html = renderToStaticMarkup(
      <Message
        msg={{
          id: "m1",
          role: "agent",
          mode: "expand",
          text: "建议如下。",
          suggestions: [
            {
              id: "pi_seed_proposal",
              agentSuggestionId: "ags_1",
              kind: "seed",
              category: "故事种子",
              title: "天梯搬运工",
              hook: "陆远发现债务数字被篡改。",
              trigger: "缆索巡检时出现异常。",
              conflict: "还债与揭露真相之间的选择。",
              protagonists: "陆远",
              questions: [],
            },
            {
              id: "pi_seed_proposal",
              agentSuggestionId: "ags_2",
              kind: "seed",
              category: "故事种子",
              title: "静海城的空气",
              hook: "艾琳暗中帮助地球偷渡者。",
              trigger: "运输船例行检查升级。",
              conflict: "家族继承与人的温度之间的选择。",
              protagonists: "艾琳",
              questions: [],
            },
          ],
        }}
        savedIds={["ags_1"]}
        onSave={() => undefined}
        onOpenDetail={() => undefined}
        onOpenContext={() => undefined}
      />,
    );

    expect(html).toContain("已保存");
    expect(html).not.toContain("aria-label=\"保存 天梯搬运工\"");
    expect(html).toContain("aria-label=\"保存 静海城的空气\"");
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("Encountered two children with the same key"),
      expect.anything(),
    );
  });
});
