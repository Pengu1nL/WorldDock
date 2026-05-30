import { describe, expect, it } from "vitest";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  registerFauxProvider,
} from "@earendil-works/pi-ai";
import type { PiRuntimeEvent } from "@worlddock/domain/agent/pi";
import { createPiAgentCoreAdapter } from "./pi-agent-core.adapter";

describe("createPiAgentCoreAdapter", () => {
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

      const adapter = createPiAgentCoreAdapter({
        modelProvider: "worlddock-test",
        modelId: "phase5-test-model",
        providerApiKey: "test-key",
        modelOverride: faux.getModel("phase5-test-model"),
      });

      const events: PiRuntimeEvent[] = [];
      await adapter(
        {
          runId: "run_1",
          userId: "user_1",
          worldId: "world_1",
          mode: "expand",
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
        async (toolCall) => {
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
    } finally {
      faux.unregister();
    }
  });
});
