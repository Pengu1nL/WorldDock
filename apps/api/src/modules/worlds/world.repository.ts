export const WORLD_REPOSITORY = Symbol("WORLD_REPOSITORY");

export type WorldRecord = {
  id: string;
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

export type CreateArchiveEntryInput = Omit<ArchiveEntryRecord, "id" | "createdAt" | "updatedAt"> & { id?: string };
export type CreateStorySeedInput = Omit<StorySeedRecord, "id" | "createdAt" | "updatedAt"> & { id?: string };
export type CreateConflictInput = Omit<ConflictRecord, "id" | "createdAt" | "updatedAt"> & { id?: string };

export type WorldRepository = {
  createWorld(input: {
    name: string;
    type: string;
    summary: string;
    tags: string[];
    mode: "cloud" | "local";
    maturity?: number;
  }): Promise<WorldRecord>;
  listWorlds(): Promise<WorldRecord[]>;
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
  createArchiveEntry(input: CreateArchiveEntryInput): Promise<ArchiveEntryRecord>;
  listStorySeeds(worldId: string): Promise<StorySeedRecord[]>;
  createStorySeed(input: CreateStorySeedInput): Promise<StorySeedRecord>;
  listConflicts(worldId: string): Promise<ConflictRecord[]>;
  createConflict(input: CreateConflictInput): Promise<ConflictRecord>;
  listAssetRelations(worldId: string): Promise<WorldAssetRelationRecord[]>;
  countAssets(worldId: string): Promise<AssetCounts>;
};
