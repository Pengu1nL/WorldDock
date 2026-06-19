import type { PiToolCall } from "@worlddock/domain/agent/pi";
import type { TokenUsage, WorldSuggestion } from "@worlddock/domain";
import type { WorldContextRef } from "@worlddock/domain/agent/context";
import { MockPiRuntimeClient } from "./pi/pi-runtime.client";
import { piEventToAgentChunk } from "./pi/pi-event-adapter";
import { PiSessionRunner } from "./pi/pi-session-runner";
import { SafetyGate, type PiSessionPolicy } from "./pi/safety-gate";
import { describeWorldTools, WorldToolRegistry, type WorldToolDefinition } from "./pi/world-tool-registry";

export const AGENT_PROVIDER = Symbol("AGENT_PROVIDER");

export type AgentProviderInput = {
  runId?: string;
  prompt: string;
  world: {
    id?: string;
    name: string;
    summary: string;
  };
  context?: WorldContextRef[];
  policy?: PiSessionPolicy;
  tools?: readonly WorldToolDefinition[];
  skills?: Array<{ name: string; path: string; description: string }>;
  model?: string | null;
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
  | { type: "asset-patch-applied"; sessionId: string; assetId: string; patchId: string }
  | { type: "consistency-issue-created"; issueId: string; worldId: string }
  | { type: "suggestion"; suggestion: WorldSuggestion }
  | { type: "usage"; tokenUsage: TokenUsage }
  | { type: "failed"; code: string; message: string };

export type AgentProvider = {
  stream(input: AgentProviderInput): AsyncIterable<AgentProviderChunk>;
};

type AgentProviderEnv = Record<string, string | undefined>;

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
      prompt: input.prompt,
      model: input.model ?? process.env.PI_MODEL_ID ?? process.env.AI_MODEL ?? "pi-mock",
      context,
      policy: input.policy,
      tools: input.tools ? [...input.tools] : [...describeWorldTools(input.policy)],
      skills: input.skills ?? [],
    })) {
      if (input.signal?.aborted) return;
      const chunk = piEventToAgentChunk(event);
      if (chunk) yield chunk;
    }
  }
}

export function createAgentProviderFromEnv(env: AgentProviderEnv = process.env): AgentProvider {
  const provider = env.AI_PROVIDER?.trim() || "pi";
  if (provider !== "pi") {
    throw new Error(`Unsupported AI_PROVIDER=${provider}. WorldDock only supports AI_PROVIDER=pi.`);
  }
  return new PiAgentProvider();
}

function createDefaultPiSessionRunner() {
  const registry = new WorldToolRegistry();
  const policies: PiSessionPolicy[] = [
    { kind: "world_exploration" },
    { kind: "world_exploration", intent: "asset_deposition" },
    { kind: "asset_edit" },
    { kind: "consistency_repair" },
  ];
  for (const tool of policies.flatMap((policy) => describeWorldTools(policy))) {
    registry.register(tool.name, async () => ({}));
  }
  return new PiSessionRunner(new MockPiRuntimeClient(), registry, new SafetyGate());
}
