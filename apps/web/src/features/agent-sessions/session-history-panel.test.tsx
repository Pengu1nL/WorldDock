// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionHistoryPanel } from "./session-history-panel";

describe("SessionHistoryPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks the active session selected and opens another session", () => {
    const onOpen = vi.fn();
    const onArchive = vi.fn();

    render(
      <SessionHistoryPanel
        sessions={[
          { id: "s1", title: "记忆交易推演", kind: "world_exploration", updatedAt: "2026-06-14T00:00:00.000Z" },
          { id: "s2", title: "黑市推演", kind: "world_exploration", updatedAt: "2026-06-13T00:00:00.000Z" },
        ] as any}
        activeSessionId="s1"
        onOpen={onOpen}
        onArchive={onArchive}
      />,
    );

    expect(screen.getByRole("option", { name: /记忆交易推演/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("option", { name: /黑市推演/ }));

    expect(onOpen).toHaveBeenCalledWith("s2");
  });

  it("filters sessions and archives without opening the row", () => {
    const onOpen = vi.fn();
    const onArchive = vi.fn();

    render(
      <SessionHistoryPanel
        sessions={[
          {
            id: "s1",
            title: "记忆交易推演",
            kind: "world_exploration",
            status: "active",
            updatedAt: "2026-06-14T00:00:00.000Z",
          },
          {
            id: "s2",
            title: "黑市推演",
            kind: "world_exploration",
            status: "completed",
            updatedAt: "2026-06-13T00:00:00.000Z",
          },
        ] as any}
        activeSessionId="s1"
        onOpen={onOpen}
        onArchive={onArchive}
      />,
    );

    fireEvent.change(screen.getByLabelText("搜索推演历史"), { target: { value: "黑市" } });

    expect(screen.queryByText("记忆交易推演")).not.toBeInTheDocument();
    const item = screen.getByRole("option", { name: /黑市推演/ });
    expect(within(item).getByText("已完成")).toBeInTheDocument();
    expect(within(item).getByText("2026/6/13")).toBeInTheDocument();

    fireEvent.click(within(item).getByRole("button", { name: "归档 黑市推演" }));

    expect(onArchive).toHaveBeenCalledWith("s2");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
