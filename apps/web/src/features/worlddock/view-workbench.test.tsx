// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Message } from "./view-workbench";

describe("WorldDock workbench message rendering", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders agent markdown as structured content by default", () => {
    const html = renderToStaticMarkup(
      <Message
        msg={{
          id: "m1",
          role: "agent",
          text: "## 扩写完成\n\n- 世界规则：**天梯**连接地月轨道。\n- 后果：债务成为通行权。",
        }}
        onOpenContext={() => undefined}
      />,
    );

    expect(html).toContain("<h2");
    expect(html).toContain("扩写完成");
    expect(html.match(/<li/g) ?? []).toHaveLength(2);
    expect(html).toContain("<strong");
    expect(html).toContain("天梯");
  });

  it("renders streaming agent markdown code, quotes, inline code, and links", () => {
    const html = renderToStaticMarkup(
      <Message
        msg={{
          id: "m1",
          role: "agent",
          streaming: true,
          text: [
            "> 保留这条规则作为后续约束。",
            "",
            "执行 `permit.check()` 后访问 [资产库](https://example.com/assets)。",
            "",
            "```ts",
            "const permit = true;",
            "```",
          ].join("\n"),
        }}
        onOpenContext={() => undefined}
      />,
    );

    expect(html).toContain("<blockquote");
    expect(html).toContain("<code");
    expect(html).toContain("permit.check()");
    expect(html).toContain("<a");
    expect(html).toContain("href=\"https://example.com/assets\"");
    expect(html).toContain("<pre");
    expect(html).toContain("const permit = true;");
    expect(html).toContain("caret");
  });

  it("renders horizontal rules, ordered lists, and unordered lists", () => {
    const html = renderToStaticMarkup(
      <Message
        msg={{
          id: "m1",
          role: "agent",
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
        onOpenContext={() => undefined}
      />,
    );

    expect(html).toContain("<hr");
    expect(html).toContain("<ol");
    expect(html).toContain("<ul");
    expect(html.match(/<li/g) ?? []).toHaveLength(4);
  });

  it("does not render numeric zero for empty agent suggestions or context refs", () => {
    const html = renderToStaticMarkup(
      <Message
        msg={{
          id: "m1",
          role: "agent",
          text: "工具调用失败前的部分回复。",
          streaming: false,
          suggestions: [],
          contextRefs: 0,
        }}
        onOpenContext={() => undefined}
      />,
    );

    expect(html).toContain("工具调用失败前的部分回复。");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("本轮引用了 0 项上下文");
  });

  it("does not render legacy inline suggestion groups for normal workbench messages", () => {
    render(
      <Message
        msg={{
          id: "m1",
          role: "agent",
          text: "建议已经进入潜在资产流程。",
          streaming: false,
          suggestions: [
            {
              id: "setting_1",
              kind: "setting",
              category: "制度规则",
              title: "记忆许可",
              summary: "记忆交易需要许可。",
            },
            {
              id: "conflict_1",
              kind: "conflict",
              category: "核心矛盾",
              title: "许可与人格",
              summary: "人格是否可以被监管。",
            },
            {
              id: "seed_1",
              kind: "seed",
              category: "剧情钩子",
              title: "失效许可",
              hook: "主角的许可在关键时刻失效。",
              trigger: "一次例行审查。",
              conflict: "自由与债务。",
              protagonists: "陆远",
              questions: [],
            },
          ],
        }}
        onOpenContext={() => undefined}
      />,
    );

    expect(screen.queryByText("可保存设定")).not.toBeInTheDocument();
    expect(screen.queryByText("故事种子")).not.toBeInTheDocument();
    expect(screen.queryByText("戏剧张力 · 入冲突池")).not.toBeInTheDocument();
  });

  it("ignores duplicate legacy suggestion payloads in message rendering", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const html = renderToStaticMarkup(
      <Message
        msg={{
          id: "m1",
          role: "agent",
          text: "建议如下。",
          suggestions: [
            {
              id: "pi_seed_proposal",
              agentSuggestionId: "ags_1",
              kind: "seed",
              category: "叙事素材",
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
              category: "叙事素材",
              title: "静海城的空气",
              hook: "艾琳暗中帮助地球偷渡者。",
              trigger: "运输船例行检查升级。",
              conflict: "家族继承与人的温度之间的选择。",
              protagonists: "艾琳",
              questions: [],
            },
          ],
        }}
        onOpenContext={() => undefined}
      />,
    );

    expect(html).toContain("建议如下。");
    expect(html).not.toContain("已保存");
    expect(html).not.toContain("aria-label=\"保存 天梯搬运工\"");
    expect(html).not.toContain("aria-label=\"保存 静海城的空气\"");
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("Encountered two children with the same key"),
      expect.anything(),
    );
  });
});
