import type { TokenUsage, WorldSuggestion } from "@worlddock/domain";

export const AGENT_PROVIDER = Symbol("AGENT_PROVIDER");

export type AgentProviderInput = {
  prompt: string;
  world: {
    name: string;
    summary: string;
  };
  mode: "expand" | "challenge" | "fork" | "polish";
};

export type AgentProviderOutput = {
  deltas: string[];
  contextRefs: Array<{ kind: "world" | "archive" | "seed" | "conflict" | "repository"; title: string; excerpt: string; targetId?: string | null }>;
  suggestions: WorldSuggestion[];
  tokenUsage: TokenUsage;
};

export type AgentProviderChunk =
  | { type: "context"; contextRef: AgentProviderOutput["contextRefs"][number] }
  | { type: "delta"; text: string }
  | { type: "suggestion"; suggestion: WorldSuggestion }
  | { type: "usage"; tokenUsage: TokenUsage };

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
        model: this.options.model,
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
              `用户输入：${input.prompt}`,
            ].join("\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI provider request failed with ${response.status}`);
    }

    yield { type: "context", contextRef: { kind: "world", title: `${input.world.name} · 世界摘要`, excerpt: input.world.summary } };

    let text = "";
    let tokenUsage: TokenUsage | null = null;
    for await (const event of readOpenAiStream(response)) {
      if (event.text) {
        text += event.text;
        yield { type: "delta", text: event.text };
      }
      if (event.tokenUsage) {
        tokenUsage = event.tokenUsage;
      }
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
      tokenUsage: tokenUsage ?? estimateTokenUsage(input.prompt, text),
    };
  }
}

export function createAgentProviderFromEnv(env: AgentProviderEnv = process.env): AgentProvider {
  const provider = env.AI_PROVIDER ?? "openai";
  if (provider === "mock") {
    throw new Error("AI_PROVIDER=mock is disabled. Set AI_PROVIDER=openai and configure OPENAI_API_KEY plus AI_MODEL.");
  }
  if (provider !== "openai") {
    throw new Error(`Unsupported AI_PROVIDER=${provider}. Supported provider: openai.`);
  }

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

async function* readOpenAiStream(response: Response): AsyncIterable<{ text?: string; tokenUsage?: TokenUsage }> {
  if (!response.body) {
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
