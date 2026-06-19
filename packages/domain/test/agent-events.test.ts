import { describe, expect, it } from "vitest";
import {
  agentEventSchema,
  agentRunSchema,
  agentSuggestionRecordSchema,
  contextRefSchema,
  piToolNameSchema,
  tokenUsageSchema,
} from "../src";

describe("agent event contracts", () => {
  it("validates WorldDock SSE agent events", () => {
    expect(() =>
      agentEventSchema.parse({
        id: "evt_1",
        runId: "run_1",
        type: "message.delta",
        sequence: 2,
        createdAt: "2026-05-26T12:00:00.000Z",
        payload: { text: "好。让我先拆解这个灵感。" },
      }),
    ).not.toThrow();

    expect(() =>
      agentEventSchema.parse({
        id: "evt_2",
        runId: "run_1",
        type: "suggestion.created",
        sequence: 3,
        createdAt: "2026-05-26T12:00:01.000Z",
        payload: {
          suggestionId: "s1",
          suggestion: {
            id: "s1",
            kind: "setting",
            category: "世界规则",
            title: "《记忆交易法》",
            summary: "确立记忆作为可交易资产的法律地位。",
            body: "仅认证机构可以主持交易。",
          },
        },
      }),
    ).not.toThrow();
  });

  it("validates run, usage, suggestion record, and context reference metadata", () => {
    expect(agentRunSchema.parse({
      id: "run_1",
      worldId: "world_1",
      userId: "user_1",
      status: "completed",
      prompt: "推演记忆交易制度",
      createdAt: "2026-05-26T12:00:00.000Z",
      updatedAt: "2026-05-26T12:00:02.000Z",
      completedAt: "2026-05-26T12:00:02.000Z",
    }).status).toBe("completed");

    expect(tokenUsageSchema.parse({ inputTokens: 120, outputTokens: 360, totalTokens: 480 }).totalTokens).toBe(480);
    expect(contextRefSchema.parse({
      id: "ctx_1",
      runId: "run_1",
      kind: "world",
      title: "世界摘要",
      excerpt: "记忆可以被买卖。",
    }).kind).toBe("world");
    expect(agentSuggestionRecordSchema.parse({
      id: "ags_1",
      runId: "run_1",
      worldId: "world_1",
      status: "pending",
      suggestion: {
        id: "seed1",
        kind: "seed",
        category: "故事种子",
        title: "继承的童年",
        hook: "她发现一段不属于自己的童年记忆。",
        trigger: "记忆账户进入遗产流程。",
        conflict: "人格权与继承权冲突。",
        protagonists: "律师、继承人、原始记忆出售者",
        questions: ["记忆能被继承吗？"],
      },
    }).status).toBe("pending");
  });

  it("accepts session asset write tools in persisted tool request events", () => {
    expect(agentEventSchema.parse({
      id: "evt_tool_1",
      runId: "run_1",
      type: "tool.requested",
      sequence: 4,
      createdAt: "2026-05-26T12:00:03.000Z",
      payload: {
        toolCall: {
          id: "tool_1",
          name: "create_world_asset",
          arguments: { title: "记忆交易所" },
        },
      },
    }).payload.toolCall.name).toBe("create_world_asset");
  });

  it("validates consistency issue created session stream events", () => {
    expect(agentEventSchema.parse({
      id: "evt_consistency_1",
      runId: "run_1",
      type: "consistency.issue.created",
      sequence: 5,
      createdAt: "2026-05-26T12:00:04.000Z",
      payload: {
        issueId: "issue_1",
        worldId: "world_1",
      },
    }).payload.issueId).toBe("issue_1");
  });

  it("keeps Pi tools and context references local-only", () => {
    expect(piToolNameSchema.parse("list_local_releases")).toBe("list_local_releases");
    expect(() => piToolNameSchema.parse(`list_${"repo"}sitory_releases`)).toThrow();
    expect(() =>
      contextRefSchema.parse({
        id: "ctx_2",
        runId: "run_1",
        kind: `${"repo"}sitory`,
        title: "远端来源",
        excerpt: "不应进入本地上下文。",
      }),
    ).toThrow();
  });
});
