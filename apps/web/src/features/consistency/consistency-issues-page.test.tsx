// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsistencyIssuesPage } from "./consistency-issues-page";
import { getLoadedConsistencyIssueBadge } from "./use-consistency";
import * as api from "../worlddock/api";

vi.mock("../worlddock/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worlddock/api")>();
  return {
    ...actual,
    listConsistencyIssues: vi.fn(),
    runConsistencyCheck: vi.fn(),
  };
});

describe("ConsistencyIssuesPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders run check controls and issue severity", () => {
    const onRunCheck = vi.fn();
    const onOpenIssue = vi.fn();
    const world = { id: "world_1", name: "潮汐之书" };

    const { container } = render(
      <ConsistencyIssuesPage
        world={world}
        issues={[
          {
            id: "issue_1",
            title: "登记口径冲突",
            description: "必须登记与无需登记冲突。",
            severity: "normal",
            status: "open",
            subjectAssetIds: ["asset_1", "asset_2"],
          } as any,
        ]}
        loading={false}
        onRunCheck={onRunCheck}
        onOpenIssue={onOpenIssue}
      />,
    );

    expect(container.querySelector(".crumb")).not.toBeInTheDocument();
    expect(screen.queryByText(/\/ ren \/ 潮汐之书 \/ consistency/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /运行检查/ })).toBeInTheDocument();
    const statusFilter = screen.getByRole("group", { name: "状态筛选" });
    expect(within(statusFilter).getByRole("button", { name: "待处理" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("登记口径冲突")).toBeInTheDocument();
    expect(screen.getByText("普通")).toBeInTheDocument();
  });

  it("shows an issue summary before the master-detail workspace", () => {
    const { container } = render(
      <ConsistencyIssuesPage
        world={{ id: "world_1", name: "潮汐之书" }}
        issues={[
          buildIssue({
            id: "issue_1",
            title: "严重登记冲突",
            severity: "critical",
            status: "open",
            subjectAssetIds: ["asset_1", "asset_2"],
          }),
          buildIssue({
            id: "issue_2",
            title: "时间线冲突",
            severity: "high",
            status: "open",
            subjectAssetIds: ["asset_2", "asset_3"],
          }),
          buildIssue({
            id: "issue_3",
            title: "普通口径冲突",
            severity: "normal",
            status: "open",
            subjectAssetIds: ["asset_4"],
          }),
        ]}
        loading={false}
      />,
    );

    const summary = screen.getByLabelText("矛盾概览");
    const workspace = container.querySelector<HTMLElement>(".page-split");

    expect(summary).toBeInTheDocument();
    expect(workspace).not.toBeNull();
    if (!workspace) throw new Error("Expected consistency workspace to render.");
    expect(summary.parentElement).toBe(workspace.parentElement);
    expect(workspace.parentElement).toHaveClass("page-body", "page-body-fluid");
    expect(workspace.previousElementSibling).toBe(summary);
    expect(workspace.querySelector(".page-split-main")).toBeInTheDocument();
    expect(workspace.querySelector(".page-split-aside")).toBeInTheDocument();
    expectSummaryStat(summary, "高优先级", "2");
    expectSummaryStat(summary, "待处理", "3");
    expectSummaryStat(summary, "涉及资产", "4");
    expect(screen.getByLabelText("矛盾列表")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("搜索一致性问题"), {
      target: { value: "时间线" },
    });

    expectSummaryStat(summary, "高优先级", "1");
    expectSummaryStat(summary, "待处理", "1");
    expectSummaryStat(summary, "涉及资产", "2");
  });

  it("does not show the issue summary while loading", () => {
    render(
      <ConsistencyIssuesPage
        world={{ id: "world_1", name: "潮汐之书" }}
        issues={[]}
        loading={true}
      />,
    );

    expect(screen.queryByLabelText("矛盾概览")).not.toBeInTheDocument();
    expect(screen.getAllByText("正在载入一致性问题").length).toBeGreaterThan(0);
  });

  it("does not show the issue summary when the issue list errors", () => {
    render(
      <ConsistencyIssuesPage
        world={{ id: "world_1", name: "潮汐之书" }}
        issues={[]}
        loading={false}
        error={new Error("载入失败")}
      />,
    );

    expect(screen.queryByLabelText("矛盾概览")).not.toBeInTheDocument();
    expect(screen.getByText("一致性问题暂不可用")).toBeInTheDocument();
    expect(screen.getByText("载入失败")).toBeInTheDocument();
  });

  it("filters the loaded issue list locally when searching", () => {
    const onOpenIssue = vi.fn();

    render(
      <ConsistencyIssuesPage
        world={{ id: "world_1", name: "潮汐之书" }}
        issues={[
          {
            id: "issue_1",
            title: "登记口径冲突",
            description: "必须登记与无需登记冲突。",
            severity: "normal",
            status: "open",
            subjectAssetIds: ["asset_1"],
          } as any,
          {
            id: "issue_2",
            title: "时间线冲突",
            description: "事件发生顺序冲突。",
            severity: "high",
            status: "open",
            subjectAssetIds: ["asset_2"],
          } as any,
        ]}
        loading={false}
        onOpenIssue={onOpenIssue}
      />,
    );

    fireEvent.change(screen.getByLabelText("搜索一致性问题"), {
      target: { value: "登记" },
    });

    expect(screen.getByText("登记口径冲突")).toBeInTheDocument();
    expect(screen.queryByText("时间线冲突")).not.toBeInTheDocument();
    expect(onOpenIssue).not.toHaveBeenCalled();
  });

  it("shows pagination scope and exposes loading more", () => {
    const onLoadMore = vi.fn();

    render(
      <ConsistencyIssuesPage
        world={{ id: "world_1", name: "潮汐之书" }}
        issues={[
          {
            id: "issue_1",
            title: "登记口径冲突",
            description: "必须登记与无需登记冲突。",
            severity: "normal",
            status: "open",
            subjectAssetIds: ["asset_1"],
          } as any,
        ]}
        loading={false}
        nextCursor="cursor_2"
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByText(/仅显示已加载的前 1 项/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /加载更多/ }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("surfaces action failures in the page", async () => {
    render(
      <ConsistencyIssuesPage
        world={{ id: "world_1", name: "潮汐之书" }}
        issues={[]}
        loading={false}
        onRunCheck={async () => {
          throw new Error("检查服务不可用");
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /运行检查/ }));

    await waitFor(() => {
      expect(screen.getByText("检查服务不可用")).toBeInTheDocument();
    });
  });

  it("confirms when a remote consistency check completes without issues", async () => {
    vi.mocked(api.listConsistencyIssues).mockResolvedValue({
      issues: [],
      nextCursor: null,
    });
    vi.mocked(api.runConsistencyCheck).mockResolvedValue({
      issues: [],
    });

    render(
      <ConsistencyIssuesPage world={{ id: "world_1", name: "潮汐之书" }} />,
      { wrapper: createQueryWrapper().Wrapper },
    );

    expect(await screen.findByText("暂无待处理问题")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /运行检查/ }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("检查完成，未发现新的待处理问题");
    });
  });

  it("retries loading more issues after a failed page request", async () => {
    vi.mocked(api.listConsistencyIssues)
      .mockResolvedValueOnce({
        issues: [buildIssue({ id: "issue_1", title: "登记口径冲突" })],
        nextCursor: "cursor_2",
      })
      .mockRejectedValueOnce(new Error("分页失败"))
      .mockResolvedValueOnce({
        issues: [buildIssue({ id: "issue_2", title: "时间线冲突" })],
        nextCursor: null,
      });

    render(
      <ConsistencyIssuesPage world={{ id: "world_1", name: "潮汐之书" }} />,
      { wrapper: createQueryWrapper().Wrapper },
    );

    expect(await screen.findByText("登记口径冲突")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /加载更多/ }));

    await waitFor(() => {
      expect(screen.getByText("分页失败")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /加载更多/ }));

    expect(await screen.findByText("时间线冲突")).toBeInTheDocument();
    expect(api.listConsistencyIssues).toHaveBeenLastCalledWith("world_1", {
      status: "open",
      cursor: "cursor_2",
      limit: 50,
    });
  });

  it("returns a navigation badge label when the loaded issue list overflows", () => {
    expect(getLoadedConsistencyIssueBadge(undefined)).toBeUndefined();
    expect(getLoadedConsistencyIssueBadge({
      issues: Array.from({ length: 50 }, (_, index) => buildIssue({ id: `issue_${index}` })),
      nextCursor: "next",
    })).toBe("50+");
    expect(getLoadedConsistencyIssueBadge({ issues: [buildIssue({ id: "issue_1" })], nextCursor: null })).toBe(1);
  });
});

function buildIssue(overrides: Partial<api.ConsistencyIssue> = {}): api.ConsistencyIssue {
  return {
    id: "issue_1",
    worldId: "world_1",
    title: "登记口径冲突",
    description: "必须登记与无需登记冲突。",
    severity: "normal",
    status: "open",
    subjectAssetIds: ["asset_1"],
    evidence: [],
    metadata: {},
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function expectSummaryStat(summary: HTMLElement, label: string, value: string) {
  const labelElement = within(summary).getByText(label);
  const card = labelElement.closest(".card");

  expect(card).not.toBeNull();
  if (!card) throw new Error(`Expected ${label} summary card to render.`);
  expect(within(card as HTMLElement).getByText(value)).toBeInTheDocument();
}

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, Wrapper };
}
