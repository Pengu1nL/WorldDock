import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { agentEventSchema, suggestionSchema, tokenUsageSchema, type TokenUsage } from "@worlddock/domain";
import type { AgentEventRecord, AgentRepository, AgentRunRecord, AgentSuggestionRecord, ContextRefRecord } from "./agent.repository";

@Injectable()
export class PrismaAgentRepository implements AgentRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createRun(input: Parameters<AgentRepository["createRun"]>[0]) {
    const created = await this.prisma.agentRun.create({ data: input });
    return mapRun(created);
  }

  async findRunById(id: string) {
    const run = await this.prisma.agentRun.findUnique({ where: { id } });
    return run ? mapRun(run) : null;
  }

  async updateRun(id: string, input: Parameters<AgentRepository["updateRun"]>[1]) {
    const updated = await this.prisma.agentRun.updateMany({ where: { id }, data: input as never });
    if (updated.count === 0) return null;
    return this.findRunById(id);
  }

  async appendEvent(input: Parameters<AgentRepository["appendEvent"]>[0]) {
    const created = await this.prisma.agentEvent.create({ data: input as never });
    return mapEvent(created);
  }

  async listEvents(runId: string) {
    const events = await this.prisma.agentEvent.findMany({ where: { runId }, orderBy: { sequence: "asc" } });
    return events.map(mapEvent);
  }

  async createContextRef(input: Parameters<AgentRepository["createContextRef"]>[0]) {
    const created = await this.prisma.contextRef.create({ data: input });
    return mapContextRef(created);
  }

  async createSuggestion(input: Parameters<AgentRepository["createSuggestion"]>[0]) {
    const created = await this.prisma.agentSuggestion.create({
      data: input as never,
    });
    return mapSuggestion(created);
  }

  async listSuggestions(runId: string) {
    const suggestions = await this.prisma.agentSuggestion.findMany({ where: { runId } });
    return suggestions.map(mapSuggestion);
  }

  async findSuggestionById(id: string) {
    const suggestion = await this.prisma.agentSuggestion.findUnique({ where: { id } });
    return suggestion ? mapSuggestion(suggestion) : null;
  }

  async updateSuggestion(id: string, input: Parameters<AgentRepository["updateSuggestion"]>[1]) {
    const updated = await this.prisma.agentSuggestion.updateMany({ where: { id }, data: input as never });
    if (updated.count === 0) return null;
    return this.findSuggestionById(id);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapRun(record: {
  id: string;
  worldId: string;
  userId: string;
  status: string;
  mode: string;
  prompt: string;
  model: string | null;
  provider: string;
  piSessionId: string | null;
  tokenUsage: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}): AgentRunRecord {
  return {
    ...record,
    status: parseRunStatus(record.status),
    mode: parseRunMode(record.mode),
    provider: parseRunProvider(record.provider),
    piSessionId: record.piSessionId,
    tokenUsage: record.tokenUsage ? tokenUsageSchema.parse(record.tokenUsage) : null,
  };
}

function mapEvent(record: {
  id: string;
  runId: string;
  type: string;
  sequence: number;
  payload: unknown;
  createdAt: Date;
}): AgentEventRecord {
  const parsed = agentEventSchema.parse({
    id: record.id,
    runId: record.runId,
    type: record.type,
    sequence: record.sequence,
    payload: record.payload,
    createdAt: record.createdAt.toISOString(),
  });

  return { ...parsed, createdAt: record.createdAt };
}

function mapSuggestion(record: {
  id: string;
  runId: string;
  worldId: string;
  status: string;
  suggestion: unknown;
  savedAssetId: string | null;
}): AgentSuggestionRecord {
  return {
    id: record.id,
    runId: record.runId,
    worldId: record.worldId,
    status: parseSuggestionStatus(record.status),
    suggestion: suggestionSchema.parse(record.suggestion),
    savedAssetId: record.savedAssetId,
  };
}

function mapContextRef(record: {
  id: string;
  runId: string;
  kind: string;
  title: string;
  excerpt: string;
  targetId: string | null;
  level?: string;
  source?: string;
}): ContextRefRecord {
  return {
    id: record.id,
    runId: record.runId,
    kind: parseContextKind(record.kind),
    title: record.title,
    excerpt: record.excerpt,
    targetId: record.targetId,
    level: parseContextLevel(record.level ?? "card"),
    source: parseContextSource(record.source ?? "initial"),
  };
}

function parseRunStatus(value: string): AgentRunRecord["status"] {
  if (value === "running" || value === "completed" || value === "failed" || value === "cancelled") {
    return value;
  }
  throw new Error(`Unknown agent run status: ${value}`);
}

function parseRunMode(value: string): AgentRunRecord["mode"] {
  if (value === "expand" || value === "challenge" || value === "fork" || value === "polish") {
    return value;
  }
  throw new Error(`Unknown agent run mode: ${value}`);
}

function parseRunProvider(value: string): AgentRunRecord["provider"] {
  if (value === "mock" || value === "vercel-ai" || value === "pi") {
    return value;
  }
  throw new Error(`Unknown agent run provider: ${value}`);
}

function parseSuggestionStatus(value: string): AgentSuggestionRecord["status"] {
  if (value === "pending" || value === "edited" || value === "saved" || value === "discarded" || value === "superseded") {
    return value;
  }
  throw new Error(`Unknown agent suggestion status: ${value}`);
}

function parseContextKind(value: string): ContextRefRecord["kind"] {
  if (value === "world" || value === "archive" || value === "seed" || value === "conflict" || value === "repository") {
    return value;
  }
  throw new Error(`Unknown context ref kind: ${value}`);
}

function parseContextLevel(value: string): NonNullable<ContextRefRecord["level"]> {
  if (value === "manifest" || value === "card" || value === "brief" || value === "detail" || value === "source_fragment" || value === "release_delta") {
    return value;
  }
  throw new Error(`Unknown context ref level: ${value}`);
}

function parseContextSource(value: string): NonNullable<ContextRefRecord["source"]> {
  if (value === "initial" || value === "tool") {
    return value;
  }
  throw new Error(`Unknown context ref source: ${value}`);
}
