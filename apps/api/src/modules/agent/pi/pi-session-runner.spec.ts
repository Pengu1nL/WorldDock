import type { PiRuntimeEvent, PiToolCall } from "@worlddock/domain/agent/pi";
import { describe, expect, it } from "vitest";
import type { PiRuntimeClient, PiSessionInput } from "./pi-runtime.client";
import { PiSessionRunner } from "./pi-session-runner";
import { SafetyGate } from "./safety-gate";
import { createWorldToolRegistry } from "./world-tools";
import { WorldToolRegistry } from "./world-tool-registry";

const BASE_INPUT: PiSessionInput = {
  runId: "run_1",
  worldId: "world_1",
  prompt: "沉淀这个设定",
  context: [],
  policy: { kind: "world_exploration", intent: "asset_deposition" },
  tools: [],
  skills: [],
};

describe("PiSessionRunner", () => {
  it("blocks world-scoped tool calls for a different world before execution", async () => {
    let executed = false;
    const runner = createRunner({
      id: "tool_1",
      name: "create_world_asset",
      arguments: { worldId: "world_2", type: "rule", name: "记忆交易许可" },
    }, async () => {
      executed = true;
      return { assetId: "official_asset_1" };
    });

    await expect(collect(runner.run(BASE_INPUT))).rejects.toThrow(/Blocked cross-world pi tool/);
    expect(executed).toBe(false);
  });

  it("executes world-scoped tool calls for the current session world", async () => {
    let executedArguments: Record<string, unknown> | undefined;
    const runner = createRunner({
      id: "tool_1",
      name: "create_world_asset",
      arguments: { worldId: "world_1", type: "rule", name: "记忆交易许可" },
    }, async (arguments_) => {
      executedArguments = arguments_;
      return { assetId: "official_asset_1" };
    });

    const events = await collect(runner.run(BASE_INPUT));

    expect(executedArguments).toEqual(expect.objectContaining({ worldId: "world_1" }));
    expect(events).toEqual([{
      type: "tool.completed",
      toolCallId: "tool_1",
      result: { assetId: "official_asset_1" },
    }]);
  });

  it("allows pending suggestion tools without a worldId argument in default exploration", async () => {
    let executed = false;
    const runner = createRunner({
      id: "tool_1",
      name: "propose_setting",
      arguments: {
        title: "记忆交易许可",
        category: "世界规则",
        categoryReason: "主语是交易制度本身。",
        body: "所有记忆交易都需要登记。",
      },
    }, async () => {
      executed = true;
      return { suggestionId: "pending_setting_1" };
    });

    const events = await collect(runner.run({
      ...BASE_INPUT,
      policy: { kind: "world_exploration" },
    }));

    expect(executed).toBe(true);
    expect(events).toEqual([{
      type: "tool.completed",
      toolCallId: "tool_1",
      result: { suggestionId: "pending_setting_1" },
    }]);
  });

  it("emits consistency issue created events from create_consistency_issue tool results", async () => {
    const createdIssue = {
      id: "issue_1",
      worldId: "world_1",
      title: "登记口径冲突",
      description: "必须登记与无需登记冲突。",
      involves: ["asset_1"],
      severity: "normal",
      status: "open",
      subjectAssetIds: ["asset_1"],
      evidence: [],
      metadata: {},
      createdAt: new Date("2026-06-19T00:00:00.000Z"),
      updatedAt: new Date("2026-06-19T00:00:00.000Z"),
      resolvedAt: null,
    };
    const registry = createWorldToolRegistry(
      {} as never,
      undefined,
      undefined,
      {
        createIssue: async () => createdIssue,
      } as never,
    );
    const runtime: PiRuntimeClient = {
      async *runSession(_input, executeTool): AsyncIterable<PiRuntimeEvent> {
        if (!executeTool) throw new Error("Expected tool executor.");
        const toolCall: PiToolCall = {
          id: "tool_issue_1",
          name: "create_consistency_issue",
          arguments: {
            worldId: "world_1",
            title: "登记口径冲突",
            description: "必须登记与无需登记冲突。",
            subjectAssetIds: ["asset_1"],
          },
        };
        const execution = await executeTool(toolCall);
        yield { type: "tool.completed", toolCallId: toolCall.id, result: execution.result };
        for (const contextEvent of execution.contextEvents) yield contextEvent;
      },
    };
    const runner = new PiSessionRunner(runtime, registry, new SafetyGate());

    const events = await collect(runner.run({
      ...BASE_INPUT,
      policy: { kind: "world_exploration" },
    }));

    expect(events).toEqual([
      {
        type: "tool.completed",
        toolCallId: "tool_issue_1",
        result: { issue: createdIssue },
      },
      {
        type: "consistency.issue.created",
        issueId: "issue_1",
        worldId: "world_1",
      },
    ]);
  });
});

function createRunner(
  toolCall: PiToolCall,
  handler: (input: Record<string, unknown>) => Promise<Record<string, unknown>>,
) {
  const runtime: PiRuntimeClient = {
    async *runSession(_input, executeTool): AsyncIterable<PiRuntimeEvent> {
      if (!executeTool) throw new Error("Expected tool executor.");
      const execution = await executeTool(toolCall);
      yield { type: "tool.completed", toolCallId: toolCall.id, result: execution.result };
    },
  };
  const registry = new WorldToolRegistry();
  registry.register(toolCall.name, handler);
  return new PiSessionRunner(runtime, registry, new SafetyGate());
}

async function collect(events: AsyncIterable<PiRuntimeEvent>) {
  const collected: PiRuntimeEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}
