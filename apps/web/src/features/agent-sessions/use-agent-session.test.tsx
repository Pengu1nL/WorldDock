// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXPLORATION_HISTORY_QUERY,
  agentSessionKeys,
  agentSessionsFeatureEnabled,
  isAgentSessionNotFoundError,
  useArchiveAgentSession,
  useCreateExplorationSession,
  useCurrentExplorationSession,
  useDismissPotentialAsset,
  useExplorationSessionList,
  usePromotePotentialAsset,
  useSetCurrentAgentSession,
  useSessionPotentialAssets,
} from "./use-agent-session";
import * as api from "../worlddock/api";
import { officialAssetsQueryKeys } from "../world-assets/use-official-assets";

vi.mock("../worlddock/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worlddock/api")>();
  return {
    ...actual,
    archiveAgentSession: vi.fn(),
    createAgentSession: vi.fn(),
    dismissPotentialAsset: vi.fn(),
    getAgentSession: vi.fn(),
    listAgentSessions: vi.fn(),
    listPotentialAssetsForSession: vi.fn(),
    promotePotentialAsset: vi.fn(),
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

describe("agentSessionsFeatureEnabled", () => {
  const originalValue = process.env.NEXT_PUBLIC_WORLD_DOCK_AGENT_SESSIONS;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.NEXT_PUBLIC_WORLD_DOCK_AGENT_SESSIONS;
    } else {
      process.env.NEXT_PUBLIC_WORLD_DOCK_AGENT_SESSIONS = originalValue;
    }
  });

  it("requires the agent sessions feature flag to be explicitly enabled", () => {
    delete process.env.NEXT_PUBLIC_WORLD_DOCK_AGENT_SESSIONS;
    expect(agentSessionsFeatureEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_WORLD_DOCK_AGENT_SESSIONS = "0";
    expect(agentSessionsFeatureEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_WORLD_DOCK_AGENT_SESSIONS = "1";
    expect(agentSessionsFeatureEnabled()).toBe(true);
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

  it("invalidates exploration lists, current detail, and all world session details after setting current", async () => {
    const session = buildSession({ id: "session_target" });
    vi.mocked(api.setCurrentAgentSession).mockResolvedValue({ session });
    const queryWrapper = createQueryWrapper();
    const { queryClient } = queryWrapper;
    const targetDetailKey = agentSessionKeys.detail("world_1", "session_target");
    const staleDetailKey = agentSessionKeys.detail("world_1", "session_old");
    const otherWorldDetailKey = agentSessionKeys.detail("world_2", "session_other");
    const historyKey = agentSessionKeys.list("world_1", EXPLORATION_HISTORY_QUERY);
    const currentKey = agentSessionKeys.currentDetail("world_1", currentExplorationQuery);

    queryClient.setQueryData(targetDetailKey, buildDetail(session));
    queryClient.setQueryData(staleDetailKey, buildDetail(buildSession({ id: "session_old" })));
    queryClient.setQueryData(otherWorldDetailKey, buildDetail(buildSession({ id: "session_other", worldId: "world_2" })));
    queryClient.setQueryData(historyKey, { sessions: [session], nextCursor: null });
    queryClient.setQueryData(currentKey, buildDetail(session));

    const { result } = renderHook(
      () => useSetCurrentAgentSession("world_1"),
      { wrapper: queryWrapper.Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync("session_target");
    });

    expect(queryClient.getQueryState(targetDetailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(staleDetailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherWorldDetailKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(historyKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(currentKey)?.isInvalidated).toBe(true);
  });

  it("lists potential assets for a session", async () => {
    const potentialAsset = buildPotentialAsset({ id: "pa_1", title: "记忆交易许可" });
    vi.mocked(api.listPotentialAssetsForSession).mockResolvedValue({
      potentialAssets: [potentialAsset],
      nextCursor: null,
    });

    const { result } = renderHook(
      () => useSessionPotentialAssets("world_1", "session_1"),
      { wrapper: createQueryWrapper().Wrapper },
    );

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe("pa_1"));

    expect(api.listPotentialAssetsForSession).toHaveBeenCalledWith("world_1", "session_1");
  });

  it("invalidates potential and official asset queries after promotion", async () => {
    const potentialAsset = buildPotentialAsset({ id: "pa_1", status: "promoted" });
    vi.mocked(api.promotePotentialAsset).mockResolvedValue({
      potentialAsset,
      depositionRun: { id: "run_1" },
    } as any);
    const queryWrapper = createQueryWrapper();
    const { queryClient } = queryWrapper;
    const sessionPotentialAssetsKey = agentSessionKeys.potentialAssetsForSession("world_1", "session_1");
    const officialAssetsKey = officialAssetsQueryKeys.list("world_1", {
      type: "rule",
      q: "  记忆交易许可  ",
      limit: 20,
    });
    const worldAssetsKey = ["world-assets", "world_1"];

    queryClient.setQueryData(sessionPotentialAssetsKey, [buildPotentialAsset()]);
    queryClient.setQueryData(officialAssetsKey, { assets: [] });
    queryClient.setQueryData(worldAssetsKey, { assets: [] });

    const { result } = renderHook(
      () => usePromotePotentialAsset("world_1", "session_1"),
      { wrapper: queryWrapper.Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync("pa_1");
    });

    expect(api.promotePotentialAsset).toHaveBeenCalledWith("world_1", "pa_1");
    expect(queryClient.getQueryState(sessionPotentialAssetsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(officialAssetsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(worldAssetsKey)?.isInvalidated).toBe(true);
  });

  it("invalidates potential and official asset queries when promotion reports an error", async () => {
    vi.mocked(api.promotePotentialAsset).mockRejectedValue(new Error("沉淀日志写入失败"));
    const queryWrapper = createQueryWrapper();
    const { queryClient } = queryWrapper;
    const sessionPotentialAssetsKey = agentSessionKeys.potentialAssetsForSession("world_1", "session_1");
    const officialAssetsKey = officialAssetsQueryKeys.list("world_1", {
      type: "rule",
      q: "  记忆交易许可  ",
      limit: 20,
    });
    const worldAssetsKey = ["world-assets", "world_1"];

    queryClient.setQueryData(sessionPotentialAssetsKey, [buildPotentialAsset()]);
    queryClient.setQueryData(officialAssetsKey, { assets: [] });
    queryClient.setQueryData(worldAssetsKey, { assets: [] });

    const { result } = renderHook(
      () => usePromotePotentialAsset("world_1", "session_1"),
      { wrapper: queryWrapper.Wrapper },
    );

    await act(async () => {
      await expect(result.current.mutateAsync("pa_1")).rejects.toThrow("沉淀日志写入失败");
    });

    expect(api.promotePotentialAsset).toHaveBeenCalledWith("world_1", "pa_1");
    expect(queryClient.getQueryState(sessionPotentialAssetsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(officialAssetsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(worldAssetsKey)?.isInvalidated).toBe(true);
  });

  it("invalidates potential asset queries after dismissal", async () => {
    vi.mocked(api.dismissPotentialAsset).mockResolvedValue({
      potentialAsset: buildPotentialAsset({ id: "pa_1", status: "dismissed" }),
    });
    const queryWrapper = createQueryWrapper();
    const sessionPotentialAssetsKey = agentSessionKeys.potentialAssetsForSession("world_1", "session_1");
    queryWrapper.queryClient.setQueryData(sessionPotentialAssetsKey, [buildPotentialAsset()]);

    const { result } = renderHook(
      () => useDismissPotentialAsset("world_1", "session_1"),
      { wrapper: queryWrapper.Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync("pa_1");
    });

    expect(api.dismissPotentialAsset).toHaveBeenCalledWith("world_1", "pa_1");
    expect(queryWrapper.queryClient.getQueryState(sessionPotentialAssetsKey)?.isInvalidated).toBe(true);
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

function buildPotentialAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "pa_1",
    worldId: "world_1",
    sessionId: "session_1",
    type: "rule",
    title: "记忆交易许可",
    summary: "需要登记。",
    evidence: [],
    status: "active",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  } as any;
}
