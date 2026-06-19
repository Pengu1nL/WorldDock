import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOfficialAsset,
  listOfficialAssets,
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

function normalizeOfficialAssetsQuery(query: OfficialAssetsQuery = {}): OfficialAssetsQuery {
  const q = query.q?.trim();

  return {
    ...(query.type ? { type: query.type } : {}),
    ...(q ? { q } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(typeof query.limit === "number" ? { limit: query.limit } : {}),
  };
}
