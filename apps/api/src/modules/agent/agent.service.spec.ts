import { describe, expect, it } from "vitest";
import type { TokenUsage } from "@worlddock/domain";
import type { AgentProvider, AgentProviderInput } from "./agent.provider";
import { AgentService } from "./agent.service";
import type { AgentEventRecord, AgentRepository, AgentRunRecord } from "./agent.repository";
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
      provider: "mock",
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
      provider: "mock",
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
      provider: "mock",
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
