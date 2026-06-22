import { describe, expect, it } from "vitest";
import type { TokenUsage } from "@worlddock/domain";
import type { AgentProvider, AgentProviderInput } from "./agent.provider";
import { AgentService } from "./agent.service";
import type { AgentEventRecord, AgentRepository, AgentRunRecord } from "./agent.repository";
import type { AgentSessionMessageRecord, AgentSessionRecord, AgentSessionsRepository } from "../agent-sessions/agent-sessions.repository";
import type { WorldRecord, WorldRepository } from "../worlds/world.repository";

describe("AgentService cancellation", () => {
  it("persists latest usage, aborts provider, and emits run.cancelled to the active stream", async () => {
    const usage: TokenUsage = { inputTokens: 11, outputTokens: 7, totalTokens: 18 };
    const usagePersisted = deferred<void>();
    const releaseProvider = deferred<void>();
    const provider = new PausingProvider(usage, releaseProvider);
    const now = new Date();
    let run: AgentRunRecord = {
      id: "run_1",
      worldId: "world_1",
      status: "running",
      mode: "expand",
      prompt: "继续推演",
      model: "test-model",
      provider: "pi",
      createdAt: now,
      updatedAt: now,
    };
    const events: AgentEventRecord[] = [];
    const agents = createAgentRepository({
      getRun: () => run,
      setRun: (input) => {
        run = { ...run, ...input, updatedAt: new Date() };
        if (input.tokenUsage) usagePersisted.resolve();
        return run;
      },
      events,
    });
    const worlds = createWorldRepository();
    const service = new AgentService(agents, provider, worlds);
    const iterator = service.streamEvents(run.id);
    const nextEvent = iterator.next();

    await usagePersisted.promise;
    await service.cancelRun(run.id);

    const result = await nextEvent;
    expect(result.done).toBe(false);
    if (result.done) throw new Error("Expected run.cancelled event.");
    expect(result.value.type).toBe("run.cancelled");
    expect(provider.aborted).toBe(true);
    expect(run.tokenUsage).toEqual(usage);
    expect(events.map((event) => event.type)).toEqual(["run.cancelled"]);
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it("emits run.cancelled without waiting for a pending provider chunk", async () => {
    const provider = new PendingProvider();
    const now = new Date();
    let run: AgentRunRecord = {
      id: "run_1",
      worldId: "world_1",
      status: "running",
      mode: "expand",
      prompt: "继续推演",
      model: "test-model",
      provider: "pi",
      createdAt: now,
      updatedAt: now,
    };
    const events: AgentEventRecord[] = [];
    const agents = createAgentRepository({
      getRun: () => run,
      setRun: (input) => {
        run = { ...run, ...input, updatedAt: new Date() };
        return run;
      },
      events,
    });
    const service = new AgentService(agents, provider, createWorldRepository());
    const iterator = service.streamEvents(run.id);
    const nextEvent = iterator.next();

    await provider.started.promise;
    await service.cancelRun(run.id);

    const result = await withTimeout(nextEvent, 100);
    expect(result.done).toBe(false);
    if (result.done) throw new Error("Expected run.cancelled event.");
    expect(result.value.type).toBe("run.cancelled");
    expect(provider.aborted).toBe(true);
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it("emits run.cancelled when cancelled during context preparation", async () => {
    const provider = new PendingProvider();
    const contextStarted = deferred<void>();
    const releaseContext = deferred<void>();
    const now = new Date();
    let run: AgentRunRecord = {
      id: "run_1",
      worldId: "world_1",
      status: "running",
      mode: "expand",
      prompt: "继续推演",
      model: "test-model",
      provider: "pi",
      createdAt: now,
      updatedAt: now,
    };
    const events: AgentEventRecord[] = [];
    const agents = createAgentRepository({
      getRun: () => run,
      setRun: (input) => {
        run = { ...run, ...input, updatedAt: new Date() };
        return run;
      },
      events,
    });
    const service = new AgentService(agents, provider, createWorldRepository({ contextStarted, releaseContext }));
    const iterator = service.streamEvents(run.id);
    const nextEvent = iterator.next();

    await contextStarted.promise;
    await service.cancelRun(run.id);
    expect(provider.startedCalled).toBe(false);
    releaseContext.resolve();

    const result = await withTimeout(nextEvent, 100);
    expect(result.done).toBe(false);
    if (result.done) throw new Error("Expected run.cancelled event.");
    expect(result.value.type).toBe("run.cancelled");
    expect(provider.startedCalled).toBe(false);
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });
});

describe("AgentService session asset deposition", () => {
  it("keeps asset deposition intent when the user confirms a drafted formal asset", async () => {
    const now = new Date();
    let run: AgentRunRecord = {
      id: "run_confirm",
      worldId: "world_1",
      sessionId: "session_1",
      status: "running",
      mode: "expand",
      prompt: "确认",
      model: "test-model",
      provider: "pi",
      createdAt: now,
      updatedAt: now,
    };
    const events: AgentEventRecord[] = [];
    const agents = createAgentRepository({
      getRun: () => run,
      setRun: (input) => {
        run = { ...run, ...input, updatedAt: new Date() };
        return run;
      },
      events,
    });
    const provider = new CapturingProvider();
    const sessions = createAgentSessionsRepository({
      session: createAgentSession({ id: "session_1", worldId: "world_1", kind: "world_exploration" }),
      messages: [
        createAgentSessionMessage(1, "user", "沉淀势力资产：太空农业基因安全联合委员会"),
        createAgentSessionMessage(
          2,
          "assistant",
          [
            "按照设定要求，我先输出待创建资产的完整内容供确认：",
            "类型：势力",
            "名称：太空农业基因安全联合委员会（SAGSC）",
            "摘要：由地球航天大国、大型太空企业和联合国粮农组织共同组成的跨国监管机构。",
          ].join("\n"),
        ),
        createAgentSessionMessage(3, "user", "确认"),
      ],
    });
    const service = new AgentService(agents, provider, createWorldRepository(), sessions);

    for await (const _event of service.streamSessionRunEvents(run.id)) {
      // Exhaust the generator so provider input is captured and the run completes.
    }

    expect(provider.input?.policy).toEqual({ kind: "world_exploration", intent: "asset_deposition" });
    expect(provider.input?.tools?.map((tool) => tool.name)).toContain("create_world_asset");
    expect(provider.input?.tools?.map((tool) => tool.name)).not.toContain("propose_setting");
    expect(provider.input?.skills?.map((skill) => skill.name)).toEqual(["asset-deposition"]);
    expect(provider.input?.prompt).toContain("当前用户明确要求沉淀一个正式世界资产。");
    expect(provider.input?.prompt).toContain("当前指令：确认");
    expect(provider.input?.prompt).toContain("太空农业基因安全联合委员会");
  });
});

class PausingProvider implements AgentProvider {
  aborted = false;

  constructor(
    private readonly usage: TokenUsage,
    private readonly release: Deferred<void>,
  ) {}

  async *stream(input: AgentProviderInput) {
    input.signal?.addEventListener("abort", () => {
      this.aborted = true;
      this.release.resolve();
    }, { once: true });

    yield { type: "usage" as const, tokenUsage: this.usage };
    await this.release.promise;
    if (input.signal?.aborted) return;
    yield { type: "delta" as const, text: "late chunk" };
  }
}

class PendingProvider implements AgentProvider {
  readonly started = deferred<void>();
  aborted = false;
  startedCalled = false;

  async *stream(input: AgentProviderInput): AsyncIterable<never> {
    input.signal?.addEventListener("abort", () => {
      this.aborted = true;
    }, { once: true });
    this.startedCalled = true;
    this.started.resolve();
    await new Promise<never>(() => {});
  }
}

class CapturingProvider implements AgentProvider {
  input?: AgentProviderInput;

  async *stream(input: AgentProviderInput) {
    this.input = input;
    yield { type: "delta" as const, text: "ok" };
  }
}

function createAgentRepository(input: {
  getRun: () => AgentRunRecord;
  setRun: (input: Partial<AgentRunRecord>) => AgentRunRecord;
  events: AgentEventRecord[];
}): AgentRepository {
  return {
    async createRun() {
      return input.getRun();
    },
    async findRunById(id) {
      return input.getRun().id === id ? input.getRun() : null;
    },
    async updateRun(id, update) {
      return input.getRun().id === id ? input.setRun(update) : null;
    },
    async updateRunIfStatus(id, status, update) {
      const run = input.getRun();
      if (run.id !== id || run.status !== status) return null;
      return input.setRun(update);
    },
    async appendEvent(event) {
      const created: AgentEventRecord = {
        ...event,
        id: `evt_${input.events.length + 1}`,
        createdAt: new Date(),
      };
      input.events.push(created);
      return created;
    },
    async listEvents(runId) {
      return input.events.filter((event) => event.runId === runId);
    },
    async createContextRef(contextRef) {
      return { ...contextRef, id: "ctx_1" };
    },
    async createSuggestion(suggestion) {
      return { ...suggestion, id: "sug_1", status: "pending", savedAssetId: null };
    },
    async listSuggestions() {
      return [];
    },
    async findSuggestionById() {
      return null;
    },
    async updateSuggestion() {
      return null;
    },
  };
}

function createAgentSession(input: Partial<AgentSessionRecord> = {}): AgentSessionRecord {
  const now = new Date();
  return {
    id: "session_1",
    worldId: "world_1",
    narrativeId: null,
    chapterId: null,
    kind: "world_exploration",
    title: "测试世界 推演",
    status: "active",
    current: true,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function createAgentSessionMessage(
  sequence: number,
  role: AgentSessionMessageRecord["role"],
  content: string,
): AgentSessionMessageRecord {
  const now = new Date();
  return {
    id: `message_${sequence}`,
    sessionId: "session_1",
    sequence,
    role,
    content,
    status: "complete",
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function createAgentSessionsRepository(input: {
  session: AgentSessionRecord;
  messages: AgentSessionMessageRecord[];
}): AgentSessionsRepository {
  return {
    async createSession() {
      throw new Error("Not used in this test.");
    },
    async createSessionWithSubject() {
      throw new Error("Not used in this test.");
    },
    async findSessionById(id) {
      return input.session.id === id ? input.session : null;
    },
    async findSessionForWorld(worldId, sessionId) {
      return input.session.worldId === worldId && input.session.id === sessionId ? input.session : null;
    },
    async listSessions() {
      return { sessions: [input.session], nextCursor: null };
    },
    async updateSession() {
      return input.session;
    },
    async clearCurrentWorldExploration() {},
    async setCurrentWorldExploration() {
      return input.session;
    },
    async createSubject() {
      throw new Error("Not used in this test.");
    },
    async listSubjects() {
      return [];
    },
    async createContextItem(contextItem) {
      const now = new Date();
      return {
        id: "context_1",
        sessionId: contextItem.sessionId,
        kind: contextItem.kind,
        targetId: contextItem.targetId,
        title: contextItem.title ?? null,
        summary: contextItem.summary ?? null,
        metadata: contextItem.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      };
    },
    async listContextItems() {
      return [];
    },
    async appendMessage(message) {
      const created = createAgentSessionMessage(message.sequence, message.role, message.content);
      input.messages.push({ ...created, status: message.status ?? "complete", metadata: message.metadata ?? {} });
      return input.messages[input.messages.length - 1];
    },
    async appendMessageAtEnd(message) {
      const nextSequence = Math.max(0, ...input.messages.map((item) => item.sequence)) + 1;
      const created = createAgentSessionMessage(nextSequence, message.role, message.content);
      input.messages.push({ ...created, status: message.status ?? "complete", metadata: message.metadata ?? {} });
      return input.messages[input.messages.length - 1];
    },
    async listMessages() {
      return input.messages;
    },
  };
}

function createWorldRepository(options: { contextStarted?: Deferred<void>; releaseContext?: Deferred<void> } = {}): WorldRepository {
  const now = new Date();
  const world: WorldRecord = {
    id: "world_1",
    name: "测试世界",
    type: "测试",
    summary: "用于测试取消逻辑。",
    tags: [],
    status: "draft",
    visibility: "private",
    mode: "local",
    maturity: 0,
    createdAt: now,
    updatedAt: now,
  };

  return {
    async createWorld() {
      return world;
    },
    async listWorlds() {
      return [world];
    },
    async findWorldById(id) {
      return id === world.id ? world : null;
    },
    async updateWorld() {
      return world;
    },
    async deleteWorld() {
      return world;
    },
    async duplicateWorldAssets() {},
    async listArchiveEntries() {
      return [];
    },
    async createArchiveEntry() {
      throw new Error("Not used in this test.");
    },
    async listStorySeeds() {
      return [];
    },
    async createStorySeed() {
      throw new Error("Not used in this test.");
    },
    async listConflicts() {
      return [];
    },
    async createConflict() {
      throw new Error("Not used in this test.");
    },
    async listAssetRelations() {
      return [];
    },
    async countAssets() {
      options.contextStarted?.resolve();
      await options.releaseContext?.promise;
      return { archive: 0, seeds: 0, conflicts: 0 };
    },
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms.`)), ms);
    }),
  ]);
}
