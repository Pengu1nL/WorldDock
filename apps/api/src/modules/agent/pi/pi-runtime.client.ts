import { piRuntimeEventSchema, type PiRuntimeEvent, type PiToolCall, type PiToolName } from "@worlddock/domain/agent/pi";
import type { WorldContextRef } from "@worlddock/domain/agent/context";
import type { PiSessionPolicy } from "./safety-gate";

export type PiSessionInput = {
  runId: string;
  worldId: string;
  prompt: string;
  model?: string | null;
  context: WorldContextRef[];
  policy?: PiSessionPolicy;
  tools: Array<{ name: PiToolName; description: string; inputSchema: Record<string, unknown> }>;
  skills: Array<{ name: string; path: string; description: string; instructions?: string }>;
};

export type PiToolExecutionResult = {
  result: Record<string, unknown>;
  contextEvents: PiRuntimeEvent[];
};

export type PiRuntimeToolExecutor = (toolCall: PiToolCall) => Promise<PiToolExecutionResult>;

export type PiRuntimeClient = {
  runSession(input: PiSessionInput, executeTool?: PiRuntimeToolExecutor): AsyncIterable<PiRuntimeEvent>;
};

export type PiAgentCoreAdapter = (
  input: PiSessionInput,
  emit: (event: PiRuntimeEvent) => void,
  executeTool: PiRuntimeToolExecutor,
) => Promise<void>;

const defaultToolExecutor: PiRuntimeToolExecutor = async (toolCall) => ({
  result: {
    error: "WorldDock tool executor is not configured.",
    toolCallId: toolCall.id,
  },
  contextEvents: [],
});

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(value: IteratorResult<T>) => void> = [];
  private ended = false;

  push(value: T) {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.values.push(value);
  }

  end() {
    this.ended = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      const value = this.values.shift();
      if (value) yield value;
      else if (this.ended) return;
      else yield await new Promise<T>((resolve) => this.waiters.push((result) => resolve(result.value)));
    }
  }
}

export class PiAgentCoreRuntimeClient implements PiRuntimeClient {
  constructor(private readonly adapter: PiAgentCoreAdapter) {}

  async *runSession(input: PiSessionInput, executeTool: PiRuntimeToolExecutor = defaultToolExecutor): AsyncIterable<PiRuntimeEvent> {
    const queue = new AsyncEventQueue<PiRuntimeEvent>();

    for (const contextRef of input.context) {
      queue.push(piRuntimeEventSchema.parse({
        type: "context.used",
        level: contextRef.level,
        kind: contextRef.kind,
        title: contextRef.title,
        excerpt: contextRef.excerpt,
        targetId: contextRef.targetId,
        source: contextRef.source,
      }));
    }

    const run = this.adapter(input, (event) => {
      queue.push(piRuntimeEventSchema.parse(event));
    }, executeTool)
      .catch((error) => {
        queue.push(piRuntimeEventSchema.parse({
          type: "session.failed",
          code: "PI_RUNTIME_FAILED",
          message: error instanceof Error ? error.message : "pi runtime failed",
        }));
      })
      .finally(() => queue.end());

    for await (const event of queue) yield event;
    await run;
  }
}

export function createMissingPiAdapter(): PiAgentCoreAdapter {
  return async () => {
    throw new Error("PiAgentCoreAdapter is not configured from confirmed @earendil-works/pi-agent-core APIs.");
  };
}

export class MockPiRuntimeClient implements PiRuntimeClient {
  async *runSession(input: PiSessionInput): AsyncIterable<PiRuntimeEvent> {
    yield { type: "session.started", piSessionId: `pi_${input.runId}` };
    for (const contextRef of input.context) {
      yield {
        type: "context.used",
        level: contextRef.level,
        kind: contextRef.kind,
        title: contextRef.title,
        excerpt: contextRef.excerpt,
        targetId: contextRef.targetId,
        source: contextRef.source,
      };
    }
    yield { type: "message.delta", text: `我会基于「${input.prompt}」生成一条可确认的世界设定。` };
    yield {
      type: "suggestion.created",
      suggestion: {
        id: "pi_setting_mock",
        kind: "setting",
        category: "世界规则",
        title: "可确认的世界规则",
        summary: "pi mock runtime 生成的设定建议。",
        body: "这条设定只能作为 pending suggestion，必须由用户确认后才能写入世界资产。",
      },
    };
    yield { type: "usage", tokenUsage: { inputTokens: input.prompt.length, outputTokens: 64, totalTokens: input.prompt.length + 64 } };
    yield { type: "session.completed" };
  }
}
