import { describe, expect, it } from "vitest";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  registerFauxProvider,
} from "@earendil-works/pi-ai";
import type { PiRuntimeEvent } from "@worlddock/domain/agent/pi";
import { buildContextMessage, buildSystemPrompt, createPiAgentCoreAdapter } from "./pi-agent-core.adapter";
import { piEventToAgentChunk } from "./pi-event-adapter";
import type { PiRuntimeToolExecutor } from "./pi-runtime.client";

describe("createPiAgentCoreAdapter", () => {
  it("exposes concrete context ids for follow-up asset tool calls", () => {
    const message = buildContextMessage(baseInput({
      context: [
        {
          level: "manifest",
          kind: "world",
          title: "火星孤悬",
          excerpt: "火星开发被半搁置。",
          targetId: "world_mars",
          source: "initial",
        },
        {
          level: "card",
          kind: "conflict",
          title: "红岩联合的奥德赛计划",
          excerpt: "红岩联合试图实现火星自给自足。",
          targetId: "conflict_odyssey",
          source: "initial",
        },
      ],
    }));
    const systemPrompt = buildSystemPrompt(baseInput());

    expect(message).toContain("worldId=world_mars");
    expect(message).toContain("assetId=conflict_odyssey");
    expect(message).toContain("targetId=conflict_odyssey");
    expect(message).not.toContain("[card/conflict/initial]");
    expect(systemPrompt).toContain("assetId 必须使用上下文或工具结果中明确标出的 assetId/targetId");
  });

  it("runs a real pi Agent loop and bridges WorldDock tool results back into the loop", async () => {
    const faux = registerFauxProvider({
      provider: "worlddock-test",
      models: [{ id: "phase5-test-model", name: "Phase 5 Test Model" }],
      tokenSize: { min: 1000, max: 1000 },
    });

    try {
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxText("我先检索世界资产。"),
            fauxToolCall(
              "search_world_assets",
              { worldId: "world_1", query: "记忆" },
              { id: "call_search_1" },
            ),
          ],
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage("检索结果显示，《记忆交易法》是核心制度。"),
      ]);

      const model = faux.getModel("phase5-test-model");
      expect(model).toBeDefined();

      const adapter = createPiAgentCoreAdapter({
        modelProvider: "worlddock-test",
        modelId: "phase5-test-model",
        providerApiKey: "test-key",
        modelOverride: model!,
      });

      const events: PiRuntimeEvent[] = [];
      await adapter(
        {
          runId: "run_1",
          worldId: "world_1",
          prompt: "继续推演记忆交易制度",
          model: "phase5-test-model",
          context: [
            {
              level: "manifest",
              kind: "world",
              title: "回忆所",
              excerpt: "记忆可以被买卖。",
              targetId: "world_1",
              source: "initial",
            },
          ],
          tools: [
            {
              name: "search_world_assets",
              description: "Search world assets and return Cards only.",
              inputSchema: { type: "object", required: ["worldId", "query"] },
            },
            {
              name: "propose_setting",
              description: "Return a typed pending setting suggestion.",
              inputSchema: { type: "object", required: ["title", "body"] },
            },
          ],
          skills: [],
        },
        (event) => events.push(event),
        async (toolCall: Parameters<PiRuntimeToolExecutor>[0]) => {
          expect(toolCall).toMatchObject({
            id: "call_search_1",
            name: "search_world_assets",
            arguments: { worldId: "world_1", query: "记忆" },
          });
          return {
            result: {
              cards: [
                {
                  kind: "setting",
                  title: "《记忆交易法》",
                  excerpt: "交易制度。",
                  targetId: "asset_1",
                },
              ],
            },
            contextEvents: [
              {
                type: "context.used",
                level: "card",
                kind: "setting",
                title: "《记忆交易法》",
                excerpt: "交易制度。",
                targetId: "asset_1",
                source: "tool",
              },
            ],
          };
        },
      );

      const indexOf = (
        label: string,
        predicate: (event: PiRuntimeEvent) => boolean,
      ) => {
        const index = events.findIndex(predicate);
        expect(index, `${label} event`).toBeGreaterThanOrEqual(0);
        return index;
      };

      expect(events).toContainEqual({
        type: "session.started",
        piSessionId: "pi_run_1",
      });
      expect(events).toContainEqual({
        type: "tool.requested",
        toolCall: {
          id: "call_search_1",
          name: "search_world_assets",
          arguments: { worldId: "world_1", query: "记忆" },
        },
      });
      expect(events).toContainEqual({
        type: "tool.completed",
        toolCallId: "call_search_1",
        result: {
          cards: [
            {
              kind: "setting",
              title: "《记忆交易法》",
              excerpt: "交易制度。",
              targetId: "asset_1",
            },
          ],
        },
      });
      expect(events).toContainEqual({
        type: "context.used",
        level: "card",
        kind: "setting",
        title: "《记忆交易法》",
        excerpt: "交易制度。",
        targetId: "asset_1",
        source: "tool",
      });
      expect(
        events.some(
          (event) =>
            event.type === "message.delta" && event.text.includes("核心制度"),
        ),
      ).toBe(true);
      expect(
        events.some(
          (event) => event.type === "usage" && event.tokenUsage.totalTokens > 0,
        ),
      ).toBe(true);
      expect(events).toContainEqual({ type: "session.completed" });

      expect(events.some((event) => event.type === "session.failed")).toBe(
        false,
      );

      const sessionStartedIndex = indexOf(
        "session.started",
        (event) => event.type === "session.started",
      );
      const toolRequestedIndex = indexOf(
        "tool.requested",
        (event) =>
          event.type === "tool.requested" &&
          event.toolCall.id === "call_search_1",
      );
      const toolCompletedIndex = indexOf(
        "tool.completed",
        (event) =>
          event.type === "tool.completed" &&
          event.toolCallId === "call_search_1",
      );
      const toolContextUsedIndex = indexOf(
        "tool context.used",
        (event) =>
          event.type === "context.used" &&
          event.source === "tool" &&
          event.targetId === "asset_1",
      );
      const finalMessageDeltaIndex = indexOf(
        "final message.delta",
        (event) =>
          event.type === "message.delta" && event.text.includes("核心制度"),
      );
      const usageIndex = indexOf(
        "usage",
        (event) =>
          event.type === "usage" && event.tokenUsage.totalTokens > 0,
      );
      const sessionCompletedIndex = indexOf(
        "session.completed",
        (event) => event.type === "session.completed",
      );

      expect(sessionStartedIndex).toBeLessThan(toolRequestedIndex);
      expect(toolRequestedIndex).toBeLessThan(toolCompletedIndex);
      expect(toolCompletedIndex).toBeLessThan(toolContextUsedIndex);
      expect(toolContextUsedIndex).toBeLessThan(finalMessageDeltaIndex);
      expect(finalMessageDeltaIndex).toBeLessThan(usageIndex);
      expect(usageIndex).toBeLessThan(sessionCompletedIndex);
      expect(sessionCompletedIndex).toBe(events.length - 1);
    } finally {
      faux.unregister();
    }
  });

  it("emits suggestion.created when a WorldDock tool returns a suggestion", async () => {
    const faux = registerFauxProvider({
      provider: "worlddock-suggestion-test",
      models: [{ id: "phase5-suggestion-model", name: "Phase 5 Suggestion Model" }],
      tokenSize: { min: 1000, max: 1000 },
    });

    try {
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxText("我会先形成待确认设定。"),
            fauxToolCall(
              "propose_setting",
              { title: "记忆税", body: "每次交易都会留下税印。" },
              { id: "call_setting_1" },
            ),
          ],
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage("已整理为待确认设定。"),
      ]);

      const model = faux.getModel("phase5-suggestion-model");
      const adapter = createPiAgentCoreAdapter({
        modelProvider: "worlddock-suggestion-test",
        modelId: "phase5-suggestion-model",
        providerApiKey: "test-key",
        modelOverride: model!,
      });

      const events: PiRuntimeEvent[] = [];
      await adapter(
        baseInput({
          model: "phase5-suggestion-model",
          tools: [
            {
              name: "propose_setting",
              description: "Return a typed pending setting suggestion.",
              inputSchema: { type: "object", required: ["title", "body"] },
            },
          ],
        }),
        (event) => events.push(event),
        async () => ({
          result: {
            suggestion: {
              id: "setting_memory_tax",
              kind: "setting",
              category: "世界规则",
              title: "记忆税",
              summary: "交易留下税印。",
              body: "每次交易都会留下税印。",
            },
          },
          contextEvents: [],
        }),
      );

      expect(events).toContainEqual({
        type: "suggestion.created",
        suggestion: {
          id: "setting_memory_tax",
          kind: "setting",
          category: "世界规则",
          title: "记忆税",
          summary: "交易留下税印。",
          body: "每次交易都会留下税印。",
        },
      });
      expect(events).toContainEqual({ type: "session.completed" });
    } finally {
      faux.unregister();
    }
  });

  it("emits session.failed and does not complete when the model stops with error", async () => {
    const faux = registerFauxProvider({
      provider: "worlddock-model-error-test",
      models: [{ id: "phase5-error-model", name: "Phase 5 Error Model" }],
      tokenSize: { min: 1000, max: 1000 },
    });

    try {
      faux.setResponses([
        fauxAssistantMessage("模型失败。", {
          stopReason: "error",
          errorMessage: "upstream model failed",
        }),
      ]);

      const model = faux.getModel("phase5-error-model");
      const adapter = createPiAgentCoreAdapter({
        modelProvider: "worlddock-model-error-test",
        modelId: "phase5-error-model",
        providerApiKey: "test-key",
        modelOverride: model!,
      });

      const events: PiRuntimeEvent[] = [];
      await adapter(
        baseInput({ model: "phase5-error-model" }),
        (event) => events.push(event),
        async () => ({ result: {}, contextEvents: [] }),
      );

      expect(events).toContainEqual({
        type: "session.failed",
        code: "PI_SESSION_FAILED",
        message: "upstream model failed",
      });
      expect(events.at(-1)).toEqual({
        type: "session.failed",
        code: "PI_SESSION_FAILED",
        message: "upstream model failed",
      });
      expect(events.some((event) => event.type === "session.completed")).toBe(false);
      expect(events.some((event) => event.type === "usage")).toBe(false);
    } finally {
      faux.unregister();
    }
  });

  it("emits session.failed and no tool.completed when WorldDock tool execution throws", async () => {
    const faux = registerFauxProvider({
      provider: "worlddock-tool-error-test",
      models: [{ id: "phase5-tool-error-model", name: "Phase 5 Tool Error Model" }],
      tokenSize: { min: 1000, max: 1000 },
    });

    try {
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxText("我先检索。"),
            fauxToolCall(
              "search_world_assets",
              { worldId: "world_1", query: "禁区" },
              { id: "call_search_error" },
            ),
          ],
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage("工具失败后不能完成。"),
      ]);

      const model = faux.getModel("phase5-tool-error-model");
      const adapter = createPiAgentCoreAdapter({
        modelProvider: "worlddock-tool-error-test",
        modelId: "phase5-tool-error-model",
        providerApiKey: "test-key",
        modelOverride: model!,
      });

      const events: PiRuntimeEvent[] = [];
      await adapter(
        baseInput({
          model: "phase5-tool-error-model",
          tools: [
            {
              name: "search_world_assets",
              description: "Search world assets and return Cards only.",
              inputSchema: { type: "object", required: ["worldId", "query"] },
            },
          ],
        }),
        (event) => events.push(event),
        async () => {
          throw new Error("SafetyGate blocked asset detail");
        },
      );

      expect(events).toContainEqual({
        type: "session.failed",
        code: "PI_TOOL_EXECUTION_FAILED",
        message: "WorldDock tool search_world_assets failed.",
      });
      expect(events.at(-1)).toEqual({
        type: "session.failed",
        code: "PI_TOOL_EXECUTION_FAILED",
        message: "WorldDock tool search_world_assets failed.",
      });
      expect(events.some((event) => event.type === "message.delta" && event.text.includes("工具失败后不能完成"))).toBe(false);
      expect(events.some((event) => event.type === "tool.completed" && event.toolCallId === "call_search_error")).toBe(false);
      expect(events.some((event) => event.type === "usage")).toBe(false);
      expect(events.some((event) => event.type === "session.completed")).toBe(false);
    } finally {
      faux.unregister();
    }
  });

  it("uses tool.inputSchema so propose_release_notes accepts worldId", async () => {
    const faux = registerFauxProvider({
      provider: "worlddock-release-notes-test",
      models: [{ id: "phase5-release-model", name: "Phase 5 Release Model" }],
      tokenSize: { min: 1000, max: 1000 },
    });

    try {
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxText("我检查版本说明。"),
            fauxToolCall(
              "propose_release_notes",
              { worldId: "world_1" },
              { id: "call_release_1" },
            ),
          ],
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage("版本说明已整理。"),
      ]);

      const model = faux.getModel("phase5-release-model");
      const adapter = createPiAgentCoreAdapter({
        modelProvider: "worlddock-release-notes-test",
        modelId: "phase5-release-model",
        providerApiKey: "test-key",
        modelOverride: model!,
      });

      const toolCalls: Parameters<PiRuntimeToolExecutor>[0][] = [];
      const events: PiRuntimeEvent[] = [];
      await adapter(
        baseInput({
          model: "phase5-release-model",
          tools: [
            {
              name: "propose_release_notes",
              description: "Return proposed release notes without publishing.",
              inputSchema: { type: "object", required: ["worldId"] },
            },
          ],
        }),
        (event) => events.push(event),
        async (toolCall) => {
          toolCalls.push(toolCall);
          return {
            result: { worldId: toolCall.arguments.worldId, notes: "待整理版本说明。" },
            contextEvents: [],
          };
        },
      );

      expect(toolCalls).toEqual([
        {
          id: "call_release_1",
          name: "propose_release_notes",
          arguments: { worldId: "world_1" },
        },
      ]);
      expect(events).toContainEqual({
        type: "tool.completed",
        toolCallId: "call_release_1",
        result: { worldId: "world_1", notes: "待整理版本说明。" },
      });
      expect(events.some((event) => event.type === "session.failed")).toBe(false);
      expect(events).toContainEqual({ type: "session.completed" });
    } finally {
      faux.unregister();
    }
  });
});

describe("piEventToAgentChunk", () => {
  it("propagates pi runtime failures to provider chunks", () => {
    expect(piEventToAgentChunk({
      type: "session.failed",
      code: "PI_SESSION_FAILED",
      message: "upstream model failed",
    })).toEqual({
      type: "failed",
      code: "PI_SESSION_FAILED",
      message: "upstream model failed",
    });
  });
});

function baseInput(overrides: Partial<Parameters<ReturnType<typeof createPiAgentCoreAdapter>>[0]> = {}) {
  return {
    runId: "run_1",
    worldId: "world_1",
    prompt: "继续推演记忆交易制度",
    model: "phase5-test-model",
    context: [],
    tools: [],
    skills: [],
    ...overrides,
  };
}
