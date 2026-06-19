// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionPage } from "./session-page";

describe("SessionPage", () => {
  it("renders messages, context count, and composer", () => {
    render(
      <SessionPage
        session={{ id: "session_1", title: "记忆交易推演", kind: "world_exploration", status: "active" } as any}
        subjects={[]}
        messages={[
          {
            id: "msg_1",
            role: "user",
            content: "继续推演",
            status: "complete",
            createdAt: "2026-06-14T00:00:00.000Z",
          },
          {
            id: "msg_2",
            role: "assistant",
            content: "可以确认许可制度。",
            status: "complete",
            createdAt: "2026-06-14T00:00:00.000Z",
          },
        ] as any}
        contextItems={[{ id: "ctx_1", title: "世界摘要", excerpt: "记忆可以交易。" } as any]}
        runState={{ status: "idle", tokens: 0 }}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "记忆交易推演" })).toBeInTheDocument();
    expect(screen.getByText("可以确认许可制度。")).toBeInTheDocument();
    expect(screen.getByLabelText("继续推演")).toBeInTheDocument();
    expect(screen.getByText(/1 项上下文/)).toBeInTheDocument();
  });
});
