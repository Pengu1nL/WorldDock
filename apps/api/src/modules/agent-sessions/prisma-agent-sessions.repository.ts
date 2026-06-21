import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import {
  decodeAgentSessionListCursor,
  encodeAgentSessionListCursor,
  normalizeAgentSessionListLimit,
} from "./agent-sessions.repository";
import type {
  AgentSessionContextItemKind,
  AgentSessionContextItemRecord,
  AgentSessionKind,
  AgentSessionMessageRecord,
  AgentSessionMessageRole,
  AgentSessionMessageStatus,
  AgentSessionRecord,
  AgentSessionsRepository,
  AgentSessionStatus,
  AgentSessionSubjectKind,
  AgentSessionSubjectRecord,
  AgentSessionSubjectRole,
} from "./agent-sessions.repository";

const sessionKinds = ["world_exploration", "asset_edit", "consistency_repair", "story_progression"] as const;
const sessionStatuses = ["active", "archived", "completed", "cancelled"] as const;
const subjectKinds = ["world", "asset", "consistency_issue", "potential_asset", "narrative", "chapter"] as const;
const subjectRoles = ["primary", "context", "repair_target"] as const;
const contextItemKinds = [
  "asset_index",
  "asset_document",
  "asset_section",
  "source_fragment",
  "potential_asset",
  "consistency_issue",
  "chapter",
  "narrative_asset",
] as const;
const messageRoles = ["user", "assistant", "system", "tool"] as const;
const messageStatuses = ["streaming", "complete", "failed"] as const;
const APPEND_MESSAGE_AT_END_MAX_ATTEMPTS = 3;

class CurrentWorldExplorationSwitchFailed extends Error {}

@Injectable()
export class PrismaAgentSessionsRepository implements AgentSessionsRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createSession(input: Parameters<AgentSessionsRepository["createSession"]>[0]) {
    const created = await this.prisma.agentSession.create({
      data: {
        worldId: input.worldId,
        narrativeId: input.narrativeId ?? null,
        chapterId: input.chapterId ?? null,
        kind: input.kind,
        title: input.title,
        status: input.status ?? "active",
        current: input.current ?? false,
        metadata: (input.metadata ?? {}) as never,
      },
    });
    return mapSession(created);
  }

  async createSessionWithSubject(input: Parameters<AgentSessionsRepository["createSessionWithSubject"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      if (input.clearCurrentWorldExploration) {
        await tx.agentSession.updateMany({
          where: { worldId: input.session.worldId, kind: "world_exploration", current: true },
          data: { current: false },
        });
      }

      const created = await tx.agentSession.create({
        data: {
          worldId: input.session.worldId,
          narrativeId: input.session.narrativeId ?? null,
          chapterId: input.session.chapterId ?? null,
          kind: input.session.kind,
          title: input.session.title,
          status: input.session.status ?? "active",
          current: input.session.current ?? false,
          metadata: (input.session.metadata ?? {}) as never,
        },
      });
      await tx.agentSessionSubject.create({
        data: {
          sessionId: created.id,
          kind: input.subject.kind,
          targetId: input.subject.targetId,
          role: input.subject.role ?? "primary",
          title: input.subject.title ?? null,
          metadata: (input.subject.metadata ?? {}) as never,
        },
      });
      for (const item of input.contextItems ?? []) {
        await tx.agentSessionContextItem.create({
          data: {
            sessionId: created.id,
            kind: item.kind,
            targetId: item.targetId,
            title: item.title ?? null,
            summary: item.summary ?? null,
            metadata: (item.metadata ?? {}) as never,
          },
        });
      }
      return mapSession(created);
    });
  }

  async findSessionById(id: string) {
    const session = await this.prisma.agentSession.findUnique({ where: { id } });
    return session ? mapSession(session) : null;
  }

  async findSessionForWorld(worldId: string, sessionId: string) {
    const session = await this.prisma.agentSession.findFirst({ where: { id: sessionId, worldId } });
    return session ? mapSession(session) : null;
  }

  async listSessions(worldId: string, query: Parameters<AgentSessionsRepository["listSessions"]>[1] = {}) {
    if (query.status === "archived" && !query.includeArchived) return { sessions: [], nextCursor: null };

    const where: Record<string, unknown> = { worldId };
    if (query.kind) where.kind = query.kind;
    if (query.current !== undefined) where.current = query.current;
    if (query.status) {
      where.status = query.status;
    } else if (!query.includeArchived) {
      where.status = { not: "archived" };
    }
    if (query.q?.trim()) {
      where.title = { contains: query.q.trim(), mode: "insensitive" };
    }
    if (query.cursor) {
      const cursor = decodeAgentSessionListCursor(query.cursor);
      where.OR = [
        { updatedAt: { lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
      ];
    }

    const limit = normalizeAgentSessionListLimit(query.limit);
    const sessions = await this.prisma.agentSession.findMany({
      where: where as never,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: limit + 1,
    });
    const page = sessions.slice(0, limit).map(mapSession);
    return {
      sessions: page,
      nextCursor: sessions.length > limit ? encodeAgentSessionListCursor(page[page.length - 1]) : null,
    };
  }

  async updateSession(id: string, input: Parameters<AgentSessionsRepository["updateSession"]>[1]) {
    const updated = await this.prisma.agentSession.updateMany({
      where: { id },
      data: input as never,
    });
    if (updated.count === 0) return null;
    return this.findSessionById(id);
  }

  async clearCurrentWorldExploration(worldId: string) {
    await this.prisma.agentSession.updateMany({
      where: { worldId, kind: "world_exploration", current: true },
      data: { current: false },
    });
  }

  async setCurrentWorldExploration(worldId: string, sessionId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const target = await tx.agentSession.findFirst({
          where: { id: sessionId, worldId, kind: "world_exploration", status: "active" },
        });
        if (!target) return null;

        await tx.agentSession.updateMany({
          where: { worldId, kind: "world_exploration", current: true },
          data: { current: false },
        });
        const updated = await tx.agentSession.updateMany({
          where: { id: sessionId, worldId, kind: "world_exploration", status: "active" },
          data: { current: true },
        });
        if (updated.count === 0) throw new CurrentWorldExplorationSwitchFailed();
        const session = await tx.agentSession.findUnique({ where: { id: sessionId } });
        return session ? mapSession(session) : null;
      });
    } catch (error) {
      if (error instanceof CurrentWorldExplorationSwitchFailed) return null;
      throw error;
    }
  }

  async createSubject(input: Parameters<AgentSessionsRepository["createSubject"]>[0]) {
    const created = await this.prisma.agentSessionSubject.create({
      data: {
        sessionId: input.sessionId,
        kind: input.kind,
        targetId: input.targetId,
        role: input.role ?? "primary",
        title: input.title ?? null,
        metadata: (input.metadata ?? {}) as never,
      },
    });
    return mapSubject(created);
  }

  async listSubjects(sessionId: string) {
    const subjects = await this.prisma.agentSessionSubject.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    return subjects.map(mapSubject);
  }

  async createContextItem(input: Parameters<AgentSessionsRepository["createContextItem"]>[0]) {
    const created = await this.prisma.agentSessionContextItem.create({
      data: {
        sessionId: input.sessionId,
        kind: input.kind,
        targetId: input.targetId,
        title: input.title ?? null,
        summary: input.summary ?? null,
        metadata: (input.metadata ?? {}) as never,
      },
    });
    return mapContextItem(created);
  }

  async listContextItems(sessionId: string) {
    const contextItems = await this.prisma.agentSessionContextItem.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    return contextItems.map(mapContextItem);
  }

  async appendMessage(input: Parameters<AgentSessionsRepository["appendMessage"]>[0]) {
    const created = await this.prisma.agentSessionMessage.create({
      data: {
        sessionId: input.sessionId,
        sequence: input.sequence,
        role: input.role,
        content: input.content,
        status: input.status ?? "complete",
        metadata: (input.metadata ?? {}) as never,
      },
    });
    return mapMessage(created);
  }

  async appendMessageAtEnd(input: Parameters<AgentSessionsRepository["appendMessageAtEnd"]>[0]) {
    for (let attempt = 1; attempt <= APPEND_MESSAGE_AT_END_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const latest = await tx.agentSessionMessage.findFirst({
            where: { sessionId: input.sessionId },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          const created = await tx.agentSessionMessage.create({
            data: {
              sessionId: input.sessionId,
              sequence: (latest?.sequence ?? 0) + 1,
              role: input.role,
              content: input.content,
              status: input.status ?? "complete",
              metadata: (input.metadata ?? {}) as never,
            },
          });
          return mapMessage(created);
        });
      } catch (error) {
        if (attempt < APPEND_MESSAGE_AT_END_MAX_ATTEMPTS && isUniqueConstraintError(error)) continue;
        throw error;
      }
    }
    throw new Error("Unable to append agent session message.");
  }

  async listMessages(sessionId: string) {
    const messages = await this.prisma.agentSessionMessage.findMany({
      where: { sessionId },
      orderBy: { sequence: "asc" },
    });
    return messages.map(mapMessage);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapSession(record: {
  id: string;
  worldId: string;
  narrativeId: string | null;
  chapterId: string | null;
  kind: string;
  title: string;
  status: string;
  current: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AgentSessionRecord {
  return {
    id: record.id,
    worldId: record.worldId,
    narrativeId: record.narrativeId,
    chapterId: record.chapterId,
    kind: parseSessionKind(record.kind),
    title: record.title,
    status: parseSessionStatus(record.status),
    current: record.current,
    metadata: parseMetadata(record.metadata),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapSubject(record: {
  id: string;
  sessionId: string;
  kind: string;
  targetId: string;
  role: string;
  title: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AgentSessionSubjectRecord {
  return {
    id: record.id,
    sessionId: record.sessionId,
    kind: parseSubjectKind(record.kind),
    targetId: record.targetId,
    role: parseSubjectRole(record.role),
    title: record.title,
    metadata: parseMetadata(record.metadata),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapContextItem(record: {
  id: string;
  sessionId: string;
  kind: string;
  targetId: string;
  title: string | null;
  summary: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AgentSessionContextItemRecord {
  return {
    id: record.id,
    sessionId: record.sessionId,
    kind: parseContextItemKind(record.kind),
    targetId: record.targetId,
    title: record.title,
    summary: record.summary,
    metadata: parseMetadata(record.metadata),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapMessage(record: {
  id: string;
  sessionId: string;
  sequence: number;
  role: string;
  content: string;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AgentSessionMessageRecord {
  return {
    id: record.id,
    sessionId: record.sessionId,
    sequence: record.sequence,
    role: parseMessageRole(record.role),
    content: record.content,
    status: parseMessageStatus(record.status),
    metadata: parseMetadata(record.metadata),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseSessionKind(value: string): AgentSessionKind {
  return parseEnum(value, sessionKinds, "AgentSession.kind");
}

function parseSessionStatus(value: string): AgentSessionStatus {
  return parseEnum(value, sessionStatuses, "AgentSession.status");
}

function parseSubjectKind(value: string): AgentSessionSubjectKind {
  return parseEnum(value, subjectKinds, "AgentSessionSubject.kind");
}

function parseSubjectRole(value: string): AgentSessionSubjectRole {
  return parseEnum(value, subjectRoles, "AgentSessionSubject.role");
}

function parseContextItemKind(value: string): AgentSessionContextItemKind {
  return parseEnum(value, contextItemKinds, "AgentSessionContextItem.kind");
}

function parseMessageRole(value: string): AgentSessionMessageRole {
  return parseEnum(value, messageRoles, "AgentSessionMessage.role");
}

function parseMessageStatus(value: string): AgentSessionMessageStatus {
  return parseEnum(value, messageStatuses, "AgentSessionMessage.status");
}

function parseEnum<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unknown ${field}: ${value}`);
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
