import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  getConsistencyIssue,
  ignoreConsistencyIssue,
  listConsistencyIssues,
  reopenConsistencyIssue,
  runConsistencyCheck,
  type ConsistencyIssue,
  type ListConsistencyIssuesOptions,
} from "../worlddock/api";

export type ConsistencyIssuesQuery = Pick<
  ListConsistencyIssuesOptions,
  "status" | "cursor" | "limit"
>;

type ConsistencyIssueListResult = {
  issues: ConsistencyIssue[];
  nextCursor: string | null;
};

export type ConsistencyIssueBadge = number | `${number}+`;

export const consistencyIssueQueryKeys = {
  all: ["consistency-issues"] as const,
  world: (worldId: string | null | undefined) => [
    ...consistencyIssueQueryKeys.all,
    worldId ?? "",
  ] as const,
  lists: (worldId: string | null | undefined) => [
    ...consistencyIssueQueryKeys.world(worldId),
    "list",
  ] as const,
  list: (worldId: string | null | undefined, query: ConsistencyIssuesQuery = {}) => [
    ...consistencyIssueQueryKeys.lists(worldId),
    normalizeConsistencyIssuesQuery(query),
  ] as const,
  details: (worldId: string | null | undefined) => [
    ...consistencyIssueQueryKeys.world(worldId),
    "detail",
  ] as const,
  detail: (worldId: string | null | undefined, issueId: string | null | undefined) => [
    ...consistencyIssueQueryKeys.details(worldId),
    issueId ?? "",
  ] as const,
};

export function useConsistencyIssues(
  worldId: string | null | undefined,
  query: ConsistencyIssuesQuery = {},
) {
  const normalizedQuery = normalizeConsistencyIssuesQuery(query);

  return useQuery({
    queryKey: consistencyIssueQueryKeys.list(worldId, normalizedQuery),
    queryFn: () => {
      if (!worldId) throw new Error("World id is required.");
      return listConsistencyIssues(worldId, {
        status: normalizedQuery.status,
        cursor: normalizedQuery.cursor,
        limit: normalizedQuery.limit,
      });
    },
    enabled: Boolean(worldId),
    retry: false,
  });
}

export function getLoadedConsistencyIssueBadge(
  result: ConsistencyIssueListResult | null | undefined,
): ConsistencyIssueBadge | undefined {
  if (!result) return undefined;
  if (result.nextCursor) return `${result.issues.length}+`;
  return result.issues.length;
}

export function useConsistencyIssueDetail(
  worldId: string | null | undefined,
  issueId: string | null | undefined,
) {
  return useQuery({
    queryKey: consistencyIssueQueryKeys.detail(worldId, issueId),
    queryFn: () => {
      if (!worldId || !issueId) throw new Error("World id and issue id are required.");
      return getConsistencyIssue(worldId, issueId);
    },
    enabled: Boolean(worldId && issueId),
    retry: false,
    select: (result) => result.issue,
  });
}

export function useRunConsistencyCheck(worldId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!worldId) throw new Error("World id is required.");
      return runConsistencyCheck(worldId);
    },
    onSuccess: () => {
      invalidateConsistencyIssueLists(queryClient, worldId);
    },
  });
}

export function useIgnoreIssue(worldId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (issueId: string) => {
      if (!worldId || !issueId) throw new Error("World id and issue id are required.");
      return ignoreConsistencyIssue(worldId, issueId);
    },
    onSuccess: (_result, issueId) => {
      invalidateConsistencyIssueQueries(queryClient, worldId, issueId);
    },
  });
}

export function useReopenIssue(worldId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (issueId: string) => {
      if (!worldId || !issueId) throw new Error("World id and issue id are required.");
      return reopenConsistencyIssue(worldId, issueId);
    },
    onSuccess: (_result, issueId) => {
      invalidateConsistencyIssueQueries(queryClient, worldId, issueId);
    },
  });
}

export function invalidateConsistencyIssueQueries(
  queryClient: QueryClient,
  worldId: string | null | undefined,
  issueId?: string | null,
) {
  invalidateConsistencyIssueLists(queryClient, worldId);
  if (!worldId || !issueId) return;
  void queryClient.invalidateQueries({
    queryKey: consistencyIssueQueryKeys.detail(worldId, issueId),
  });
}

function invalidateConsistencyIssueLists(
  queryClient: QueryClient,
  worldId: string | null | undefined,
) {
  if (!worldId) return;
  void queryClient.invalidateQueries({
    queryKey: consistencyIssueQueryKeys.lists(worldId),
  });
}

function normalizeConsistencyIssuesQuery(query: ConsistencyIssuesQuery = {}): ConsistencyIssuesQuery {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(typeof query.limit === "number" ? { limit: query.limit } : {}),
  };
}

export type { ConsistencyIssue };
