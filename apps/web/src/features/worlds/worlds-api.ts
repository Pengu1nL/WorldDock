import {
  createWorld,
  createWorldAsset,
  deleteWorld,
  deleteWorldAsset,
  duplicateWorld,
  listWorldAssets,
  listWorlds,
  relateWorldAssets,
  reorderWorldAssets,
  unrelateWorldAssets,
  updateWorldAsset,
  type ApiClientOptions,
  type CreateWorldAssetInput,
  type CreateWorldInput,
} from "../worlddock/api";

export function listCloudWorlds(options: ApiClientOptions) {
  return listWorlds(options);
}

export function createCloudWorld(input: CreateWorldInput, options: ApiClientOptions) {
  return createWorld(input, options);
}

export function deleteCloudWorld(worldId: string, options: ApiClientOptions) {
  return deleteWorld(worldId, options);
}

export function duplicateCloudWorld(worldId: string, options: ApiClientOptions) {
  return duplicateWorld(worldId, options);
}

export function listCloudWorldAssets(worldId: string, options: Parameters<typeof listWorldAssets>[1]) {
  return listWorldAssets(worldId, options);
}

export function createCloudWorldAsset(
  worldId: string,
  input: CreateWorldAssetInput,
  options: ApiClientOptions,
) {
  return createWorldAsset(worldId, input, options);
}

export function updateCloudWorldAsset(
  worldId: string,
  assetId: string,
  input: Parameters<typeof updateWorldAsset>[2],
  options: ApiClientOptions,
) {
  return updateWorldAsset(worldId, assetId, input, options);
}

export function deleteCloudWorldAsset(worldId: string, assetId: string, options: ApiClientOptions) {
  return deleteWorldAsset(worldId, assetId, options);
}

export function reorderCloudWorldAssets(worldId: string, assetIds: string[], options: ApiClientOptions) {
  return reorderWorldAssets(worldId, assetIds, options);
}

export function relateCloudWorldAssets(
  worldId: string,
  sourceAssetId: string,
  targetAssetId: string,
  options: ApiClientOptions,
) {
  return relateWorldAssets(worldId, sourceAssetId, targetAssetId, options);
}

export function unrelateCloudWorldAssets(
  worldId: string,
  sourceAssetId: string,
  targetAssetId: string,
  options: ApiClientOptions,
) {
  return unrelateWorldAssets(worldId, sourceAssetId, targetAssetId, options);
}
