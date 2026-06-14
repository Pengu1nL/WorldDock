export const AGENT_SESSIONS_REPOSITORY = Symbol("AGENT_SESSIONS_REPOSITORY");

export type AgentSessionRecord = {
  id: string;
  worldId: string;
  kind: "world_exploration" | "asset_edit" | "consistency_repair";
  title: string;
  status: "active" | "archived" | "completed" | "cancelled";
  current: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentSessionKind = AgentSessionRecord["kind"];
export type AgentSessionStatus = AgentSessionRecord["status"];
export type AgentSessionSubjectKind = "world" | "asset" | "consistency_issue" | "potential_asset";
export type AgentSessionSubjectRole = "primary" | "context" | "repair_target";
export type AgentSessionContextItemKind =
  | "asset_index"
  | "asset_document"
  | "asset_section"
  | "source_fragment"
  | "potential_asset"
  | "consistency_issue";
export type AgentSessionMessageRole = "user" | "assistant" | "system" | "tool";
export type AgentSessionMessageStatus = "streaming" | "complete" | "failed";

export type AgentSessionSubjectRecord = {
  id: string;
  sessionId: string;
  kind: AgentSessionSubjectKind;
  targetId: string;
  role: AgentSessionSubjectRole;
  title: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentSessionContextItemRecord = {
  id: string;
  sessionId: string;
  kind: AgentSessionContextItemKind;
  targetId: string;
  title: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAgentSessionContextItemInput = Pick<AgentSessionContextItemRecord, "sessionId" | "kind" | "targetId"> &
  Partial<Pick<AgentSessionContextItemRecord, "title" | "summary" | "metadata">>;

export type AgentSessionMessageRecord = {
  id: string;
  sessionId: string;
  sequence: number;
  role: AgentSessionMessageRole;
  content: string;
  status: AgentSessionMessageStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type ListAgentSessionsQuery = {
  kind?: AgentSessionKind;
  status?: AgentSessionStatus;
  current?: boolean;
  includeArchived?: boolean;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type ListAgentSessionsResult = {
  sessions: AgentSessionRecord[];
  nextCursor: string | null;
};

export const DEFAULT_AGENT_SESSION_LIST_LIMIT = 20;
export const MAX_AGENT_SESSION_LIST_LIMIT = 50;

export type AgentSessionListCursor = {
  updatedAt: Date;
  id: string;
};

export class InvalidAgentSessionListCursorError extends Error {
  constructor() {
    super("Invalid agent session cursor.");
  }
}

export function normalizeAgentSessionListLimit(limit?: number) {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_AGENT_SESSION_LIST_LIMIT;
  return Math.min(Math.trunc(limit), MAX_AGENT_SESSION_LIST_LIMIT);
}

export function encodeAgentSessionListCursor(session: Pick<AgentSessionRecord, "id" | "updatedAt">) {
  return Buffer.from(JSON.stringify({ updatedAt: session.updatedAt.toISOString(), id: session.id })).toString("base64url");
}

export function decodeAgentSessionListCursor(cursor: string): AgentSessionListCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") throw new InvalidAgentSessionListCursorError();
    const { updatedAt, id } = parsed as Record<string, unknown>;
    if (typeof updatedAt !== "string" || typeof id !== "string" || !id) {
      throw new InvalidAgentSessionListCursorError();
    }
    const parsedUpdatedAt = new Date(updatedAt);
    if (Number.isNaN(parsedUpdatedAt.getTime())) throw new InvalidAgentSessionListCursorError();
    return { updatedAt: parsedUpdatedAt, id };
  } catch (error) {
    if (error instanceof InvalidAgentSessionListCursorError) throw error;
    throw new InvalidAgentSessionListCursorError();
  }
}

export type CreateSessionWithSubjectInput = {
  session: Pick<AgentSessionRecord, "worldId" | "kind" | "title"> &
    Partial<Pick<AgentSessionRecord, "status" | "current" | "metadata">>;
  subject: Pick<AgentSessionSubjectRecord, "kind" | "targetId"> &
    Partial<Pick<AgentSessionSubjectRecord, "role" | "title" | "metadata">>;
  clearCurrentWorldExploration?: boolean;
};

export type AgentSessionsRepository = {
  createSession(
    input: Pick<AgentSessionRecord, "worldId" | "kind" | "title"> &
      Partial<Pick<AgentSessionRecord, "status" | "current" | "metadata">>,
  ): Promise<AgentSessionRecord>;
  createSessionWithSubject(input: CreateSessionWithSubjectInput): Promise<AgentSessionRecord>;
  findSessionById(id: string): Promise<AgentSessionRecord | null>;
  findSessionForWorld(worldId: string, sessionId: string): Promise<AgentSessionRecord | null>;
  listSessions(worldId: string, query?: ListAgentSessionsQuery): Promise<ListAgentSessionsResult>;
  updateSession(
    id: string,
    input: Partial<Pick<AgentSessionRecord, "title" | "status" | "current" | "metadata">>,
  ): Promise<AgentSessionRecord | null>;
  clearCurrentWorldExploration(worldId: string): Promise<void>;
  setCurrentWorldExploration(worldId: string, sessionId: string): Promise<AgentSessionRecord | null>;
  createSubject(
    input: Pick<AgentSessionSubjectRecord, "sessionId" | "kind" | "targetId"> &
      Partial<Pick<AgentSessionSubjectRecord, "role" | "title" | "metadata">>,
  ): Promise<AgentSessionSubjectRecord>;
  listSubjects(sessionId: string): Promise<AgentSessionSubjectRecord[]>;
  createContextItem(
    input: CreateAgentSessionContextItemInput,
  ): Promise<AgentSessionContextItemRecord>;
  listContextItems(sessionId: string): Promise<AgentSessionContextItemRecord[]>;
  appendMessage(
    input: Pick<AgentSessionMessageRecord, "sessionId" | "sequence" | "role" | "content"> &
      Partial<Pick<AgentSessionMessageRecord, "status" | "metadata">>,
  ): Promise<AgentSessionMessageRecord>;
  appendMessageAtEnd(
    input: Pick<AgentSessionMessageRecord, "sessionId" | "role" | "content"> &
      Partial<Pick<AgentSessionMessageRecord, "status" | "metadata">>,
  ): Promise<AgentSessionMessageRecord>;
  listMessages(sessionId: string): Promise<AgentSessionMessageRecord[]>;
};
