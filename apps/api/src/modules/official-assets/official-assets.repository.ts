import type {
  OfficialWorldAssetStatus,
  OfficialWorldAssetType,
  WorldAssetPatchStatus,
} from "@worlddock/contract/assets";

export const OFFICIAL_ASSETS_REPOSITORY = Symbol("OFFICIAL_ASSETS_REPOSITORY");

export type OfficialAssetRecord = {
  id: string;
  worldId: string;
  type: OfficialWorldAssetType;
  name: string;
  summary: string;
  documentKey: string;
  status: OfficialWorldAssetStatus;
  version: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type OfficialAssetRevisionRecord = {
  id: string;
  worldId: string;
  assetId: string;
  version: number;
  markdown: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type OfficialAssetSectionIndexRecord = {
  id: string;
  worldId: string;
  assetId: string;
  title: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type OfficialAssetDetailRecord = {
  asset: OfficialAssetRecord;
  revisions: OfficialAssetRevisionRecord[];
  indexes: OfficialAssetSectionIndexRecord[];
};

export type OfficialAssetPatchRecord = {
  id: string;
  worldId: string;
  assetId: string;
  sessionId: string | null;
  batchId: string | null;
  beforeRevisionId: string | null;
  afterRevisionId: string | null;
  beforeMarkdown: string;
  afterMarkdown: string;
  diff: string | null;
  assetVersionFrom: number;
  assetVersionTo: number;
  status: WorldAssetPatchStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  appliedAt: Date | null;
  revertedAt: Date | null;
};

export type CreateOfficialAssetRecordInput = {
  id: string;
  worldId: string;
  type: OfficialWorldAssetType;
  name: string;
  summary: string;
  documentKey: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  initialRevision: {
    markdown: string;
    summary: string | null;
    metadata?: Record<string, unknown>;
  };
  indexes: Array<{
    title: string;
    summary: string | null;
    metadata?: Record<string, unknown>;
  }>;
};

export type UpdateOfficialAssetRecordInput = {
  name?: string;
  summary?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  status?: OfficialWorldAssetStatus;
};

export type ApplyOfficialAssetPatchRecordInput = {
  worldId: string;
  assetId: string;
  sessionId: string;
  expectedVersion: number;
  expectedBeforeRevisionId: string | null;
  beforeMarkdown: string;
  afterMarkdown: string;
  diff: string;
  summary: string;
  metadata?: Record<string, unknown>;
  indexes: Array<{
    title: string;
    summary: string | null;
    metadata?: Record<string, unknown>;
  }>;
};

export type RevertOfficialAssetPatchRecordInput = {
  worldId: string;
  assetId: string;
  patchId: string;
  expectedVersion: number;
  expectedLatestRevisionId: string | null;
  markdown: string;
  summary: string;
  metadata?: Record<string, unknown>;
  indexes: Array<{
    title: string;
    summary: string | null;
    metadata?: Record<string, unknown>;
  }>;
};

export type ListOfficialAssetsQuery = {
  type?: OfficialWorldAssetType;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type OfficialAssetsRepository = {
  createAsset(input: CreateOfficialAssetRecordInput): Promise<OfficialAssetDetailRecord>;
  updateAsset(
    worldId: string,
    assetId: string,
    input: UpdateOfficialAssetRecordInput,
  ): Promise<OfficialAssetDetailRecord | null>;
  listAssets(
    worldId: string,
    query?: ListOfficialAssetsQuery,
  ): Promise<{ assets: OfficialAssetRecord[]; nextCursor: string | null }>;
  getAsset(worldId: string, assetId: string): Promise<OfficialAssetDetailRecord | null>;
};

export type OfficialAssetPatchesRepository = {
  applyPatch(input: ApplyOfficialAssetPatchRecordInput): Promise<OfficialAssetPatchRecord | null>;
  listPatches(worldId: string, assetId: string): Promise<OfficialAssetPatchRecord[]>;
  getPatch(worldId: string, assetId: string, patchId: string): Promise<OfficialAssetPatchRecord | null>;
  revertPatch(input: RevertOfficialAssetPatchRecordInput): Promise<OfficialAssetPatchRecord | null>;
};

export class OfficialAssetPatchConflictError extends Error {
  constructor() {
    super("Official asset changed while applying patch.");
    this.name = "OfficialAssetPatchConflictError";
  }
}

export class OfficialAssetPatchAlreadyRevertedError extends Error {
  constructor() {
    super("World asset patch has already been reverted.");
    this.name = "OfficialAssetPatchAlreadyRevertedError";
  }
}

export const DEFAULT_OFFICIAL_ASSET_LIST_LIMIT = 20;
export const MAX_OFFICIAL_ASSET_LIST_LIMIT = 50;

export type OfficialAssetListCursor = {
  createdAt: Date;
  id: string;
};

export class InvalidOfficialAssetListCursorError extends Error {}

export function normalizeOfficialAssetListLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_OFFICIAL_ASSET_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_OFFICIAL_ASSET_LIST_LIMIT);
}

export function encodeOfficialAssetListCursor(asset: Pick<OfficialAssetRecord, "id" | "createdAt">) {
  return Buffer.from(JSON.stringify({ createdAt: asset.createdAt.toISOString(), id: asset.id })).toString("base64url");
}

export function decodeOfficialAssetListCursor(cursor: string): OfficialAssetListCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.id !== "string" || typeof parsed.createdAt !== "string") {
      throw new InvalidOfficialAssetListCursorError("Invalid official asset cursor.");
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new InvalidOfficialAssetListCursorError("Invalid official asset cursor.");
    }
    return { createdAt, id: parsed.id };
  } catch (error) {
    if (error instanceof InvalidOfficialAssetListCursorError) throw error;
    throw new InvalidOfficialAssetListCursorError("Invalid official asset cursor.");
  }
}
