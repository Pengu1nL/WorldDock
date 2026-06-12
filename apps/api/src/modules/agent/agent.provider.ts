import type { PiToolCall } from "@worlddock/domain/agent/pi";
import type { TokenUsage, WorldSuggestion } from "@worlddock/domain";
import type { WorldContextRef } from "@worlddock/domain/agent/context";
import { MockPiRuntimeClient } from "./pi/pi-runtime.client";
import { piEventToAgentChunk } from "./pi/pi-event-adapter";
import { PiSessionRunner } from "./pi/pi-session-runner";
import { SafetyGate } from "./pi/safety-gate";
import { describeWorldTools, WorldToolRegistry } from "./pi/world-tool-registry";

export const AGENT_PROVIDER = Symbol("AGENT_PROVIDER");

type WorldToolDefinition = ReturnType<typeof describeWorldTools>[number];

export type AgentProviderInput = {
  runId?: string;
  prompt: string;
  world: {
    id?: string;
    name: string;
    summary: string;
  };
  context?: WorldContextRef[];
  tools?: readonly WorldToolDefinition[];
  skills?: Array<{ name: string; path: string; description: string }>;
  model?: string | null;
  mode: "expand" | "challenge" | "fork" | "polish";
  signal?: AbortSignal;
};

export type AgentProviderOutput = {
  deltas: string[];
  contextRefs: Array<{
    kind: "world" | "archive" | "seed" | "conflict";
    title: string;
    excerpt: string;
    targetId?: string | null;
    level?: NonNullable<WorldContextRef["level"]>;
    source?: NonNullable<WorldContextRef["source"]>;
  }>;
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
  | { type: "usage"; tokenUsage: TokenUsage }
  | { type: "failed"; code: string; message: string };

export type AgentProvider = {
  stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk>;
};

type AgentProviderEnv = Record<string, string | undefined>;

type OpenAiAgentProviderOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export class OpenAiAgentProvider implements AgentProvider {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OpenAiAgentProviderOptions) {
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async *stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk> {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model ?? this.options.model,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          {
            role: "system",
            content: [
              "你是 WorldDock 世界观推演 Agent。",
              "你的任务是帮助作者把世界设定推演成可保存的档案、故事种子或冲突。",
              "回答使用简体中文，具体、克制，不编造已经确认的资料。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `模式：${input.mode}`,
              `世界：${input.world.name}`,
              `世界摘要：${input.world.summary}`,
              formatContextForPrompt(input.context ?? []),
              `用户输入：${input.prompt}`,
            ].filter(Boolean).join("\n"),
          },
        ],
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI provider request failed with ${response.status}`);
    }

    if (input.signal?.aborted) return;
    yield {
      type: "context",
      contextRef: {
        kind: "world",
        title: `${input.world.name} · 世界摘要`,
        excerpt: input.world.summary,
        targetId: input.world.id,
        level: "manifest",
        source: "initial",
      },
    };

    let text = "";
    let tokenUsage: TokenUsage | null = null;
    for await (const event of readOpenAiStream(response, input.signal)) {
      if (input.signal?.aborted) return;
      if (event.text) {
        text += event.text;
        yield { type: "delta", text: event.text };
      }
      if (event.tokenUsage) {
        tokenUsage = event.tokenUsage;
        yield { type: "usage", tokenUsage };
      }
    }

    if (input.signal?.aborted) return;
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
    if (!tokenUsage) {
      yield {
        type: "usage",
        tokenUsage: estimateTokenUsage(input.prompt, text),
      };
    }
  }
}

export class MockAgentProvider implements AgentProvider {
  async *stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk> {
    if (input.signal?.aborted) return;
    yield {
      type: "context",
      contextRef: {
        kind: "world",
        title: `${input.world.name} · 世界摘要`,
        excerpt: input.world.summary,
      },
    };
    if (input.signal?.aborted) return;
    yield { type: "delta", text: "好。" };
    if (input.signal?.aborted) return;
    yield { type: "delta", text: `我会基于「${input.world.name}」继续推演，并先沉淀一条可确认设定。` };
    if (input.signal?.aborted) return;
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
    if (input.signal?.aborted) return;
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
      model: input.model ?? process.env.AI_MODEL ?? "openai/gpt-5.4",
      prompt: [
        `你是 WorldDock 世界观推演 Agent，模式：${input.mode}`,
        `世界：${input.world.name}`,
        `摘要：${input.world.summary}`,
        formatContextForPrompt(input.context ?? []),
        `用户输入：${input.prompt}`,
      ].filter(Boolean).join("\n"),
    });

    if (input.signal?.aborted) return;
    yield {
      type: "context",
      contextRef: {
        kind: "world",
        title: `${input.world.name} · 世界摘要`,
        excerpt: input.world.summary,
        targetId: input.world.id,
        level: "manifest",
        source: "initial",
      },
    };

    let text = "";
    for await (const delta of result.textStream) {
      if (input.signal?.aborted) return;
      text += delta;
      yield { type: "delta", text: delta };
    }
    if (input.signal?.aborted) return;

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
    if (input.signal?.aborted) return;
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
      mode: input.mode,
      prompt: input.prompt,
      model: input.model ?? process.env.PI_MODEL_ID ?? process.env.AI_MODEL ?? "pi-mock",
      context,
      tools: input.tools ? [...input.tools] : [...describeWorldTools()],
      skills: input.skills ?? [],
    })) {
      if (input.signal?.aborted) return;
      const chunk = piEventToAgentChunk(event);
      if (chunk) yield chunk;
    }
  }
}

export function createAgentProviderFromEnv(env: AgentProviderEnv = process.env): AgentProvider {
  const provider = env.AI_PROVIDER?.trim() || "openai";
  if (provider === "mock") {
    throw new Error("AI_PROVIDER=mock is disabled. Set AI_PROVIDER=openai or AI_PROVIDER=pi.");
  }

  if (provider === "openai") {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai.");
    }

    const model = env.AI_MODEL?.trim();
    if (!model) {
      throw new Error("AI_MODEL is required when AI_PROVIDER=openai.");
    }

    return new OpenAiAgentProvider({
      apiKey,
      model,
      baseUrl: env.OPENAI_BASE_URL,
    });
  }

  if (provider === "pi") {
    return new PiAgentProvider();
  }

  if (provider === "vercel-ai") {
    return new VercelAiSdkAgentProvider();
  }

  throw new Error(`Unsupported AI_PROVIDER=${provider}. Supported providers: openai, pi, vercel-ai.`);
}

async function* readOpenAiStream(response: Response, signal?: AbortSignal): AsyncIterable<{ text?: string; tokenUsage?: TokenUsage }> {
  if (!response.body) {
    if (signal?.aborted) return;
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.length > 0) yield { text };
    const tokenUsage = toTokenUsage(payload?.usage);
    if (tokenUsage) yield { tokenUsage };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) return;
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let boundary = findSseBoundary(buffer);
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      yield* parseOpenAiSseBlock(block);
      buffer = buffer.slice(boundary + getBoundaryLength(buffer, boundary));
      boundary = findSseBoundary(buffer);
    }

    if (done) break;
  }

  if (signal?.aborted) return;
  if (buffer.trim()) yield* parseOpenAiSseBlock(buffer);
}

function* parseOpenAiSseBlock(block: string): Iterable<{ text?: string; tokenUsage?: TokenUsage }> {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, "").trim())
    .filter(Boolean);

  for (const data of dataLines) {
    if (data === "[DONE]") continue;
    const payload = JSON.parse(data);
    const text = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.length > 0) yield { text };
    const tokenUsage = toTokenUsage(payload?.usage);
    if (tokenUsage) yield { tokenUsage };
  }
}

function toTokenUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  const inputTokens = Number(record.prompt_tokens ?? record.input_tokens ?? 0);
  const outputTokens = Number(record.completion_tokens ?? record.output_tokens ?? 0);
  const totalTokens = Number(record.total_tokens ?? inputTokens + outputTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function estimateTokenUsage(prompt: string, output: string): TokenUsage {
  const inputTokens = Math.max(1, Math.ceil(prompt.length / 2));
  const outputTokens = Math.max(1, Math.ceil(output.length / 2));
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function formatContextForPrompt(context: WorldContextRef[]) {
  if (context.length === 0) return "";
  return [
    "可用上下文：",
    ...context.map((item) => `- [${item.kind}] ${item.title}: ${item.excerpt}`),
  ].join("\n");
}

function createDefaultPiSessionRunner() {
  const registry = new WorldToolRegistry();
  for (const tool of describeWorldTools()) {
    registry.register(tool.name, async () => ({}));
  }
  return new PiSessionRunner(new MockPiRuntimeClient(), registry, new SafetyGate());
}

function findSseBoundary(text: string) {
  const lf = text.indexOf("\n\n");
  const crlf = text.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

function getBoundaryLength(text: string, boundary: number) {
  return text.startsWith("\r\n\r\n", boundary) ? 4 : 2;
}
