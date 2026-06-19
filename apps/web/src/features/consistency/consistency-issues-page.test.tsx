// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    render(
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

    expect(screen.getByRole("button", { name: /运行检查/ })).toBeInTheDocument();
    expect(screen.getByText("登记口径冲突")).toBeInTheDocument();
    expect(screen.getByText("普通")).toBeInTheDocument();
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
