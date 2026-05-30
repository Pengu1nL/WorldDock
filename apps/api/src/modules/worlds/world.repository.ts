import type { ReleaseChange, ReleaseSnapshot } from "@worlddock/domain";

export const WORLD_REPOSITORY = Symbol("WORLD_REPOSITORY");

export type WorldRecord = {
  id: string;
  ownerId: string;
  name: string;
  type: string;
  summary: string;
  tags: string[];
  status: "draft" | "unpublished" | "published";
  visibility: "private" | "public";
  mode: "cloud" | "local";
  maturity: number;
  coverObjectId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type ArchiveEntryRecord = {
  id: string;
  worldId: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  relations?: string[];
  position?: number;
  createdAt: Date;
  updatedAt: Date;
};

export type StorySeedRecord = {
  id: string;
  worldId: string;
  title: string;
  hook: string;
  trigger?: string | null;
  conflict: string;
  protagonists?: string | null;
  questions?: string[];
  position?: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ConflictRecord = {
  id: string;
  worldId: string;
  title: string;
  summary: string;
  body: string;
  related?: string[];
  derivedSeeds?: string[];
  position?: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AssetCounts = {
  archive: number;
  seeds: number;
  conflicts: number;
};

export type WorldAssetRelationRecord = {
  sourceAssetId: string;
  targetAssetId: string;
};

export type ForkSnapshotAssetMap = {
  upstreamAssetId: string;
  targetAssetId: string;
  kind: "archive" | "seed" | "conflict";
};

export type ForkSyncApplyResult =
  | { status: "applied"; change: ReleaseChange }
  | { status: "skipped"; change: ReleaseChange; reason: "missing_source" | "missing_upstream" | "local_conflict" };

export type WorldRepository = {
  createWorld(input: {
    ownerId: string;
    name: string;
    type: string;
    summary: string;
    tags: string[];
    mode: "cloud" | "local";
    maturity?: number;
  }): Promise<WorldRecord>;
  listWorlds(ownerId: string): Promise<WorldRecord[]>;
  findWorldById(id: string): Promise<WorldRecord | null>;
  updateWorld(
    id: string,
    input: Partial<
      Pick<
        WorldRecord,
        "name" | "type" | "summary" | "tags" | "status" | "visibility" | "mode" | "maturity" | "coverObjectId" | "deletedAt"
      >
    >,
  ): Promise<WorldRecord | null>;
  deleteWorld(id: string): Promise<WorldRecord | null>;
  duplicateWorldAssets(input: { sourceWorldId: string; targetWorldId: string }): Promise<void>;
  listArchiveEntries(worldId: string): Promise<ArchiveEntryRecord[]>;
  createArchiveEntry(input: Omit<ArchiveEntryRecord, "id" | "createdAt" | "updatedAt">): Promise<ArchiveEntryRecord>;
  listStorySeeds(worldId: string): Promise<StorySeedRecord[]>;
  createStorySeed(input: Omit<StorySeedRecord, "id" | "createdAt" | "updatedAt">): Promise<StorySeedRecord>;
  listConflicts(worldId: string): Promise<ConflictRecord[]>;
  createConflict(input: Omit<ConflictRecord, "id" | "createdAt" | "updatedAt">): Promise<ConflictRecord>;
  listAssetRelations(worldId: string): Promise<WorldAssetRelationRecord[]>;
  countAssets(worldId: string): Promise<AssetCounts>;
  replaceWorldFromSnapshot(input: {
    worldId: string;
    snapshot: ReleaseSnapshot;
    status: WorldRecord["status"];
    visibility: WorldRecord["visibility"];
  }): Promise<WorldRecord | null>;
  createAssetFromSnapshot(input: {
    worldId: string;
    upstreamAssetId: string;
    targetAssetId?: string;
    snapshot: ReleaseSnapshot;
  }): Promise<ForkSnapshotAssetMap | null>;
  remapForkAssetReferences(input: {
    worldId: string;
    assetMaps: ForkSnapshotAssetMap[];
  }): Promise<void>;
  replaceForkAssetRelationsFromSnapshot(input: {
    worldId: string;
    snapshot: ReleaseSnapshot;
    assetMaps: ForkSnapshotAssetMap[];
  }): Promise<boolean>;
  forkAssetRelationsMatchSnapshot(input: {
    worldId: string;
    snapshot: ReleaseSnapshot;
    assetMaps: ForkSnapshotAssetMap[];
  }): Promise<boolean>;
  applyForkSnapshotChange(input: {
    worldId: string;
    targetAsset?: ForkSnapshotAssetMap | null;
    assetMaps?: ForkSnapshotAssetMap[];
    sourceSnapshot: ReleaseSnapshot;
    upstreamSnapshot: ReleaseSnapshot;
    change: ReleaseChange;
  }): Promise<ForkSyncApplyResult>;
};
