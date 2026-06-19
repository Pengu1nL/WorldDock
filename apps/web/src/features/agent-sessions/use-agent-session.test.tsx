// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXPLORATION_HISTORY_QUERY,
  agentSessionKeys,
  isAgentSessionNotFoundError,
  useArchiveAgentSession,
  useCreateExplorationSession,
  useCurrentExplorationSession,
  useExplorationSessionList,
  useSetCurrentAgentSession,
} from "./use-agent-session";
import * as api from "../worlddock/api";

vi.mock("../worlddock/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worlddock/api")>();
  return {
    ...actual,
    archiveAgentSession: vi.fn(),
    createAgentSession: vi.fn(),
    getAgentSession: vi.fn(),
    listAgentSessions: vi.fn(),
    setCurrentAgentSession: vi.fn(),
  };
});

describe("useCurrentExplorationSession", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a current exploration session when none exists", async () => {
    const session = buildSession({ id: "session_created", title: "雾港 推演" });
    vi.mocked(api.listAgentSessions).mockResolvedValue({ sessions: [], nextCursor: null });
    vi.mocked(api.createAgentSession).mockResolvedValue({ session });
    vi.mocked(api.getAgentSession).mockResolvedValue(buildDetail(session));

    const { result } = renderHook(
      () => useCurrentExplorationSession({ id: "world_1", name: "雾港" }),
      { wrapper: createQueryWrapper().Wrapper },
    );

    await waitFor(() => expect(result.current.data?.session.id).toBe("session_created"));

    expect(api.listAgentSessions).toHaveBeenCalledWith("world_1", {
      kind: "world_exploration",
      current: true,
      includeArchived: false,
      limit: 1,
    });
    expect(api.createAgentSession).toHaveBeenCalledWith("world_1", {
      kind: "world_exploration",
      title: expect.stringContaining("推演"),
      current: true,
    });
    expect(api.getAgentSession).toHaveBeenCalledWith("world_1", "session_created");
  });

  it("returns the existing current exploration session without creating a new one", async () => {
    const session = buildSession({ id: "session_current", title: "已有推演" });
    vi.mocked(api.listAgentSessions).mockResolvedValue({ sessions: [session], nextCursor: null });
    vi.mocked(api.getAgentSession).mockResolvedValue(buildDetail(session));
    const queryWrapper = createQueryWrapper();

    const { result } = renderHook(
      () => useCurrentExplorationSession({ id: "world_1", name: "雾港" }),
      { wrapper: queryWrapper.Wrapper },
    );

    await waitFor(() => expect(result.current.data?.session.id).toBe("session_current"));

    expect(api.createAgentSession).not.toHaveBeenCalled();
    expect(api.getAgentSession).toHaveBeenCalledWith("world_1", "session_current");
    expect(queryWrapper.queryClient.getQueryData(agentSessionKeys.currentDetail("world_1", currentExplorationQuery))).toEqual(
      buildDetail(session),
    );
    expect(queryWrapper.queryClient.getQueryData(agentSessionKeys.list("world_1", currentExplorationQuery))).toBeUndefined();
  });

  it("stays disabled when no world id is available", () => {
    const { result } = renderHook(
      () => useCurrentExplorationSession(null),
      { wrapper: createQueryWrapper().Wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(api.listAgentSessions).not.toHaveBeenCalled();
    expect(api.createAgentSession).not.toHaveBeenCalled();
    expect(api.getAgentSession).not.toHaveBeenCalled();
  });
});

describe("exploration session helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists non-archived exploration session history", async () => {
    const session = buildSession({ id: "session_history", title: "黑市推演" });
    vi.mocked(api.listAgentSessions).mockResolvedValue({ sessions: [session], nextCursor: null });

    const { result } = renderHook(
      () => useExplorationSessionList("world_1"),
      { wrapper: createQueryWrapper().Wrapper },
    );

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe("session_history"));

    expect(api.listAgentSessions).toHaveBeenCalledWith("world_1", EXPLORATION_HISTORY_QUERY);
  });

  it("creates a current exploration session with the world name", async () => {
    const session = buildSession({ id: "session_new", title: "雾港 推演" });
    vi.mocked(api.createAgentSession).mockResolvedValue({ session });

    const { result } = renderHook(
      () => useCreateExplorationSession({ id: "world_1", name: "雾港" }),
      { wrapper: createQueryWrapper().Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(api.createAgentSession).toHaveBeenCalledWith("world_1", {
      kind: "world_exploration",
      title: "雾港 推演",
      current: true,
    });
  });

  it("sets and archives exploration sessions through the API", async () => {
    const session = buildSession({ id: "session_target" });
    vi.mocked(api.setCurrentAgentSession).mockResolvedValue({ session });
    vi.mocked(api.archiveAgentSession).mockResolvedValue({ session });
    const wrapper = createQueryWrapper().Wrapper;

    const currentMutation = renderHook(
      () => useSetCurrentAgentSession("world_1"),
      { wrapper },
    );
    const archiveMutation = renderHook(
      () => useArchiveAgentSession("world_1"),
      { wrapper },
    );

    await act(async () => {
      await currentMutation.result.current.mutateAsync("session_target");
      await archiveMutation.result.current.mutateAsync("session_target");
    });

    expect(api.setCurrentAgentSession).toHaveBeenCalledWith("world_1", "session_target");
    expect(api.archiveAgentSession).toHaveBeenCalledWith("world_1", "session_target");
  });
});

describe("isAgentSessionNotFoundError", () => {
  it("recognizes the existing SSE stream 404 error message", () => {
    expect(isAgentSessionNotFoundError(new Error("Agent session run event stream failed with 404"))).toBe(true);
  });

  it("recognizes status-shaped errors without treating other statuses as not found", () => {
    expect(isAgentSessionNotFoundError({ status: 404 })).toBe(true);
    expect(isAgentSessionNotFoundError(new Error("Agent session run event stream failed with 500"))).toBe(false);
    expect(isAgentSessionNotFoundError({ status: 500 })).toBe(false);
  });
});

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, Wrapper };
}

const currentExplorationQuery = {
  kind: "world_exploration",
  current: true,
  includeArchived: false,
  limit: 1,
};

function buildSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session_1",
    worldId: "world_1",
    kind: "world_exploration",
    title: "雾港 推演",
    status: "active",
    current: true,
    subjects: [],
    contextItems: [],
    metadata: {},
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  } as any;
}

function buildDetail(session: ReturnType<typeof buildSession>) {
  return {
    session,
    subjects: [],
    contextItems: [],
    messages: [],
  };
}
