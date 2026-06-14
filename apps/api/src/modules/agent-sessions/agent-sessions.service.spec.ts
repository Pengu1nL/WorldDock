import { describe, expect, it } from "vitest";
import type { AgentSessionRecord, AgentSessionsRepository } from "./agent-sessions.repository";
import { AgentSessionsService } from "./agent-sessions.service";

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

function atomicRepository(overrides: Partial<AgentSessionsRepository> & Record<string, unknown>) {
  return {
    createSession: async () => sessionRecord({}),
    findSessionById: async () => null,
    findSessionForWorld: async () => null,
    listSessions: async () => [],
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
