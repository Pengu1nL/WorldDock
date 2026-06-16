import type {
  ConsistencyIssueSeverity,
  ConsistencyIssueStatus,
} from "@worlddock/contract/consistency";

export const CONSISTENCY_REPOSITORY = Symbol("CONSISTENCY_REPOSITORY");

export type ConsistencyIssueEvidenceRecord = {
  assetId?: string;
  messageId?: string;
  quote: string;
  confidence?: number;
  field?: "name" | "summary" | "markdown";
};

export type ConsistencyIssueRecord = {
  id: string;
  worldId: string;
  title: string;
  description: string;
  involves: string[];
  severity: ConsistencyIssueSeverity;
  status: ConsistencyIssueStatus;
  subjectAssetIds: string[];
  evidence: ConsistencyIssueEvidenceRecord[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
};

export type ConsistencyIssueDetail = ConsistencyIssueRecord;

export type CreateConsistencyIssueRecordInput = Pick<
  ConsistencyIssueRecord,
  "worldId" | "title" | "description" | "involves" | "severity" | "subjectAssetIds" | "evidence"
> &
  Partial<Pick<ConsistencyIssueRecord, "metadata">>;

export type ListConsistencyIssuesQuery = {
  status?: ConsistencyIssueStatus;
  cursor?: string;
  limit?: number;
};

export type ConsistencyRepository = {
  createIssue(input: CreateConsistencyIssueRecordInput): Promise<ConsistencyIssueRecord>;
  findOpenIssueByDedupeKey(worldId: string, dedupeKey: string): Promise<ConsistencyIssueRecord | null>;
  listIssues(
    worldId: string,
    query?: ListConsistencyIssuesQuery,
  ): Promise<{ issues: ConsistencyIssueRecord[]; nextCursor: string | null }>;
  getIssue(worldId: string, issueId: string): Promise<ConsistencyIssueDetail | null>;
  updateIssueStatus(
    worldId: string,
    issueId: string,
    status: ConsistencyIssueStatus,
  ): Promise<ConsistencyIssueRecord | null>;
};

export const DEFAULT_CONSISTENCY_ISSUE_LIST_LIMIT = 20;
export const MAX_CONSISTENCY_ISSUE_LIST_LIMIT = 50;

export type ConsistencyIssueListCursor = {
  createdAt: Date;
  id: string;
};

export class InvalidConsistencyIssueListCursorError extends Error {}

export function normalizeConsistencyIssueListLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_CONSISTENCY_ISSUE_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CONSISTENCY_ISSUE_LIST_LIMIT);
}

export function encodeConsistencyIssueListCursor(issue: Pick<ConsistencyIssueRecord, "id" | "createdAt">) {
  return Buffer.from(JSON.stringify({ createdAt: issue.createdAt.toISOString(), id: issue.id })).toString("base64url");
}

export function decodeConsistencyIssueListCursor(cursor: string): ConsistencyIssueListCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.id !== "string" || typeof parsed.createdAt !== "string") {
      throw new InvalidConsistencyIssueListCursorError("Invalid consistency issue cursor.");
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new InvalidConsistencyIssueListCursorError("Invalid consistency issue cursor.");
    }
    return { createdAt, id: parsed.id };
  } catch (error) {
    if (error instanceof InvalidConsistencyIssueListCursorError) throw error;
    throw new InvalidConsistencyIssueListCursorError("Invalid consistency issue cursor.");
  }
}
