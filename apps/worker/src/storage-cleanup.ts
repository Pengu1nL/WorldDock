export type CleanupStorageObject = {
  id: string;
  bucket: string;
  key: string;
};

export type StorageCleanupSource = {
  listCleanupCandidates(before: Date, limit?: number): Promise<CleanupStorageObject[]>;
  deleteObject(object: CleanupStorageObject): Promise<void>;
  markDeleted(objectId: string, deletedAt: Date): Promise<unknown>;
};

export async function cleanupOrphanedStorageObjects(
  source: StorageCleanupSource,
  options: { now?: Date; olderThanMs?: number; limit?: number } = {},
) {
  const now = options.now ?? new Date();
  const olderThanMs = options.olderThanMs ?? 24 * 60 * 60 * 1000;
  const before = new Date(now.getTime() - olderThanMs);
  const candidates = await source.listCleanupCandidates(before, options.limit ?? 100);

  for (const object of candidates) {
    await source.deleteObject(object);
    await source.markDeleted(object.id, now);
  }

  return candidates.length;
}
