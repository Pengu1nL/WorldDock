// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionPage } from "./session-page";

describe("SessionPage", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("renders backend-shaped subjects", () => {
    renderSessionPage({
      subjects: [
        {
          id: "subject_1",
          subjectKind: "asset",
          subjectId: "asset_1",
          title: "浮城税契",
          role: "primary",
        },
      ],
    });

    expect(screen.getByText("asset")).toBeInTheDocument();
    expect(screen.getByText("浮城税契")).toBeInTheDocument();
  });

  it("opens potential assets from the header badge", () => {
    const onOpenPotentialAssets = vi.fn();
    renderSessionPage({
      potentialAssetCount: 3,
      activePotentialAssetCount: 1,
      onOpenPotentialAssets,
    });

    fireEvent.click(screen.getByRole("button", { name: "潜在资产 3 项" }));

    expect(screen.getByText("潜在资产 1/3")).toBeInTheDocument();
    expect(onOpenPotentialAssets).toHaveBeenCalled();
  });

  it("keeps composer disabled for blank text and sends typed text", () => {
    const onSend = vi.fn();
    renderSessionPage({ onSend });

    const composer = screen.getByLabelText("继续推演");
    const sendButton = screen.getByRole("button", { name: /发送/ });

    expect(sendButton).toBeDisabled();
    fireEvent.change(composer, { target: { value: "   " } });
    expect(sendButton).toBeDisabled();

    fireEvent.change(composer, { target: { value: "继续确认许可制度" } });
    expect(sendButton).toBeEnabled();
    fireEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledWith("继续确认许可制度");
  });

  it("renders markdown lists, code blocks, and streaming status", () => {
    renderSessionPage({
      messages: [
        {
          id: "msg_streaming",
          role: "assistant",
          content: "许可清单\n- 登记\n- 复核\n\n```ts\nconst permit = true;\n```",
          status: "streaming",
          createdAt: "2026-06-14T00:00:00.000Z",
        },
      ],
    });

    expect(screen.getByText("登记")).toBeInTheDocument();
    expect(screen.getByText("复核")).toBeInTheDocument();
    expect(screen.getByText("const permit = true;")).toBeInTheDocument();
    expect(screen.getByText("streaming")).toBeInTheDocument();
  });
});

function renderSessionPage(overrides: Record<string, unknown> = {}) {
  const props = {
    session: { id: "session_1", title: "记忆交易推演", kind: "world_exploration", status: "active" } as any,
    subjects: [],
    messages: [
      {
        id: "msg_1",
        role: "assistant",
        content: "可以确认许可制度。",
        status: "complete",
        createdAt: "2026-06-14T00:00:00.000Z",
      },
    ] as any,
    contextItems: [{ id: "ctx_1", title: "世界摘要", excerpt: "记忆可以交易。" } as any],
    runState: { status: "idle", tokens: 0 },
    onSend: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };

  return render(<SessionPage {...(props as any)} />);
}
