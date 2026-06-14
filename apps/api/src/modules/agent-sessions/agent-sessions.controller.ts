import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import {
  type AgentSessionContextItemRecord,
  type AgentSessionMessageRecord,
  type AgentSessionRecord,
  type AgentSessionSubjectRecord,
} from "./agent-sessions.repository";
import { AgentSessionsService } from "./agent-sessions.service";

const sessionKindSchema = z.enum(["world_exploration", "asset_edit", "consistency_repair"]);
const sessionStatusSchema = z.enum(["active", "archived", "completed", "cancelled"]);

const baseCreateSessionSchema = z.object({
  title: z.string().trim().min(1).optional(),
  current: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const createSessionSchema = z.discriminatedUnion("kind", [
  baseCreateSessionSchema.extend({ kind: z.literal("world_exploration") }),
  baseCreateSessionSchema.extend({
    kind: z.literal("asset_edit"),
    subjectAssetId: z.string().trim().min(1),
  }),
  baseCreateSessionSchema.extend({
    kind: z.literal("consistency_repair"),
    issueId: z.string().trim().min(1),
  }),
]);

const queryBooleanSchema = z.union([
  z.boolean(),
  z.literal("true").transform(() => true),
  z.literal("false").transform(() => false),
]);
const includeArchivedQuerySchema = z.union([
  z.boolean(),
  z.literal("1"),
  z.literal("true"),
  z.literal("0"),
  z.literal("false"),
]).transform((value) => value === true || value === "1" || value === "true");

const listSessionsQuerySchema = z.object({
  kind: sessionKindSchema.optional(),
  status: sessionStatusSchema.optional(),
  current: queryBooleanSchema.optional(),
  includeArchived: includeArchivedQuerySchema.optional(),
  q: z.string().trim().optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).default(20),
});

@Controller("worlds/:worldId/agent-sessions")
export class AgentSessionsController {
  constructor(
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(AgentSessionsService) private readonly agentSessions: AgentSessionsService,
  ) {}

  @Post()
  async create(@Param("worldId") worldId: string, @Body() body: unknown) {
    await this.requireWorld(worldId);
    const session = await this.agentSessions.createSession(worldId, createSessionSchema.parse(body));
    return { session: serializeSession(session) };
  }

  @Get()
  async list(@Param("worldId") worldId: string, @Query() query: unknown) {
    await this.requireWorld(worldId);
    const { sessions, nextCursor } = await this.agentSessions.listSessions(worldId, listSessionsQuerySchema.parse(query));
    return { sessions: sessions.map(serializeSession), nextCursor };
  }

  @Get(":sessionId")
  async detail(@Param("worldId") worldId: string, @Param("sessionId") sessionId: string) {
    await this.requireWorld(worldId);
    return serializeSessionDetail(await this.agentSessions.getSessionDetail(worldId, sessionId));
  }

  @Post(":sessionId/archive")
  @HttpCode(200)
  async archive(@Param("worldId") worldId: string, @Param("sessionId") sessionId: string) {
    await this.requireWorld(worldId);
    return { session: serializeSession(await this.agentSessions.archiveSession(worldId, sessionId)) };
  }

  @Post(":sessionId/current")
  @HttpCode(200)
  async setCurrent(@Param("worldId") worldId: string, @Param("sessionId") sessionId: string) {
    await this.requireWorld(worldId);
    return { session: serializeSession(await this.agentSessions.setCurrentSession(worldId, sessionId)) };
  }

  private async requireWorld(worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound();
    return world;
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "Agent session not found.",
    });
  }
}

function serializeSession(record: AgentSessionRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeSessionDetail(detail: {
  session: AgentSessionRecord;
  subjects: AgentSessionSubjectRecord[];
  contextItems: AgentSessionContextItemRecord[];
  messages: AgentSessionMessageRecord[];
}) {
  return {
    session: serializeSession(detail.session),
    subjects: detail.subjects.map(serializeSubject),
    contextItems: detail.contextItems.map(serializeContextItem),
    messages: detail.messages.map(serializeMessage),
  };
}

function serializeSubject(record: AgentSessionSubjectRecord) {
  return {
    id: record.id,
    sessionId: record.sessionId,
    subjectKind: record.kind,
    subjectId: record.targetId,
    role: record.role,
    title: record.title,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeContextItem(record: AgentSessionContextItemRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeMessage(record: AgentSessionMessageRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
