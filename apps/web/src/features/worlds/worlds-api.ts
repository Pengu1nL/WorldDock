import {
  createWorld,
  deleteWorld,
  duplicateWorld,
  listWorlds,
  type ApiClientOptions,
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
