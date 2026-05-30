# Phase 5 Pi Agent Session Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Phase 5 从“pi 文件和测试壳已存在”收口为真实的 pi Agent Session、WorldDock 工具安全门、长世界渐进上下文和前端上下文检查器闭环。

**Architecture:** WorldDock 继续拥有用户、世界、资产、建议、账本和权限；pi Agent 只负责 session、模型流、工具循环和上下文压缩。真实 pi runtime 通过 `@earendil-works/pi-agent-core` 包适配，工具执行仍通过 WorldDock `SafetyGate` 和 `WorldToolRegistry`，pi 不直接写产品表。

**Tech Stack:** TypeScript、NestJS、Prisma、Vitest、Playwright、Zod、typebox、`@earendil-works/pi-agent-core@0.75.5`、`@earendil-works/pi-ai@0.75.5`。

---

## Current Baseline

当前仓库已经拥有 Phase 5 的多数文件，但核心 adapter 仍是隔离桩：

- 已存在：`docs/product/pi-upstream-audit.md`、`docs/product/pi-agent-architecture.md`、`docs/product/world-asset-progressive-disclosure.md`。
- 已存在：`packages/domain/src/agent/context.ts`、`packages/domain/src/agent/pi.ts`、`apps/api/src/modules/agent/pi/*`、`apps/api/src/modules/agent/context-builder.ts`。
- 已存在：Prisma `AgentRun.provider`、`AgentRun.piSessionId`、`ContextRef.level`、`ContextRef.source`。
- 已通过现状基线：

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test -- agent.provider.spec.ts
pnpm --filter @worlddock/api test:integration -- agent-context.integration-spec.ts pi-agent.integration-spec.ts
```

关键缺口：

- `apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts` 只发出固定文本和 usage，没有创建 `Agent`，没有把 `AgentEvent` 映射为 WorldDock runtime events。
- `PiRuntimeClient` 目前无法把 WorldDock 工具结果回传给真实 pi Agent loop；如果直接替换 adapter，模型会拿不到工具返回值。
- `apps/web/src/features/agent/context-inspector.tsx` 已存在，但工作台仍展示静态 `ContextDrawer`，没有展示真实 `context.used` 列表、工具事件或 `pi.session.started`。
- `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` 的 Phase 5 状态已经落后于当前文件树，完成后需要用新的验收证据更新。

## Commit Identity Guard

如果执行本计划时需要提交，每次提交前先执行：

```bash
git config user.name
git config user.email
```

当输出包含真实姓名或个人邮箱时，先在当前仓库设置匿名提交身份：

```bash
git config user.name "Codex"
git config user.email "codex@openai.com"
```

提交后立即核验：

```bash
git log -1 --format=fuller
```

Author 和 Committer 都不得包含真实姓名或个人邮箱。

## File Map

- Modify: `apps/api/src/modules/agent/pi/pi-runtime.client.ts`  
  扩展 runtime client，使真实 adapter 能在 Agent tool execution 中调用 WorldDock 工具 executor，并把工具结果返回给 pi loop。

- Modify: `apps/api/src/modules/agent/pi/pi-session-runner.ts`  
  将 safety gate、disclosed asset set、tool registry 执行封装成 executor，返回工具结果和由工具结果产生的 `context.used` 事件。

- Modify: `apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts`  
  用真实 `Agent`、model、tool definitions 和 event subscription 替换固定文本桩。

- Modify: `apps/api/src/modules/agent/agent.module.ts`  
  保持生产 `AI_PROVIDER=pi` 只走真实 adapter，并确保缺少 `PI_MODEL_PROVIDER`、`PI_MODEL_ID`、`PI_PROVIDER_API_KEY` 时启动失败。

- Modify: `apps/api/src/modules/agent/agent.provider.ts`  
  保留 `PiAgentProvider` 抽象，确保 provider stream 不吞掉 `tool.requested`、`tool.completed`、`pi.session.started`、`context.used`。

- Modify: `apps/api/test/pi-agent.integration-spec.ts`  
  覆盖真实 runtime executor 边界、工具结果回注、proposal tool 只生成 pending suggestion。

- Create: `apps/api/src/modules/agent/pi/pi-agent-core.adapter.spec.ts`  
  用 `@earendil-works/pi-ai` faux provider 验证 adapter 真实创建 Agent、消费工具结果、产出 token usage。

- Modify: `apps/web/src/features/worlddock/api.ts`  
  将 `AgentEvent` 从 loose `any` 改为 Phase 5 事件 union，给前端处理 `context.used` 和 tool events 时提供类型约束。

- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`  
  保存真实 context refs 和 tool activity，打开上下文抽屉时渲染 `ContextInspector`。

- Modify: `apps/web/src/features/agent/context-inspector.tsx`  
  增加空态、稳定排序和 level/source 标签，避免真实事件为空或乱序时 UI 抖动。

- Modify: `apps/web/tests/e2e/pi-agent.spec.ts`  
  从只检查“上下文 1”升级为检查真实上下文抽屉、manifest/card/brief 分组，以及 pending suggestion 保存仍需要用户确认。

- Modify: `docs/product/pi-upstream-audit.md`  
  记录本次确认使用的 Agent methods、event mapping 和 tool result bridge。

- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`  
  Phase 5 完成后把缺失项改为完成状态，并贴验收命令。

---

### Task 1: Add Adapter Contract Test

**Files:**
- Create: `apps/api/src/modules/agent/pi/pi-agent-core.adapter.spec.ts`
- Modify: `apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts`

- [x] **Step 1: Write the failing adapter contract test**

Create `apps/api/src/modules/agent/pi/pi-agent-core.adapter.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider } from "@earendil-works/pi-ai";
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
        fauxAssistantMessage([
          fauxText("我先检索世界资产。"),
          fauxToolCall("search_world_assets", { worldId: "world_1", query: "记忆" }, { id: "call_search_1" }),
        ], { stopReason: "toolUse" }),
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

      expect(events).toContainEqual({ type: "session.started", piSessionId: "pi_run_1" });
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
      expect(events.some((event) => event.type === "message.delta" && event.text.includes("核心制度"))).toBe(true);
      expect(events.some((event) => event.type === "usage" && event.tokenUsage.totalTokens > 0)).toBe(true);
      expect(events).toContainEqual({ type: "session.completed" });
    } finally {
      faux.unregister();
    }
  });
});
```

- [x] **Step 2: Run the test and confirm it fails on the current stub**

Run:

```bash
pnpm --filter @worlddock/api test -- pi-agent-core.adapter.spec.ts
```

Expected: FAIL because `PiAgentCoreAdapterOptions` has no `modelOverride`, `PiAgentCoreAdapter` accepts only two arguments, and the current adapter never emits `tool.requested` or real model text.

- [x] **Step 3: Commit the failing test**

```bash
git add apps/api/src/modules/agent/pi/pi-agent-core.adapter.spec.ts docs/superpowers/plans/2026-05-29-phase-5-pi-agent-execution.md
git commit -m "test: cover real pi agent adapter contract"
git log -1 --format=fuller
```

Expected: commit succeeds and `git log -1 --format=fuller` does not expose personal identity.

---

### Task 2: Bridge Runtime Tool Execution

**Files:**
- Modify: `apps/api/src/modules/agent/pi/pi-runtime.client.ts`
- Modify: `apps/api/src/modules/agent/pi/pi-session-runner.ts`
- Modify: `apps/api/test/pi-agent.integration-spec.ts`

- [x] **Step 1: Update runtime types**

In `apps/api/src/modules/agent/pi/pi-runtime.client.ts`, extend the types near the existing `PiRuntimeClient` definitions:

```ts
import type { PiRuntimeEvent, PiToolCall, PiToolName } from "@worlddock/domain/agent/pi";
import type { WorldContextRef } from "@worlddock/domain/agent/context";

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
```

Then update `PiAgentCoreRuntimeClient.runSession` to pass a default executor into the adapter:

```ts
const defaultToolExecutor: PiRuntimeToolExecutor = async (toolCall) => ({
  result: {
    error: "WorldDock tool executor is not configured.",
    toolCallId: toolCall.id,
  },
  contextEvents: [],
});

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
```

- [x] **Step 2: Move safety-gated tool execution into `PiSessionRunner` executor**

In `apps/api/src/modules/agent/pi/pi-session-runner.ts`, keep `contextEventsFromToolResult` and replace `run` with:

```ts
async *run(input: PiSessionInput): AsyncIterable<PiRuntimeEvent> {
  const disclosedAssetIds = new Set(input.context.map((ref) => ref.targetId).filter((id): id is string => Boolean(id)));

  const executeTool = async (toolCall: { id: string; name: PiToolName; arguments: Record<string, unknown> }) => {
    this.safetyGate.assertToolAllowed(toolCall, disclosedAssetIds);
    const result = await this.tools.execute(toolCall.name, toolCall.arguments);
    const contextEvents = contextEventsFromToolResult(toolCall.name, result);
    for (const contextEvent of contextEvents) {
      if (contextEvent.type === "context.used" && contextEvent.targetId) disclosedAssetIds.add(contextEvent.targetId);
    }
    return { result, contextEvents };
  };

  for await (const event of this.runtime.runSession(input, executeTool)) {
    yield event;
  }
}
```

- [x] **Step 3: Update existing runner test expectations**

In `apps/api/test/pi-agent.integration-spec.ts`, replace the first fake runtime with one that calls the provided executor:

```ts
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
```

Expected event order remains:

```ts
expect(events.map((event) => event.type)).toEqual(["tool.requested", "tool.completed", "context.used", "session.completed"]);
```

- [x] **Step 4: Run bridge tests**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- pi-agent.integration-spec.ts agent-context.integration-spec.ts
```

Expected: PASS, with no duplicate tool execution and no missing `context.used` events.

- [x] **Step 5: Commit runtime bridge**

```bash
git add apps/api/src/modules/agent/pi/pi-runtime.client.ts apps/api/src/modules/agent/pi/pi-session-runner.ts apps/api/test/pi-agent.integration-spec.ts
git commit -m "feat: bridge pi runtime tool execution"
git log -1 --format=fuller
```

---

### Task 3: Implement Real Pi Agent Adapter

**Files:**
- Modify: `apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts`
- Modify: `apps/api/src/modules/agent/pi/pi-event-adapter.ts`
- Test: `apps/api/src/modules/agent/pi/pi-agent-core.adapter.spec.ts`

- [ ] **Step 1: Replace the adapter stub with real Agent wiring**

Replace `apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts` with an implementation shaped like this:

```ts
import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, getModels, type Api, type KnownProvider, type Model, Type } from "@earendil-works/pi-ai";
import { piToolNameSchema, type PiRuntimeEvent, type PiToolName } from "@worlddock/domain/agent/pi";
import { suggestionSchema } from "@worlddock/domain";
import type { PiAgentCoreAdapter, PiRuntimeToolExecutor, PiSessionInput } from "./pi-runtime.client";

export type PiAgentCoreAdapterOptions = {
  modelProvider?: string;
  modelId?: string;
  providerApiKey?: string;
  modelOverride?: Model<Api>;
};

export function createPiAgentCoreAdapter(options: PiAgentCoreAdapterOptions): PiAgentCoreAdapter {
  const model = resolvePiModel(options);

  return async (input: PiSessionInput, emit, executeTool) => {
    emit({ type: "session.started", piSessionId: `pi_${input.runId}` });

    let completed = false;
    let failed = false;
    let lastUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const pendingContextEvents = new Map<string, PiRuntimeEvent[]>();

    const agent = new Agent({
      sessionId: input.runId,
      initialState: {
        systemPrompt: buildSystemPrompt(input),
        model,
        tools: toPiAgentTools(input.tools, pendingContextEvents, executeTool),
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: buildContextMessage(input) }],
            timestamp: Date.now(),
          },
        ],
      },
      getApiKey: (provider) => provider === options.modelProvider ? options.providerApiKey : undefined,
      toolExecution: "sequential",
    });

    agent.subscribe((event) => {
      for (const mapped of mapAgentEvent(event, pendingContextEvents)) {
        emit(mapped);
      }

      if (event.type === "message_end" && event.message.role === "assistant") {
        lastUsage = {
          inputTokens: event.message.usage.input,
          outputTokens: event.message.usage.output,
          totalTokens: event.message.usage.totalTokens,
        };
        if (event.message.stopReason === "error" || event.message.stopReason === "aborted") {
          failed = true;
          emit({
            type: "session.failed",
            code: event.message.stopReason === "aborted" ? "PI_SESSION_ABORTED" : "PI_SESSION_FAILED",
            message: event.message.errorMessage ?? "pi session failed",
          });
        }
      }

      if (event.type === "agent_end") completed = true;
    });

    await agent.prompt(input.prompt);
    await agent.waitForIdle();

    emit({ type: "usage", tokenUsage: lastUsage });
    if (!failed && completed) emit({ type: "session.completed" });
  };
}

function resolvePiModel(options: PiAgentCoreAdapterOptions): Model<Api> {
  if (options.modelOverride) return options.modelOverride;
  if (!options.modelProvider || !options.modelId || !options.providerApiKey) {
    throw new Error("PI_MODEL_PROVIDER, PI_MODEL_ID, and PI_PROVIDER_API_KEY are required for pi runtime.");
  }
  const provider = options.modelProvider as KnownProvider;
  const model = getModels(provider).find((candidate) => candidate.id === options.modelId)
    ?? getModel(provider, options.modelId as never);
  if (!model) throw new Error(`Unknown pi model ${options.modelProvider}/${options.modelId}.`);
  return model as Model<Api>;
}

function buildSystemPrompt(input: PiSessionInput) {
  return [
    "你是 WorldDock 世界观推演 Agent。",
    "你必须使用简体中文。",
    "你只能通过注册的 WorldDock tools 读取世界资料或生成 pending suggestion。",
    "不要声称已经保存、删除、发布或收费；这些危险操作必须由 WorldDock API 在用户确认后执行。",
    `运行模式：${input.mode}`,
    `用户：${input.userId}`,
    `世界：${input.worldId}`,
    input.skills.length > 0
      ? `可用技能：${input.skills.map((skill) => `${skill.name}(${skill.description})`).join("; ")}`
      : "可用技能：world-context; world-suggestion",
  ].join("\n");
}

function buildContextMessage(input: PiSessionInput) {
  return [
    "初始上下文：",
    ...input.context.map((ref) => `- [${ref.level}/${ref.kind}/${ref.source ?? "initial"}] ${ref.title}: ${ref.excerpt}`),
  ].join("\n");
}

function toPiAgentTools(
  tools: PiSessionInput["tools"],
  pendingContextEvents: Map<string, PiRuntimeEvent[]>,
  executeTool: PiRuntimeToolExecutor,
): AgentTool[] {
  return tools.map((tool): AgentTool => ({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: parametersForTool(tool.name),
    prepareArguments: (args) => args && typeof args === "object" ? args as Record<string, unknown> : {},
    execute: async (toolCallId, params) => {
      const name = piToolNameSchema.parse(tool.name);
      const toolCall = { id: toolCallId, name, arguments: params as Record<string, unknown> };
      const executed = await executeTool(toolCall);
      pendingContextEvents.set(toolCallId, executed.contextEvents);
      return {
        content: [{ type: "text", text: JSON.stringify(executed.result) }],
        details: executed.result,
      };
    },
    executionMode: "sequential",
  }));
}

function parametersForTool(name: PiToolName) {
  if (name === "get_world_manifest") return Type.Object({ worldId: Type.String() }, { additionalProperties: true });
  if (name === "search_world_assets") return Type.Object({ worldId: Type.String(), query: Type.String() }, { additionalProperties: true });
  if (name === "get_asset_brief" || name === "get_asset_detail" || name === "get_asset_source_fragments") {
    return Type.Object({ worldId: Type.String(), assetId: Type.String() }, { additionalProperties: true });
  }
  if (name === "list_repository_releases") return Type.Object({ repositoryId: Type.String() }, { additionalProperties: true });
  if (name === "propose_story_seed") {
    return Type.Object({
      title: Type.String(),
      hook: Type.Optional(Type.String()),
      conflict: Type.Optional(Type.String()),
    }, { additionalProperties: true });
  }
  return Type.Object({
    title: Type.String(),
    body: Type.Optional(Type.String()),
    summary: Type.Optional(Type.String()),
  }, { additionalProperties: true });
}

function mapAgentEvent(event: AgentEvent, pendingContextEvents: Map<string, PiRuntimeEvent[]>): PiRuntimeEvent[] {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    return [{ type: "message.delta", text: event.assistantMessageEvent.delta }];
  }
  if (event.type === "tool_execution_start") {
    return [{
      type: "tool.requested",
      toolCall: {
        id: event.toolCallId,
        name: piToolNameSchema.parse(event.toolName),
        arguments: event.args && typeof event.args === "object" ? event.args as Record<string, unknown> : {},
      },
    }];
  }
  if (event.type === "tool_execution_end") {
    const result = normalizeToolResult(event.result);
    const events: PiRuntimeEvent[] = [
      { type: "tool.completed", toolCallId: event.toolCallId, result },
      ...(pendingContextEvents.get(event.toolCallId) ?? []),
    ];
    pendingContextEvents.delete(event.toolCallId);
    const suggestion = result.suggestion;
    if (suggestion) events.push({ type: "suggestion.created", suggestion: suggestionSchema.parse(suggestion) });
    return events;
  }
  return [];
}

function normalizeToolResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const record = value as { details?: unknown };
  if (record.details && typeof record.details === "object") return record.details as Record<string, unknown>;
  return value as Record<string, unknown>;
}
```

- [ ] **Step 2: Run adapter unit test**

Run:

```bash
pnpm --filter @worlddock/api test -- pi-agent-core.adapter.spec.ts
```

Expected: PASS. The test must see `tool.requested`, `tool.completed`, `context.used`, streamed text, usage, and `session.completed`.

- [ ] **Step 3: Run provider and integration tests**

Run:

```bash
pnpm --filter @worlddock/api test -- agent.provider.spec.ts pi-agent-core.adapter.spec.ts
pnpm --filter @worlddock/api test:integration -- pi-agent.integration-spec.ts agent-context.integration-spec.ts agent.integration-spec.ts
```

Expected: PASS. Existing `new PiAgentProvider()` mock constructor can remain for unit smoke tests, but Nest production wiring with `AI_PROVIDER=pi` must use `createPiAgentCoreAdapter`.

- [ ] **Step 4: Commit real adapter**

```bash
git add apps/api/src/modules/agent/pi/pi-agent-core.adapter.ts apps/api/src/modules/agent/pi/pi-event-adapter.ts apps/api/src/modules/agent/pi/pi-agent-core.adapter.spec.ts
git commit -m "feat: wire pi agent core adapter"
git log -1 --format=fuller
```

---

### Task 4: Preserve Product Safety and Pending Suggestions

**Files:**
- Modify: `apps/api/src/modules/agent/pi/world-tools.ts`
- Modify: `apps/api/src/modules/agent/pi/safety-gate.ts`
- Modify: `apps/api/test/pi-agent.integration-spec.ts`
- Modify: `apps/api/test/agent-context.integration-spec.ts`

- [ ] **Step 1: Add a proposal tool integration test**

Append this test to `apps/api/test/pi-agent.integration-spec.ts`:

```ts
it("turns proposal tool results into pending suggestions without writing product assets", async () => {
  const runtime: PiRuntimeClient = {
    async *runSession(_input, executeTool) {
      const toolCall = {
        id: "call_propose_1",
        name: "propose_setting" as const,
        arguments: {
          title: "记忆交易许可",
          category: "制度",
          summary: "记忆交易必须经过许可。",
          body: "未经许可的记忆交易会被城市信用系统追踪。",
        },
      };
      yield { type: "tool.requested", toolCall };
      const executed = await executeTool?.(toolCall);
      yield { type: "tool.completed", toolCallId: toolCall.id, result: executed?.result ?? {} };
      const suggestion = executed?.result.suggestion;
      if (suggestion) yield { type: "suggestion.created", suggestion };
      yield { type: "session.completed" };
    },
  };
  const registry = new WorldToolRegistry();
  registry.register("propose_setting", async (input) => ({
    suggestion: {
      id: "setting_license",
      kind: "setting",
      category: String(input.category),
      title: String(input.title),
      summary: String(input.summary),
      body: String(input.body),
    },
  }));
  const runner = new PiSessionRunner(runtime, registry, new SafetyGate());

  const events = [];
  for await (const event of runner.run({
    runId: "run_1",
    userId: "user_1",
    worldId: "world_1",
    mode: "expand",
    prompt: "生成制度建议",
    context: [],
    tools: [...describeWorldTools()],
    skills: [],
  })) {
    events.push(event);
  }

  expect(events).toContainEqual({
    type: "suggestion.created",
    suggestion: {
      id: "setting_license",
      kind: "setting",
      category: "制度",
      title: "记忆交易许可",
      summary: "记忆交易必须经过许可。",
      body: "未经许可的记忆交易会被城市信用系统追踪。",
    },
  });
});
```

- [ ] **Step 2: Strengthen safety gate tests**

In `apps/api/test/agent-context.integration-spec.ts`, add:

```ts
it("allows proposal tools but blocks unknown tool names", () => {
  const gate = new SafetyGate();

  expect(() =>
    gate.assertToolAllowed({
      id: "tool_3",
      name: "propose_setting",
      arguments: { title: "许可制度", body: "必须申请许可。" },
    }),
  ).not.toThrow();

  expect(() =>
    gate.assertToolAllowed({
      id: "tool_4",
      name: "delete_world" as never,
      arguments: { worldId: "world_1" },
    }),
  ).toThrow("Blocked unsafe pi tool");
});
```

- [ ] **Step 3: Confirm proposal tools do not call `worlds.createArchiveEntry`**

Run:

```bash
pnpm --filter @worlddock/api test:integration -- pi-agent.integration-spec.ts agent-context.integration-spec.ts
```

Expected: PASS. The proposal test only observes runtime events; product asset persistence remains in `AgentService.saveSuggestion`.

- [ ] **Step 4: Commit safety coverage**

```bash
git add apps/api/test/pi-agent.integration-spec.ts apps/api/test/agent-context.integration-spec.ts apps/api/src/modules/agent/pi/world-tools.ts apps/api/src/modules/agent/pi/safety-gate.ts
git commit -m "test: lock pi tool safety boundaries"
git log -1 --format=fuller
```

---

### Task 5: Wire Frontend Context Inspector

**Files:**
- Modify: `apps/web/src/features/worlddock/api.ts`
- Modify: `apps/web/src/features/worlddock/world-dock-app.tsx`
- Modify: `apps/web/src/features/agent/context-inspector.tsx`
- Modify: `apps/web/tests/e2e/pi-agent.spec.ts`

- [ ] **Step 1: Type agent events in Web API client**

Replace the loose `AgentEvent` type in `apps/web/src/features/worlddock/api.ts` with:

```ts
export type AgentContextRef = {
  id?: string;
  kind: "world" | "archive" | "seed" | "conflict" | "repository";
  title: string;
  excerpt: string;
  targetId?: string;
  level: "manifest" | "card" | "brief" | "detail" | "source_fragment" | "release_delta";
  source: "initial" | "tool";
};

export type AgentEvent =
  | { type: "run.started"; payload: { runId: string; mode: AgentRunMode } }
  | { type: "pi.session.started"; payload: { piSessionId: string } }
  | { type: "context.used"; payload: { contextRef: AgentContextRef } }
  | { type: "message.delta"; payload: { text: string } }
  | { type: "tool.requested"; payload: { toolCall: { id: string; name: string; arguments: Record<string, unknown> } } }
  | { type: "tool.completed"; payload: { toolCallId: string; result: Record<string, unknown> } }
  | { type: "suggestion.created"; payload: { suggestionId: string; suggestion: any } }
  | { type: "run.completed"; payload: { tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number } } }
  | { type: "run.failed"; payload: { code: string; message: string } }
  | { type: "run.cancelled"; payload: { reason?: string } };
```

- [ ] **Step 2: Store streamed context refs in `world-dock-app.tsx`**

Near existing agent state, add:

```tsx
const [agentContextRefs, setAgentContextRefs] = useState<AgentContextRef[]>([]);
const [agentToolEvents, setAgentToolEvents] = useState<Array<{ id: string; label: string; status: "requested" | "completed" }>>([]);
```

Inside `startAgentRun`, before streaming:

```tsx
setAgentContextRefs([]);
setAgentToolEvents([]);
```

Inside the `streamAgentEvents` callback:

```tsx
if (event.type === "pi.session.started") {
  setAgentToolEvents((prev) => [...prev, { id: event.payload.piSessionId, label: "pi session", status: "completed" }]);
}
if (event.type === "context.used") {
  contextRefs++;
  setAgentContextRefs((prev) => [...prev, event.payload.contextRef]);
}
if (event.type === "tool.requested") {
  setAgentToolEvents((prev) => [...prev, { id: event.payload.toolCall.id, label: event.payload.toolCall.name, status: "requested" }]);
}
if (event.type === "tool.completed") {
  setAgentToolEvents((prev) => prev.map((item) =>
    item.id === event.payload.toolCallId ? { ...item, status: "completed" } : item,
  ));
}
```

When rendering the context drawer, replace the static drawer:

```tsx
{drawerOpen?.kind === "context" && (
  <ContextDrawer refs={agentContextRefs} toolEvents={agentToolEvents} />
)}
```

Add a local wrapper component if `ContextDrawer` is imported from `view-workbench.tsx` today:

```tsx
const AgentContextDrawer = ({ refs, toolEvents }: { refs: AgentContextRef[]; toolEvents: Array<{ id: string; label: string; status: "requested" | "completed" }> }) => (
  <div className="col gap-4">
    <AgentRunPanel status={agentBusy ? "running" : "completed"} tokens={runTokens}>
      <div className="col gap-2" style={{ marginTop: 12 }}>
        {toolEvents.map((tool) => (
          <span key={tool.id} className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
            {tool.label} · {tool.status}
          </span>
        ))}
      </div>
    </AgentRunPanel>
    <ContextInspector refs={refs} />
  </div>
);
```

Then render `AgentContextDrawer`.

- [ ] **Step 3: Add robust empty state to `ContextInspector`**

Update `apps/web/src/features/agent/context-inspector.tsx`:

```tsx
const LEVEL_ORDER = ["manifest", "card", "brief", "detail", "source_fragment", "release_delta"];

export function ContextInspector({ refs }: ContextInspectorProps) {
  if (refs.length === 0) {
    return (
      <section className="card" style={{ padding: 12 }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>本轮暂无上下文事件</span>
      </section>
    );
  }

  const groups = refs.reduce<Record<string, WorldContextRef[]>>((acc, ref) => {
    acc[ref.level] = [...(acc[ref.level] ?? []), ref];
    return acc;
  }, {});

  return (
    <div className="col gap-3">
      {LEVEL_ORDER.filter((level) => groups[level]?.length).map((level) => (
        <section key={level} className="card" style={{ padding: 12 }}>
          <div className="row gap-2" style={{ marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{level}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: "auto" }}>{groups[level].length}</span>
          </div>
          <div className="col gap-2">
            {groups[level].map((item, index) => (
              <div key={`${item.level}-${item.targetId ?? "world"}-${item.title}-${index}`} className="col gap-1">
                <div className="row gap-2">
                  <strong style={{ fontSize: 13 }}>{item.title}</strong>
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>{item.source}</span>
                </div>
                <span style={{ fontSize: 12, color: "var(--fg-2)" }}>{item.excerpt}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Upgrade Playwright smoke**

In `apps/web/tests/e2e/pi-agent.spec.ts`, after the existing context button assertion, add:

```ts
await page.getByRole("button", { name: /上下文/ }).click();
await expect(page.getByText("manifest")).toBeVisible();
await expect(page.getByText("回忆所").or(page.getByText("记忆可以被买卖"))).toBeVisible();
await expect(page.getByText(/pi session|search_world_assets|propose_/)).toBeVisible();
```

- [ ] **Step 5: Run web tests**

Run:

```bash
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- pi-agent.spec.ts
```

Expected: PASS. The context drawer shows real streamed context refs rather than the previous static drawer copy.

- [ ] **Step 6: Commit frontend inspector**

```bash
git add apps/web/src/features/worlddock/api.ts apps/web/src/features/worlddock/world-dock-app.tsx apps/web/src/features/agent/context-inspector.tsx apps/web/tests/e2e/pi-agent.spec.ts
git commit -m "feat: show pi agent context inspector"
git log -1 --format=fuller
```

---

### Task 6: Update Phase 5 Completion Evidence

**Files:**
- Modify: `docs/product/pi-upstream-audit.md`
- Modify: `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md`

- [ ] **Step 1: Append implementation evidence to pi upstream audit**

Append this section to `docs/product/pi-upstream-audit.md`:

```md
## WorldDock Adapter Mapping

Confirmed implementation uses `Agent` from `@earendil-works/pi-agent-core`.

WorldDock maps pi events as follows:

- `agent_start` -> `session.started`
- `message_update` with `text_delta` -> `message.delta`
- `tool_execution_start` -> `tool.requested`
- `tool_execution_end` -> `tool.completed`
- proposal tool result with `suggestion` -> `suggestion.created`
- final assistant usage -> `usage`
- normal `agent_end` -> `session.completed`
- assistant `stopReason=error|aborted` -> `session.failed`

WorldDock tool execution remains outside pi product writes. The adapter calls a WorldDock executor, the runner applies `SafetyGate`, and tool results return to pi as tool result messages.
```

- [ ] **Step 2: Mark Phase 5 complete in incomplete task record**

Replace the Phase 5 section in `docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md` with:

```md
## Phase 5: 基于 pi 的 Agent Session、工具和长世界记忆

完成状态：已完成。

完成依据：

- `docs/product/pi-upstream-audit.md`、`docs/product/pi-agent-architecture.md` 和 `docs/product/world-asset-progressive-disclosure.md` 已固定 pi upstream、架构边界和长世界渐进披露协议。
- `packages/domain/src/agent/context.ts` 和 `packages/domain/src/agent/pi.ts` 已定义 disclosure level、context ref、pi runtime event、tool call 和 session event 类型。
- `packages/db/prisma/schema.prisma` 已包含 `AgentRun.provider`、`AgentRun.piSessionId`、`ContextRef.level`、`ContextRef.source` 及对应 migration。
- `apps/api/src/modules/agent/context-builder.ts` 已按 manifest、card、brief 选择初始上下文。
- `apps/api/src/modules/agent/pi/*` 已提供真实 pi Agent adapter、runtime client、session runner、event adapter、tool registry、WorldDock tools、skill loader 和 safety gate。
- `AgentService` 已把 `pi.session.started`、`context.used`、tool events、message delta、pending suggestion、usage settlement 和失败退款串入 Agent Run SSE。
- `apps/web/src/features/agent/context-inspector.tsx` 与工作台已展示真实上下文 ref 和工具活动，pending suggestion 仍需用户确认后才写入世界资产。

验收证据：

- `pnpm --filter @worlddock/db prisma:validate`：通过。
- `pnpm --filter @worlddock/api test -- agent.provider.spec.ts pi-agent-core.adapter.spec.ts`：通过。
- `pnpm --filter @worlddock/api test:integration -- pi-agent.integration-spec.ts agent-context.integration-spec.ts agent.integration-spec.ts`：通过。
- `pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts`：通过。
- `pnpm --filter @worlddock/web test:e2e -- pi-agent.spec.ts`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm build`：通过。

剩余说明：

- Phase 5 不让 pi 直接保存、删除、发布、收费或读取本地文件；这些动作仍由 WorldDock API 在用户显式确认后执行。
- 真实模型调用依赖 `AI_PROVIDER=pi`、`PI_MODEL_PROVIDER`、`PI_MODEL_ID`、`PI_PROVIDER_API_KEY`；本地 E2E 仍可使用测试 provider 或 mock runtime 保持稳定。
```

- [ ] **Step 3: Run final verification**

Run:

```bash
pnpm --filter @worlddock/db prisma:validate
pnpm --filter @worlddock/api test -- agent.provider.spec.ts pi-agent-core.adapter.spec.ts
pnpm --filter @worlddock/api test:integration -- pi-agent.integration-spec.ts agent-context.integration-spec.ts agent.integration-spec.ts
pnpm --filter @worlddock/web test -- api.test.ts runtime-no-mock.test.ts
pnpm --filter @worlddock/web test:e2e -- pi-agent.spec.ts
pnpm lint
pnpm test
pnpm build
```

Expected: all commands pass. Record any command that cannot run with the exact reason and the last failing output line.

- [ ] **Step 4: Commit completion evidence**

```bash
git add docs/product/pi-upstream-audit.md docs/superpowers/plans/2026-05-28-alpha-incomplete-tasks.md
git commit -m "docs: mark phase 5 pi agent complete"
git log -1 --format=fuller
```

---

## Acceptance Checklist

- [ ] `AI_PROVIDER=pi` production wiring creates a `PiAgentProvider` backed by `PiAgentCoreRuntimeClient` and real `@earendil-works/pi-agent-core` `Agent`.
- [ ] pi Agent tool calls execute through WorldDock `SafetyGate` and `WorldToolRegistry`.
- [ ] `get_asset_detail` and `get_asset_source_fragments` still require prior Card or Brief disclosure in the same run.
- [ ] Proposal tools produce pending suggestions only; product writes still happen through `saveAgentSuggestion`.
- [ ] SSE includes `pi.session.started`, `context.used`, `tool.requested`, `tool.completed`, `message.delta`, `suggestion.created`, `run.completed`, and error/cancel events.
- [ ] `AgentRun.piSessionId` and `AgentRun.provider` persist for pi runs.
- [ ] Frontend context drawer shows real streamed context refs grouped by disclosure level.
- [ ] Phase 5 section in `2026-05-28-alpha-incomplete-tasks.md` is updated only after tests pass.

## Self-Review

- Spec coverage: This plan covers every Phase 5 artifact in the Alpha plan and the stale missing-items list: docs, domain types, Prisma fields, pi API module, context builder, provider switch, API tests, Web E2E, and completion evidence.
- Placeholder scan: No step relies on a blank implementation slot; every code-changing task includes concrete file paths, snippets, commands, and expected results.
- Type consistency: Runtime events remain `PiRuntimeEvent`; SSE events continue to be produced through `agentEventSchema`; frontend `AgentEvent` matches backend event names and payloads.
