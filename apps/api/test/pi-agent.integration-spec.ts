import type { PiRuntimeEvent } from "@worlddock/domain/agent/pi";
import { describe, expect, it, vi } from "vitest";
import { PiAgentProvider } from "../src/modules/agent/agent.provider";
import { PiSessionRunner } from "../src/modules/agent/pi/pi-session-runner";
import type { PiRuntimeClient } from "../src/modules/agent/pi/pi-runtime.client";
import { SafetyGate } from "../src/modules/agent/pi/safety-gate";
import { createWorldToolRegistry } from "../src/modules/agent/pi/world-tools";
import { WorldToolRegistry, describeWorldTools } from "../src/modules/agent/pi/world-tool-registry";
import type { WorldRepository } from "../src/modules/worlds/world.repository";

describe("pi agent runtime boundary", () => {
  it("turns pi tool requests into completed tool events and context disclosure", async () => {
    const runtime: PiRuntimeClient = {
      async *runSession(_input, executeTool) {
        const toolCall = {
          id: "call_1",
          name: "search_world_assets" as const,
          arguments: { worldId: "world_1", query: "记忆" },
        };
        yield { type: "tool.requested", toolCall };
        const executed = await executeTool?.(toolCall);
        yield { type: "tool.completed", toolCallId: toolCall.id, result: executed?.result ?? {} };
        for (const contextEvent of executed?.contextEvents ?? []) yield contextEvent;
        yield { type: "session.completed" };
      },
    };
    const registry = new WorldToolRegistry();
    registry.register("search_world_assets", async () => ({
      cards: [{ kind: "setting", title: "《记忆交易法》", excerpt: "交易制度。", targetId: "asset_1" }],
    }));
    const runner = new PiSessionRunner(runtime, registry, new SafetyGate());

    const events = [];
    for await (const event of runner.run({
      runId: "run_1",
      userId: "user_1",
      worldId: "world_1",
      mode: "expand",
      prompt: "继续推演",
      context: [],
      tools: [...describeWorldTools()],
      skills: [],
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(["tool.requested", "tool.completed", "context.used", "session.completed"]);
    expect(events[2]).toMatchObject({ type: "context.used", source: "tool", targetId: "asset_1" });
  });

  it("turns proposal tool results into pending suggestions without writing product assets", async () => {
    const worlds: WorldRepository = {
      createWorld: vi.fn(async () => {
        throw new Error("createWorld should not be called by proposal tools.");
      }),
      listWorlds: vi.fn(async () => []),
      findWorldById: vi.fn(async () => null),
      updateWorld: vi.fn(async () => {
        throw new Error("updateWorld should not be called by proposal tools.");
      }),
      deleteWorld: vi.fn(async () => {
        throw new Error("deleteWorld should not be called by proposal tools.");
      }),
      duplicateWorldAssets: vi.fn(async () => {
        throw new Error("duplicateWorldAssets should not be called by proposal tools.");
      }),
      listArchiveEntries: vi.fn(async () => []),
      createArchiveEntry: vi.fn(async () => {
        throw new Error("createArchiveEntry should not be called by proposal tools.");
      }),
      listStorySeeds: vi.fn(async () => []),
      createStorySeed: vi.fn(async () => {
        throw new Error("createStorySeed should not be called by proposal tools.");
      }),
      listConflicts: vi.fn(async () => []),
      createConflict: vi.fn(async () => {
        throw new Error("createConflict should not be called by proposal tools.");
      }),
      countAssets: vi.fn(async () => ({ archive: 0, seeds: 0, conflicts: 0 })),
    };
    const expectedSuggestion = {
      id: "setting_license",
      kind: "setting",
      category: "制度",
      title: "记忆交易许可",
      summary: "记忆交易必须经过许可。",
      body: "未经许可的记忆交易会被城市信用系统追踪。",
    };
    const runtime: PiRuntimeClient = {
      async *runSession(_input, executeTool) {
        const toolCall = {
          id: "call_propose_1",
          name: "propose_setting" as const,
          arguments: {
            id: expectedSuggestion.id,
            title: "记忆交易许可",
            category: "制度",
            summary: "记忆交易必须经过许可。",
            body: "未经许可的记忆交易会被城市信用系统追踪。",
          },
        };
        yield { type: "tool.requested", toolCall };
        const executed = await executeTool?.(toolCall);
        yield { type: "tool.completed", toolCallId: toolCall.id, result: executed?.result ?? {} };
        const suggestion = executed?.result.suggestion;
        if (suggestion) yield { type: "suggestion.created", suggestion };
        yield { type: "session.completed" };
      },
    };
    const registry = createWorldToolRegistry(worlds);
    const runner = new PiSessionRunner(runtime, registry, new SafetyGate());

    const events: PiRuntimeEvent[] = [];
    for await (const event of runner.run({
      runId: "run_1",
      userId: "user_1",
      worldId: "world_1",
      mode: "expand",
      prompt: "生成制度建议",
      context: [],
      tools: [...describeWorldTools()],
      skills: [],
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(["tool.requested", "tool.completed", "suggestion.created", "session.completed"]);
    expect(events.filter((event) => event.type === "context.used")).toHaveLength(0);
    expect(events.filter((event) => event.type === "suggestion.created")).toHaveLength(1);

    const completed = events[1];
    const suggestionCreated = events[2];
    expect(completed).toMatchObject({ type: "tool.completed", toolCallId: "call_propose_1" });
    expect(suggestionCreated).toMatchObject({ type: "suggestion.created" });
    if (completed.type !== "tool.completed" || suggestionCreated.type !== "suggestion.created") {
      throw new Error("Unexpected proposal tool event sequence.");
    }
    expect(completed.result.suggestion).toEqual(expectedSuggestion);
    expect(suggestionCreated.suggestion).toEqual(completed.result.suggestion);

    expect(worlds.createWorld).not.toHaveBeenCalled();
    expect(worlds.updateWorld).not.toHaveBeenCalled();
    expect(worlds.deleteWorld).not.toHaveBeenCalled();
    expect(worlds.duplicateWorldAssets).not.toHaveBeenCalled();
    expect(worlds.createArchiveEntry).not.toHaveBeenCalled();
    expect(worlds.createStorySeed).not.toHaveBeenCalled();
    expect(worlds.createConflict).not.toHaveBeenCalled();
  });

  it("exposes pi as an AgentProvider without direct product writes", async () => {
    const provider = new PiAgentProvider();
    const chunks = [];
    for await (const chunk of provider.stream({
      runId: "run_1",
      userId: "user_1",
      prompt: "继续推演记忆交易",
      mode: "expand",
      world: { id: "world_1", name: "回忆所", summary: "记忆可以被买卖。" },
    })) {
      chunks.push(chunk);
    }

    expect(chunks.map((chunk) => chunk.type)).toContain("context");
    expect(chunks.map((chunk) => chunk.type)).toContain("suggestion");
    expect(chunks.map((chunk) => chunk.type)).toContain("usage");
  });
});
