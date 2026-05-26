import type { AgentEvent, TokenUsage, WorldSuggestion } from "@worlddock/domain";

export const AGENT_REPOSITORY = Symbol("AGENT_REPOSITORY");

export type AgentRunRecord = {
  id: string;
  worldId: string;
  userId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  mode: "expand" | "challenge" | "fork" | "polish";
  prompt: string;
  model?: string | null;
  tokenUsage?: TokenUsage | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  cancelledAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type AgentEventRecord = Omit<AgentEvent, "createdAt"> & {
  createdAt: Date;
};

export type AgentSuggestionRecord = {
  id: string;
  runId: string;
  worldId: string;
  status: "pending" | "saved" | "discarded";
  suggestion: WorldSuggestion;
  savedAssetId?: string | null;
};

export type ContextRefRecord = {
  id: string;
  runId: string;
  kind: "world" | "archive" | "seed" | "conflict" | "repository";
  title: string;
  excerpt: string;
  targetId?: string | null;
};

export type AgentRepository = {
  createRun(input: Pick<AgentRunRecord, "worldId" | "userId" | "mode" | "prompt" | "model">): Promise<AgentRunRecord>;
  findRunById(id: string): Promise<AgentRunRecord | null>;
  updateRun(id: string, input: Partial<AgentRunRecord>): Promise<AgentRunRecord | null>;
  appendEvent(input: Omit<AgentEventRecord, "id" | "createdAt">): Promise<AgentEventRecord>;
  listEvents(runId: string): Promise<AgentEventRecord[]>;
  createContextRef(input: Omit<ContextRefRecord, "id">): Promise<ContextRefRecord>;
  createSuggestion(input: Omit<AgentSuggestionRecord, "id" | "status" | "savedAssetId">): Promise<AgentSuggestionRecord>;
  listSuggestions(runId: string): Promise<AgentSuggestionRecord[]>;
  findSuggestionById(id: string): Promise<AgentSuggestionRecord | null>;
  updateSuggestion(id: string, input: Partial<AgentSuggestionRecord>): Promise<AgentSuggestionRecord | null>;
};
