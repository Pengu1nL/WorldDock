import type { OfficialWorldAssetType } from "@worlddock/contract/assets";
import type { PotentialAssetEvidence, PotentialAssetStatus } from "@worlddock/contract/potential-assets";

export const POTENTIAL_ASSETS_REPOSITORY = Symbol("POTENTIAL_ASSETS_REPOSITORY");

export type PotentialAssetRecord = {
  id: string;
  worldId: string;
  sessionId: string;
  runId: string | null;
  type: OfficialWorldAssetType;
  title: string;
  summary: string;
  evidence: PotentialAssetEvidence[];
  status: PotentialAssetStatus;
  promotedAssetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePotentialAssetRecordInput = Pick<
  PotentialAssetRecord,
  "worldId" | "sessionId" | "type" | "title" | "summary" | "evidence"
> &
  Partial<Pick<PotentialAssetRecord, "runId" | "status" | "promotedAssetId" | "metadata">>;

export type ListPotentialAssetsForWorldQuery = {
  status?: PotentialAssetStatus;
  type?: OfficialWorldAssetType;
  cursor?: string;
  limit?: number;
};

export type PotentialAssetsRepository = {
  createMany(input: CreatePotentialAssetRecordInput[]): Promise<PotentialAssetRecord[]>;
  findById(worldId: string, id: string): Promise<PotentialAssetRecord | null>;
  listForSession(worldId: string, sessionId: string): Promise<PotentialAssetRecord[]>;
  listForRun(worldId: string, runId: string): Promise<PotentialAssetRecord[]>;
  listForWorld(
    worldId: string,
    query?: ListPotentialAssetsForWorldQuery,
  ): Promise<{ potentialAssets: PotentialAssetRecord[]; nextCursor: string | null }>;
  updateStatus(
    worldId: string,
    id: string,
    status: PotentialAssetStatus,
  ): Promise<PotentialAssetRecord | null>;
  dismiss(worldId: string, id: string): Promise<PotentialAssetRecord | null>;
  claimPromotion(
    worldId: string,
    id: string,
    metadata?: Record<string, unknown>,
  ): Promise<PotentialAssetRecord | null>;
  markPromoted(
    worldId: string,
    id: string,
    promotedAssetId: string,
    metadata?: Record<string, unknown>,
  ): Promise<PotentialAssetRecord | null>;
  completePromotion(
    worldId: string,
    id: string,
    promotedAssetId: string,
    metadata?: Record<string, unknown>,
  ): Promise<PotentialAssetRecord | null>;
  rollbackPromotion(
    worldId: string,
    id: string,
    promotedAssetId: string,
    metadata?: Record<string, unknown>,
  ): Promise<PotentialAssetRecord | null>;
};

export const DEFAULT_POTENTIAL_ASSET_LIST_LIMIT = 20;
export const MAX_POTENTIAL_ASSET_LIST_LIMIT = 50;

export type PotentialAssetListCursor = {
  createdAt: Date;
  id: string;
};

export class InvalidPotentialAssetListCursorError extends Error {}

export function normalizePotentialAssetListLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_POTENTIAL_ASSET_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_POTENTIAL_ASSET_LIST_LIMIT);
}

export function encodePotentialAssetListCursor(asset: Pick<PotentialAssetRecord, "id" | "createdAt">) {
  return Buffer.from(JSON.stringify({ createdAt: asset.createdAt.toISOString(), id: asset.id })).toString("base64url");
}

export function decodePotentialAssetListCursor(cursor: string): PotentialAssetListCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.id !== "string" || typeof parsed.createdAt !== "string") {
      throw new InvalidPotentialAssetListCursorError("Invalid potential asset cursor.");
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new InvalidPotentialAssetListCursorError("Invalid potential asset cursor.");
    }
    return { createdAt, id: parsed.id };
  } catch (error) {
    if (error instanceof InvalidPotentialAssetListCursorError) throw error;
    throw new InvalidPotentialAssetListCursorError("Invalid potential asset cursor.");
  }
}
