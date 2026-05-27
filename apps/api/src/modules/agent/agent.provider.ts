import type { PiToolCall } from "@worlddock/domain/agent/pi";
import type { TokenUsage, WorldSuggestion } from "@worlddock/domain";
import type { WorldContextRef } from "@worlddock/domain/agent/context";
import { MockPiRuntimeClient } from "./pi/pi-runtime.client";
import { piEventToAgentChunk } from "./pi/pi-event-adapter";
import { PiSessionRunner } from "./pi/pi-session-runner";
import { SafetyGate } from "./pi/safety-gate";
import { describeWorldTools, WorldToolRegistry } from "./pi/world-tool-registry";

export const AGENT_PROVIDER = Symbol("AGENT_PROVIDER");

export type AgentProviderInput = {
  runId?: string;
  userId?: string;
  prompt: string;
  world: {
    id?: string;
    name: string;
    summary: string;
  };
  context?: WorldContextRef[];
  tools?: ReturnType<typeof describeWorldTools>;
  skills?: Array<{ name: string; path: string; description: string }>;
  model?: string | null;
  mode: "expand" | "challenge" | "fork" | "polish";
};

export type AgentProviderOutput = {
  deltas: string[];
  contextRefs: Array<{ kind: "world" | "archive" | "seed" | "conflict" | "repository"; title: string; excerpt: string; targetId?: string | null; level?: NonNullable<WorldContextRef["level"]>; source?: NonNullable<WorldContextRef["source"]> }>;
  suggestions: WorldSuggestion[];
  tokenUsage: TokenUsage;
};

export type AgentProviderChunk =
  | { type: "pi-session-started"; piSessionId: string }
  | { type: "context"; contextRef: AgentProviderOutput["contextRefs"][number] }
  | { type: "delta"; text: string }
  | { type: "tool-requested"; toolCall: PiToolCall }
  | { type: "tool-completed"; toolCallId: string; result: Record<string, unknown> }
  | { type: "suggestion"; suggestion: WorldSuggestion }
  | { type: "usage"; tokenUsage: TokenUsage };

export type AgentProvider = {
  stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk>;
};

export class MockAgentProvider implements AgentProvider {
  async *stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk> {
    yield {
      type: "context",
      contextRef: {
        kind: "world",
        title: `${input.world.name} · 世界摘要`,
        excerpt: input.world.summary,
      },
    };
    yield { type: "delta", text: "好。" };
    yield { type: "delta", text: `我会基于「${input.world.name}」继续推演，并先沉淀一条可确认设定。` };
    yield {
      type: "suggestion",
      suggestion: {
        id: "setting_legal_frame",
        kind: "setting",
        category: "世界规则",
        title: "核心运行规则",
        summary: "将本轮推演收束为一条可保存的世界规则。",
        body: `围绕「${input.prompt}」，世界需要一条可被角色反复触碰的规则边界。`,
      },
    };
    yield {
      type: "usage",
      tokenUsage: {
        inputTokens: Math.max(1, Math.ceil(input.prompt.length / 2)),
        outputTokens: 48,
        totalTokens: Math.max(1, Math.ceil(input.prompt.length / 2)) + 48,
      },
    };
  }
}

export class VercelAiSdkAgentProvider implements AgentProvider {
  async *stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk> {
    const { streamText } = await import("ai");
    const result = streamText({
      model: process.env.AI_MODEL ?? "openai/gpt-5.4",
      prompt: [
        `你是 WorldDock 世界观推演 Agent，模式：${input.mode}`,
        `世界：${input.world.name}`,
        `摘要：${input.world.summary}`,
        `用户输入：${input.prompt}`,
      ].join("\n"),
    });

    yield { type: "context", contextRef: { kind: "world", title: `${input.world.name} · 世界摘要`, excerpt: input.world.summary } };

    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
      yield { type: "delta", text: delta };
    }

    yield {
      type: "suggestion",
      suggestion: {
        id: "setting_from_model",
        kind: "setting",
        category: "待定设定",
        title: "模型推演设定",
        summary: text.slice(0, 120) || "模型生成了一条待整理设定。",
        body: text || "模型生成内容为空。",
      },
    };
    yield {
      type: "usage",
      tokenUsage: { inputTokens: 0, outputTokens: text.length, totalTokens: text.length },
    };
  }
}

export class PiAgentProvider implements AgentProvider {
  constructor(private readonly runner = createDefaultPiSessionRunner()) {}

  async *stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk> {
    const context: WorldContextRef[] = input.context ?? [{
      level: "manifest",
      kind: "world",
      title: input.world.name,
      excerpt: input.world.summary,
      targetId: input.world.id,
      source: "initial",
    }];
    for await (const event of this.runner.run({
      runId: input.runId ?? "run_pending",
      worldId: input.world.id ?? "world_pending",
      userId: input.userId ?? "user_pending",
      mode: input.mode,
      prompt: input.prompt,
      model: input.model ?? process.env.PI_MODEL_ID ?? process.env.AI_MODEL ?? "pi-mock",
      context,
      tools: input.tools ? [...input.tools] : [...describeWorldTools()],
      skills: input.skills ?? [],
    })) {
      const chunk = piEventToAgentChunk(event);
      if (chunk) yield chunk;
    }
  }
}

function createDefaultPiSessionRunner() {
  const registry = new WorldToolRegistry();
  for (const tool of describeWorldTools()) {
    registry.register(tool.name, async () => ({}));
  }
  return new PiSessionRunner(new MockPiRuntimeClient(), registry, new SafetyGate());
}
