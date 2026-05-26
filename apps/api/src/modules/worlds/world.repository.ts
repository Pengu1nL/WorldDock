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
  createdAt: Date;
  updatedAt: Date;
};

export type ArchiveEntryRecord = {
  id: string;
  worldId: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  relations?: string[];
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
  createdAt: Date;
  updatedAt: Date;
};

export type AssetCounts = {
  archive: number;
  seeds: number;
  conflicts: number;
};

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
  updateWorld(id: string, input: Partial<Pick<WorldRecord, "name" | "type" | "summary" | "tags" | "status" | "visibility" | "mode" | "maturity">>): Promise<WorldRecord | null>;
  archiveWorld(id: string): Promise<WorldRecord | null>;
  listArchiveEntries(worldId: string): Promise<ArchiveEntryRecord[]>;
  createArchiveEntry(input: Omit<ArchiveEntryRecord, "id" | "createdAt" | "updatedAt">): Promise<ArchiveEntryRecord>;
  listStorySeeds(worldId: string): Promise<StorySeedRecord[]>;
  createStorySeed(input: Omit<StorySeedRecord, "id" | "createdAt" | "updatedAt">): Promise<StorySeedRecord>;
  listConflicts(worldId: string): Promise<ConflictRecord[]>;
  createConflict(input: Omit<ConflictRecord, "id" | "createdAt" | "updatedAt">): Promise<ConflictRecord>;
  countAssets(worldId: string): Promise<AssetCounts>;
};
