import type { StorageObjectStatus, StoragePurpose, StorageVisibility } from "@worlddock/domain";

export const STORAGE_REPOSITORY = Symbol("STORAGE_REPOSITORY");

export type StorageObjectRecord = {
  id: string;
  ownerId: string;
  bucket: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  purpose: StoragePurpose;
  visibility: StorageVisibility;
  status: StorageObjectStatus;
  worldId: string | null;
  repositoryId: string | null;
  releaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type StorageRepository = {
  createObject(input: Omit<StorageObjectRecord, "id" | "status" | "createdAt" | "updatedAt" | "deletedAt">): Promise<StorageObjectRecord>;
  findObjectById(id: string): Promise<StorageObjectRecord | null>;
  attachObject(id: string, input: Partial<Pick<StorageObjectRecord, "worldId" | "repositoryId" | "releaseId">>): Promise<StorageObjectRecord | null>;
  markDeleted(id: string, deletedAt: Date): Promise<StorageObjectRecord | null>;
  listCleanupCandidates(before: Date, limit?: number): Promise<StorageObjectRecord[]>;
};
