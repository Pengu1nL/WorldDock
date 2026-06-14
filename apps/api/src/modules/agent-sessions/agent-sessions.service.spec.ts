import { describe, expect, it } from "vitest";
import type { AgentSessionRecord, AgentSessionsRepository } from "./agent-sessions.repository";
import { AgentSessionsService } from "./agent-sessions.service";
import { PrismaAgentSessionsRepository } from "./prisma-agent-sessions.repository";

describe("AgentSessionsService", () => {
  it("creates a session and primary subject through the repository atomic method", async () => {
    const session = sessionRecord({ current: true });
    const calls: unknown[] = [];
    const repository = atomicRepository({
      async createSessionWithSubject(input: unknown) {
        calls.push(input);
        return session;
      },
      async createSession() {
        throw new Error("createSession should not be called directly");
      },
      async createSubject() {
        throw new Error("createSubject should not be called directly");
      },
      async clearCurrentWorldExploration() {
        throw new Error("clearCurrentWorldExploration should be part of the atomic create call");
      },
    });

    const result = await new AgentSessionsService(repository).createSession("world_1", {
      kind: "world_exploration",
      title: "记忆交易推演",
      current: true,
    });

    expect(result).toBe(session);
    expect(calls).toEqual([
      {
        session: {
          worldId: "world_1",
          kind: "world_exploration",
          title: "记忆交易推演",
          status: "active",
          current: true,
          metadata: {},
        },
        subject: {
          kind: "world",
          targetId: "world_1",
          role: "primary",
        },
        clearCurrentWorldExploration: true,
      },
    ]);
  });

  it("sets current through the repository atomic method", async () => {
    const session = sessionRecord({ current: true });
    const calls: unknown[] = [];
    const repository = atomicRepository({
      async findSessionForWorld() {
        return sessionRecord({ current: false });
      },
      async setCurrentWorldExploration(worldId: string, sessionId: string) {
        calls.push({ worldId, sessionId });
        return session;
      },
      async clearCurrentWorldExploration() {
        throw new Error("clearCurrentWorldExploration should be part of the atomic current call");
      },
      async updateSession() {
        throw new Error("updateSession should not be called directly");
      },
    });

    const result = await new AgentSessionsService(repository).setCurrentSession("world_1", "session_1");

    expect(result).toBe(session);
    expect(calls).toEqual([{ worldId: "world_1", sessionId: "session_1" }]);
  });
});

describe("PrismaAgentSessionsRepository", () => {
  it("does not clear the existing current session when switching to an invalid target", async () => {
    const sessions = new Map<string, AgentSessionRecord>([
      [
        "session_current",
        sessionRecord({
          id: "session_current",
          current: true,
        }),
      ],
      [
        "session_archived",
        sessionRecord({
          id: "session_archived",
          status: "archived",
          current: false,
        }),
      ],
    ]);
    const repository = new PrismaAgentSessionsRepository();
    Object.defineProperty(repository, "prisma", { value: fakePrismaClient(sessions) });

    const result = await repository.setCurrentWorldExploration("world_1", "session_archived");

    expect(result).toBeNull();
    expect(sessions.get("session_current")).toMatchObject({ current: true });
    expect(sessions.get("session_archived")).toMatchObject({ current: false });
  });

  it("rolls back the current clear when the target becomes invalid after validation", async () => {
    const sessions = new Map<string, AgentSessionRecord>([
      [
        "session_current",
        sessionRecord({
          id: "session_current",
          current: true,
        }),
      ],
      [
        "session_target",
        sessionRecord({
          id: "session_target",
          current: false,
        }),
      ],
    ]);
    const repository = new PrismaAgentSessionsRepository();
    Object.defineProperty(repository, "prisma", {
      value: fakePrismaClient(sessions, { archiveTargetAfterCurrentClear: "session_target" }),
    });

    const result = await repository.setCurrentWorldExploration("world_1", "session_target");

    expect(result).toBeNull();
    expect(sessions.get("session_current")).toMatchObject({ current: true });
    expect(sessions.get("session_target")).toMatchObject({ status: "active", current: false });
  });
});

function atomicRepository(overrides: Partial<AgentSessionsRepository> & Record<string, unknown>) {
  return {
    createSession: async () => sessionRecord({}),
    findSessionById: async () => null,
    findSessionForWorld: async () => null,
    listSessions: async () => ({ sessions: [], nextCursor: null }),
    updateSession: async () => null,
    clearCurrentWorldExploration: async () => {},
    createSubject: async () => subjectRecord(),
    listSubjects: async () => [],
    createContextItem: async () => contextItemRecord(),
    listContextItems: async () => [],
    appendMessage: async () => messageRecord(),
    listMessages: async () => [],
    ...overrides,
  } as AgentSessionsRepository;
}

function sessionRecord(overrides: Partial<AgentSessionRecord>): AgentSessionRecord {
  return {
    id: "session_1",
    worldId: "world_1",
    kind: "world_exploration",
    title: "记忆交易推演",
    status: "active",
    current: false,
    metadata: {},
    createdAt: new Date("2026-06-15T00:00:00.000Z"),
    updatedAt: new Date("2026-06-15T00:00:00.000Z"),
    ...overrides,
  };
}

function subjectRecord() {
  const timestamp = new Date("2026-06-15T00:00:00.000Z");
  return {
    id: "subject_1",
    sessionId: "session_1",
    kind: "world" as const,
    targetId: "world_1",
    role: "primary" as const,
    title: null,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function contextItemRecord() {
  const timestamp = new Date("2026-06-15T00:00:00.000Z");
  return {
    id: "context_1",
    sessionId: "session_1",
    kind: "asset_index" as const,
    targetId: "asset_1",
    title: null,
    summary: null,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function messageRecord() {
  const timestamp = new Date("2026-06-15T00:00:00.000Z");
  return {
    id: "message_1",
    sessionId: "session_1",
    sequence: 1,
    role: "user" as const,
    content: "hello",
    status: "complete" as const,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

type FakePrismaOptions = {
  archiveTargetAfterCurrentClear?: string;
};

function fakePrismaClient(sessions: Map<string, AgentSessionRecord>, options: FakePrismaOptions = {}) {
  const tx = {
    agentSession: {
      async findFirst(input: { where: Partial<AgentSessionRecord> }) {
        return [...sessions.values()].find((session) => matchesWhere(session, input.where)) ?? null;
      },
      async findUnique(input: { where: Pick<AgentSessionRecord, "id"> }) {
        return sessions.get(input.where.id) ?? null;
      },
      async updateMany(input: { where: Partial<AgentSessionRecord>; data: Partial<AgentSessionRecord> }) {
        let count = 0;
        for (const [id, session] of sessions) {
          if (!matchesWhere(session, input.where)) continue;
          sessions.set(id, { ...session, ...input.data });
          count++;
        }
        if (
          options.archiveTargetAfterCurrentClear &&
          input.where.kind === "world_exploration" &&
          input.where.current === true &&
          input.data.current === false
        ) {
          const target = sessions.get(options.archiveTargetAfterCurrentClear);
          if (target) sessions.set(target.id, { ...target, status: "archived" });
        }
        return { count };
      },
    },
  };

  return {
    async $transaction<T>(callback: (client: typeof tx) => Promise<T>) {
      const snapshot = cloneSessions(sessions);
      try {
        return await callback(tx);
      } catch (error) {
        restoreSessions(sessions, snapshot);
        throw error;
      }
    },
    async $disconnect() {},
  };
}

function matchesWhere(session: AgentSessionRecord, where: Partial<AgentSessionRecord>) {
  return Object.entries(where).every(([key, value]) => session[key as keyof AgentSessionRecord] === value);
}

function cloneSessions(sessions: Map<string, AgentSessionRecord>) {
  return new Map([...sessions.entries()].map(([id, session]) => [id, { ...session }]));
}

function restoreSessions(sessions: Map<string, AgentSessionRecord>, snapshot: Map<string, AgentSessionRecord>) {
  sessions.clear();
  for (const [id, session] of snapshot) {
    sessions.set(id, session);
  }
}
