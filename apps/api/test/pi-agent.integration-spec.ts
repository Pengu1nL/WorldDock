import { describe, expect, it } from "vitest";
import { PiAgentProvider } from "../src/modules/agent/agent.provider";
import { PiSessionRunner } from "../src/modules/agent/pi/pi-session-runner";
import type { PiRuntimeClient } from "../src/modules/agent/pi/pi-runtime.client";
import { SafetyGate } from "../src/modules/agent/pi/safety-gate";
import { WorldToolRegistry, describeWorldTools } from "../src/modules/agent/pi/world-tool-registry";

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
