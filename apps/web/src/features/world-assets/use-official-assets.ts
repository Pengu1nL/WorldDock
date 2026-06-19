import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createAssetEditSession,
  createOfficialAsset,
  listOfficialAssetPatches,
  listOfficialAssets,
  revertOfficialAssetPatch,
  type CreateOfficialAssetInput,
  type ListOfficialAssetsOptions,
} from "../worlddock/api";

export type OfficialAssetsQuery = Pick<ListOfficialAssetsOptions, "type" | "q" | "cursor" | "limit">;

export const officialAssetsQueryKeys = {
  all: ["official-assets"] as const,
  world: (worldId: string | null | undefined) => [
    ...officialAssetsQueryKeys.all,
    worldId ?? "",
  ] as const,
  lists: (worldId: string | null | undefined) => [
    ...officialAssetsQueryKeys.world(worldId),
    "list",
  ] as const,
  list: (worldId: string | null | undefined, query: OfficialAssetsQuery = {}) => [
    ...officialAssetsQueryKeys.lists(worldId),
    normalizeOfficialAssetsQuery(query),
  ] as const,
  details: (worldId: string | null | undefined) => [
    ...officialAssetsQueryKeys.world(worldId),
    "detail",
  ] as const,
  detail: (worldId: string | null | undefined, assetId: string | null | undefined) => [
    ...officialAssetsQueryKeys.details(worldId),
    assetId ?? "",
  ] as const,
  patchLists: (worldId: string | null | undefined) => [
    ...officialAssetsQueryKeys.world(worldId),
    "patches",
  ] as const,
  patches: (worldId: string | null | undefined, assetId: string | null | undefined) => [
    ...officialAssetsQueryKeys.patchLists(worldId),
    assetId ?? "",
  ] as const,
};

export function useOfficialAssets(
  worldId: string | null | undefined,
  query: OfficialAssetsQuery = {},
) {
  const normalizedQuery = normalizeOfficialAssetsQuery(query);

  return useQuery({
    queryKey: officialAssetsQueryKeys.list(worldId, normalizedQuery),
    queryFn: () => {
      if (!worldId) throw new Error("World id is required.");
      return listOfficialAssets(worldId, normalizedQuery);
    },
    enabled: Boolean(worldId),
    retry: false,
  });
}

export function useCreateOfficialAsset(worldId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOfficialAssetInput) => {
      if (!worldId) throw new Error("World id is required.");
      return createOfficialAsset(worldId, input);
    },
    onSuccess: () => {
      if (!worldId) return;
      void queryClient.invalidateQueries({
        queryKey: officialAssetsQueryKeys.lists(worldId),
      });
    },
  });
}

export function useOfficialAssetPatches(
  worldId: string | null | undefined,
  assetId: string | null | undefined,
) {
  return useQuery({
    queryKey: officialAssetsQueryKeys.patches(worldId, assetId),
    queryFn: () => {
      if (!worldId || !assetId) throw new Error("World id and asset id are required.");
      return listOfficialAssetPatches(worldId, assetId);
    },
    enabled: Boolean(worldId && assetId),
    retry: false,
    select: (result) => result.patches,
  });
}

export function useRevertOfficialAssetPatch(
  worldId: string | null | undefined,
  assetId: string | null | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patchId: string) => {
      if (!worldId || !assetId) throw new Error("World id and asset id are required.");
      return revertOfficialAssetPatch(worldId, assetId, patchId);
    },
    onSuccess: () => {
      invalidateOfficialAssetDetailAndPatches(queryClient, worldId, assetId);
    },
  });
}

type CreateAssetEditSessionVariables = {
  assetId: string;
  input?: { title?: string };
};

export function useCreateAssetEditSession(worldId: string | null | undefined) {
  return useMutation({
    mutationFn: ({ assetId, input }: CreateAssetEditSessionVariables) => {
      if (!worldId || !assetId) throw new Error("World id and asset id are required.");
      return createAssetEditSession(worldId, assetId, input);
    },
  });
}

export function invalidateOfficialAssetDetailAndPatches(
  queryClient: QueryClient,
  worldId: string | null | undefined,
  assetId: string | null | undefined,
) {
  if (!worldId || !assetId) return;
  void queryClient.invalidateQueries({ queryKey: officialAssetsQueryKeys.detail(worldId, assetId) });
  void queryClient.invalidateQueries({ queryKey: officialAssetsQueryKeys.lists(worldId) });
  void queryClient.invalidateQueries({ queryKey: officialAssetsQueryKeys.patches(worldId, assetId) });
}

function normalizeOfficialAssetsQuery(query: OfficialAssetsQuery = {}): OfficialAssetsQuery {
  const q = query.q?.trim();

  return {
    ...(query.type ? { type: query.type } : {}),
    ...(q ? { q } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(typeof query.limit === "number" ? { limit: query.limit } : {}),
  };
}
