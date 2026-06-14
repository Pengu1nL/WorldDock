import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AGENT_SESSIONS_REPOSITORY,
  type AgentSessionRecord,
  type AgentSessionsRepository,
} from "./agent-sessions.repository";

type CreateAgentSessionInput =
  | {
    kind: "world_exploration";
    title?: string;
    current?: boolean;
    metadata?: Record<string, unknown>;
  }
  | {
    kind: "asset_edit";
    title?: string;
    subjectAssetId: string;
    current?: boolean;
    metadata?: Record<string, unknown>;
  }
  | {
    kind: "consistency_repair";
    title?: string;
    issueId: string;
    current?: boolean;
    metadata?: Record<string, unknown>;
  };

type ListAgentSessionsInput = Parameters<AgentSessionsRepository["listSessions"]>[1];

@Injectable()
export class AgentSessionsService {
  constructor(@Inject(AGENT_SESSIONS_REPOSITORY) private readonly sessions: AgentSessionsRepository) {}

  async createSession(worldId: string, input: CreateAgentSessionInput) {
    const current = input.kind === "world_exploration" && input.current === true;

    return this.sessions.createSessionWithSubject({
      session: {
        worldId,
        kind: input.kind,
        title: input.title ?? defaultTitleForKind(input.kind),
        status: "active",
        current,
        metadata: input.metadata ?? {},
      },
      subject: primarySubjectFor(worldId, input),
      clearCurrentWorldExploration: current,
    });
  }

  async listSessions(worldId: string, query?: ListAgentSessionsInput) {
    return this.sessions.listSessions(worldId, query);
  }

  async getSessionDetail(worldId: string, sessionId: string) {
    const session = await this.sessions.findSessionForWorld(worldId, sessionId);
    if (!session) throw this.notFound();

    const [subjects, contextItems, messages] = await Promise.all([
      this.sessions.listSubjects(session.id),
      this.sessions.listContextItems(session.id),
      this.sessions.listMessages(session.id),
    ]);

    return { session, subjects, contextItems, messages };
  }

  async archiveSession(worldId: string, sessionId: string) {
    await this.requireSession(worldId, sessionId);
    const session = await this.sessions.updateSession(sessionId, { status: "archived", current: false });
    if (!session) throw this.notFound();
    return session;
  }

  async setCurrentSession(worldId: string, sessionId: string) {
    const existing = await this.requireSession(worldId, sessionId);
    if (existing.kind !== "world_exploration") {
      throw new BadRequestException({
        code: "BAD_REQUEST",
        message: "Only world exploration sessions can be current.",
      });
    }
    if (existing.status !== "active") {
      throw new BadRequestException({
        code: "BAD_REQUEST",
        message: "Only active world exploration sessions can be current.",
      });
    }

    const session = await this.sessions.setCurrentWorldExploration(worldId, sessionId);
    if (!session) throw this.notFound();
    return session;
  }

  private async requireSession(worldId: string, sessionId: string): Promise<AgentSessionRecord> {
    const session = await this.sessions.findSessionForWorld(worldId, sessionId);
    if (!session) throw this.notFound();
    return session;
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "Agent session not found.",
    });
  }
}

function primarySubjectFor(worldId: string, input: CreateAgentSessionInput) {
  if (input.kind === "asset_edit") {
    return {
      kind: "asset" as const,
      targetId: input.subjectAssetId,
      role: "primary" as const,
    };
  }

  if (input.kind === "consistency_repair") {
    return {
      kind: "consistency_issue" as const,
      targetId: input.issueId,
      role: "primary" as const,
    };
  }

  return {
    kind: "world" as const,
    targetId: worldId,
    role: "primary" as const,
  };
}

function defaultTitleForKind(kind: CreateAgentSessionInput["kind"]) {
  if (kind === "asset_edit") return "Asset edit";
  if (kind === "consistency_repair") return "Consistency repair";
  return "World exploration";
}
