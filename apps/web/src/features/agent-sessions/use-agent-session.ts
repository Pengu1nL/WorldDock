import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  archiveAgentSession,
  createAgentSession,
  createAgentSessionRun,
  dismissPotentialAsset,
  getAgentSession,
  listAgentSessions,
  listPotentialAssetsForSession,
  promotePotentialAsset,
  setCurrentAgentSession,
  streamAgentSessionRunEvents,
  WorldDockApiError,
  type AgentSessionDetail,
  type AgentSessionRunEvent,
} from "../worlddock/api";

type WorldLike = string | { id?: string | null; name?: string | null } | null | undefined;

export const CURRENT_EXPLORATION_QUERY = {
  kind: "world_exploration" as const,
  current: true,
  includeArchived: false,
  limit: 1,
};

export const EXPLORATION_HISTORY_QUERY = {
  kind: "world_exploration" as const,
  includeArchived: false,
  limit: 50,
};

export const agentSessionKeys = {
  detailPrefix: (worldId: string | null | undefined) => [
    "agent-session",
    worldId,
  ],
  detail: (worldId: string | null | undefined, sessionId: string | null | undefined) => [
    "agent-session",
    worldId,
    sessionId,
  ],
  list: (worldId: string | null | undefined, query: Record<string, unknown>) => [
    "agent-sessions",
    worldId,
    query,
  ],
  currentDetail: (worldId: string | null | undefined, query: Record<string, unknown>) => [
    "agent-session-current",
    worldId,
    query,
  ],
  potentialAssetsPrefix: (worldId: string | null | undefined) => [
    "potential-assets",
    worldId,
  ],
  potentialAssetsForSession: (worldId: string | null | undefined, sessionId: string | null | undefined) => [
    "potential-assets",
    worldId,
    "session",
    sessionId,
  ],
};

export function agentSessionsFeatureEnabled() {
  return process.env.NEXT_PUBLIC_WORLD_DOCK_AGENT_SESSIONS === "1";
}

export function useAgentSessionDetail(worldId: string | null | undefined, sessionId: string | null | undefined) {
  return useQuery({
    queryKey: agentSessionKeys.detail(worldId, sessionId),
    queryFn: () => getAgentSession(worldId as string, sessionId as string),
    enabled: Boolean(worldId && sessionId),
    retry: false,
  });
}

export function useCurrentExplorationSession(world: WorldLike) {
  const worldId = getWorldId(world);
  const worldName = typeof world === "object" && world ? world.name : undefined;

  return useQuery({
    queryKey: agentSessionKeys.currentDetail(worldId, CURRENT_EXPLORATION_QUERY),
    queryFn: async () => {
      const current = await listAgentSessions(worldId as string, CURRENT_EXPLORATION_QUERY);
      const session = current.sessions[0]
        ?? (await createAgentSession(worldId as string, {
          kind: "world_exploration",
          title: `${worldName?.trim() || "世界"} 推演`,
          current: true,
        })).session;

      return getAgentSession(worldId as string, session.id);
    },
    enabled: Boolean(worldId),
    retry: false,
  });
}

export function useExplorationSessionList(worldId: string | null | undefined) {
  return useQuery({
    queryKey: agentSessionKeys.list(worldId, EXPLORATION_HISTORY_QUERY),
    queryFn: () => listAgentSessions(worldId as string, EXPLORATION_HISTORY_QUERY),
    enabled: Boolean(worldId),
    retry: false,
    select: (result) => result.sessions,
  });
}

export function useSessionPotentialAssets(
  worldId: string | null | undefined,
  sessionId: string | null | undefined,
) {
  return useQuery({
    queryKey: agentSessionKeys.potentialAssetsForSession(worldId, sessionId),
    queryFn: () => listPotentialAssetsForSession(worldId as string, sessionId as string),
    enabled: Boolean(worldId && sessionId),
    retry: false,
    select: (result) => result.potentialAssets,
  });
}

export function useSetCurrentAgentSession(worldId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => setCurrentAgentSession(worldId as string, sessionId),
    onSuccess: ({ session }) => {
      invalidateExplorationSessionQueries(queryClient, worldId, session.id);
    },
  });
}

export function useArchiveAgentSession(worldId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => archiveAgentSession(worldId as string, sessionId),
    onSuccess: ({ session }) => {
      invalidateExplorationSessionQueries(queryClient, worldId, session.id);
    },
  });
}

export function useCreateExplorationSession(world: WorldLike) {
  const worldId = getWorldId(world);
  const worldName = typeof world === "object" && world ? world.name : undefined;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title?: string) => createAgentSession(worldId as string, {
      kind: "world_exploration",
      title: title?.trim() || `${worldName?.trim() || "世界"} 推演`,
      current: true,
    }),
    onSuccess: ({ session }) => {
      invalidateExplorationSessionQueries(queryClient, worldId, session.id);
    },
  });
}

export function useCreateSessionRun(worldId: string | null | undefined, sessionId: string | null | undefined) {
  return useMutation({
    mutationFn: (prompt: string) => createAgentSessionRun(worldId as string, sessionId as string, { prompt }),
  });
}

export function usePromotePotentialAsset(
  worldId: string | null | undefined,
  sessionId?: string | null | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (potentialAssetId: string) => promotePotentialAsset(worldId as string, potentialAssetId),
    onSuccess: () => {
      invalidatePotentialAssetQueries(queryClient, worldId, sessionId);
      if (worldId) {
        void queryClient.invalidateQueries({ queryKey: ["official-assets", worldId] });
        void queryClient.invalidateQueries({ queryKey: ["world-assets", worldId] });
      }
    },
  });
}

export function useDismissPotentialAsset(
  worldId: string | null | undefined,
  sessionId?: string | null | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (potentialAssetId: string) => dismissPotentialAsset(worldId as string, potentialAssetId),
    onSuccess: () => {
      invalidatePotentialAssetQueries(queryClient, worldId, sessionId);
    },
  });
}

export function useStreamSessionRun(runId: string | null | undefined) {
  return useMutation({
    mutationFn: ({
      runId: runIdOverride,
      signal,
      onEvent,
    }: {
      runId?: string;
      signal?: AbortSignal;
      onEvent: (event: AgentSessionRunEvent) => void;
    }) => {
      const targetRunId = runIdOverride ?? runId;
      if (!targetRunId) throw new Error("Missing session run id");
      return streamAgentSessionRunEvents(targetRunId, { signal }, onEvent);
    },
  });
}

export function isAgentSessionNotFoundError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof WorldDockApiError && error.status === 404) return true;
  if (typeof error === "object" && "status" in error && (error as { status?: unknown }).status === 404) return true;
  if (error instanceof Error && /\b(?:failed\s+)?with 404\b/i.test(error.message)) return true;
  if (error instanceof Error && "cause" in error) return isAgentSessionNotFoundError(error.cause);
  return false;
}

function getWorldId(world: WorldLike) {
  if (typeof world === "string") return world;
  return world?.id ?? undefined;
}

function invalidateExplorationSessionQueries(
  queryClient: QueryClient,
  worldId: string | null | undefined,
  sessionId?: string | null,
) {
  if (!worldId) return;
  void queryClient.invalidateQueries({ queryKey: agentSessionKeys.list(worldId, EXPLORATION_HISTORY_QUERY) });
  void queryClient.invalidateQueries({ queryKey: agentSessionKeys.currentDetail(worldId, CURRENT_EXPLORATION_QUERY) });
  void queryClient.invalidateQueries({ queryKey: agentSessionKeys.detailPrefix(worldId) });
  if (sessionId) {
    void queryClient.invalidateQueries({ queryKey: agentSessionKeys.detail(worldId, sessionId) });
  }
}

function invalidatePotentialAssetQueries(
  queryClient: QueryClient,
  worldId: string | null | undefined,
  sessionId?: string | null,
) {
  if (!worldId) return;
  void queryClient.invalidateQueries({ queryKey: agentSessionKeys.potentialAssetsPrefix(worldId) });
  if (sessionId) {
    void queryClient.invalidateQueries({ queryKey: agentSessionKeys.potentialAssetsForSession(worldId, sessionId) });
  }
}

export type CurrentExplorationSessionResult = AgentSessionDetail;
