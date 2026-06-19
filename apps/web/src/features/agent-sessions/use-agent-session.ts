import { useMutation, useQuery } from "@tanstack/react-query";

import {
  createAgentSession,
  createAgentSessionRun,
  getAgentSession,
  listAgentSessions,
  streamAgentSessionRunEvents,
  type AgentSessionDetail,
  type AgentSessionRunEvent,
} from "../worlddock/api";

type WorldLike = string | { id?: string | null; name?: string | null } | null | undefined;

const CURRENT_EXPLORATION_QUERY = {
  kind: "world_exploration" as const,
  current: true,
  includeArchived: false,
  limit: 1,
};

export const agentSessionKeys = {
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
    queryKey: agentSessionKeys.list(worldId, CURRENT_EXPLORATION_QUERY),
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

export function useCreateSessionRun(worldId: string | null | undefined, sessionId: string | null | undefined) {
  return useMutation({
    mutationFn: (prompt: string) => createAgentSessionRun(worldId as string, sessionId as string, { prompt }),
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

function getWorldId(world: WorldLike) {
  if (typeof world === "string") return world;
  return world?.id ?? undefined;
}

export type CurrentExplorationSessionResult = AgentSessionDetail;
