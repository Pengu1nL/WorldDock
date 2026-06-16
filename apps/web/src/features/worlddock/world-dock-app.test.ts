// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildCreateWorldInput, WorldDockApp } from "./world-dock-app";

describe("WorldDockApp shell", () => {
  it("renders the world dock shell", () => {
    render(createElement(WorldDockApp));

    expect(screen.getByText("WorldDock")).toBeInTheDocument();
  });
});

describe("buildCreateWorldInput", () => {
  it("stores the LLM short summary instead of the full draft notes", () => {
    const input = buildCreateWorldInput({
      inspiration: "一座港口每天清晨都会吐出居民遗忘的秘密。",
      draft: {
        suggestedName: "雾港",
        suggestedType: "港口奇幻 / 悬疑",
        shortSummary: "雾港每天清晨都会吐出居民遗忘的秘密。",
        styles: ["低魔", "悬疑"],
        coreSetting: "雾港每天清晨都会吐出居民遗忘的秘密，并以秘密盐税维持城市秩序。",
        coreConflict: "秘密既是私人记忆，也是城市权力的燃料。",
        directions: ["秘密盐税", "失忆者身份", "外来船只筛选"],
        firstQuestion: "秘密潮汐是自然现象，还是古老契约的副作用？",
        tools: [{ id: "ctx", label: "分析灵感主题", detail: "提取核心概念" }],
      },
      mode: "local",
    });

    expect(input.summary).toBe("雾港每天清晨都会吐出居民遗忘的秘密。");
    expect(input.summary).not.toContain("核心矛盾");
    expect(input.summary).not.toContain("初始灵感");
  });
});
