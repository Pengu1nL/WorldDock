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
  limit?: number;
};

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
  listSessions(worldId: string, query?: ListAgentSessionsQuery): Promise<AgentSessionRecord[]>;
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
    input: Pick<AgentSessionContextItemRecord, "sessionId" | "kind" | "targetId"> &
      Partial<Pick<AgentSessionContextItemRecord, "title" | "summary" | "metadata">>,
  ): Promise<AgentSessionContextItemRecord>;
  listContextItems(sessionId: string): Promise<AgentSessionContextItemRecord[]>;
  appendMessage(
    input: Pick<AgentSessionMessageRecord, "sessionId" | "sequence" | "role" | "content"> &
      Partial<Pick<AgentSessionMessageRecord, "status" | "metadata">>,
  ): Promise<AgentSessionMessageRecord>;
  listMessages(sessionId: string): Promise<AgentSessionMessageRecord[]>;
};
