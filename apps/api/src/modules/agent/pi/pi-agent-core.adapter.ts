import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, getModels, Type, type Api, type KnownProvider, type Model } from "@earendil-works/pi-ai";
import { suggestionSchema } from "@worlddock/domain";
import { piToolNameSchema, type PiRuntimeEvent, type PiToolName } from "@worlddock/domain/agent/pi";
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
    let failure: { code: string; message: string } | null = null;
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
      getApiKey: (provider) => (provider === options.modelProvider ? options.providerApiKey : undefined),
      toolExecution: "sequential",
    });

    const emitFailureOnce = (code: string, message: string) => {
      if (failure) return;
      failure = { code, message };
      emit({ type: "session.failed", code, message });
      agent.abort();
    };

    agent.subscribe((event) => {
      if (event.type === "agent_end") completed = true;
      if (failure) return;

      for (const mapped of mapAgentEvent(event, pendingContextEvents)) {
        if (mapped.type === "session.failed") {
          emitFailureOnce(mapped.code, mapped.message);
          return;
        }
        emit(mapped);
      }

      if (failure) return;

      if (event.type === "message_end" && event.message.role === "assistant") {
        lastUsage = {
          inputTokens: event.message.usage.input,
          outputTokens: event.message.usage.output,
          totalTokens: event.message.usage.totalTokens,
        };

        if (event.message.stopReason === "error" || event.message.stopReason === "aborted") {
          emitFailureOnce(
            event.message.stopReason === "aborted" ? "PI_SESSION_ABORTED" : "PI_SESSION_FAILED",
            event.message.errorMessage ?? "pi session failed",
          );
        }
      }
    });

    await agent.prompt(input.prompt);
    await agent.waitForIdle();

    if (failure) return;
    emit({ type: "usage", tokenUsage: lastUsage });
    if (completed) emit({ type: "session.completed" });
  };
}

function resolvePiModel(options: PiAgentCoreAdapterOptions): Model<Api> {
  if (options.modelOverride) return options.modelOverride;
  if (!options.modelProvider || !options.modelId || !options.providerApiKey) {
    throw new Error("PI_MODEL_PROVIDER, PI_MODEL_ID, and PI_PROVIDER_API_KEY are required for pi runtime.");
  }

  const provider = options.modelProvider as KnownProvider;
  const model = getModels(provider).find((candidate) => candidate.id === options.modelId) ?? getModel(provider, options.modelId as never);
  if (!model) throw new Error(`Unknown pi model ${options.modelProvider}/${options.modelId}.`);
  return model as Model<Api>;
}

export function buildSystemPrompt(input: PiSessionInput) {
  return [
    "你是 WorldDock 世界观推演 Agent。",
    "你必须使用简体中文。",
    "你只能通过注册的 WorldDock tools 读取世界资料或生成 pending suggestion。",
    "调用 get_asset_brief、get_asset_detail 或 get_asset_source_fragments 时，assetId 必须使用上下文或工具结果中明确标出的 assetId/targetId；不要把 level/kind/source 标签当作 assetId。",
    "生成 propose_setting 前必须先判断资产分类，并在 categoryReason 中说明：按设定本体分类，不按正文偶然提到的对象分类；运输机制、成本、窗口、约束属于世界规则；企业、组织、机构、政府、派系属于势力。",
    "不要声称已经保存、删除、发布或收费；这些危险操作必须由 WorldDock API 在用户确认后执行。",
    `世界：${input.worldId}`,
    input.skills.length > 0
      ? `可用技能：${input.skills.map((skill) => `${skill.name}(${skill.description})`).join("; ")}`
      : "可用技能：world-context; world-suggestion",
  ].join("\n");
}

export function buildContextMessage(input: PiSessionInput) {
  return [
    "初始上下文：",
    ...input.context.map((ref) => {
      const id = ref.targetId
        ? `${ref.kind === "world" ? "worldId" : "assetId"}=${ref.targetId}; targetId=${ref.targetId}; `
        : "";
      return `- level=${ref.level}; kind=${ref.kind}; source=${ref.source ?? "initial"}; ${id}title=${ref.title}: ${ref.excerpt}`;
    }),
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
    parameters: parametersForTool(tool.name, tool.inputSchema),
    prepareArguments: (args) => (args && typeof args === "object" ? args as Record<string, unknown> : {}),
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

function parametersForTool(name: PiToolName, inputSchema?: Record<string, unknown>) {
  const schemaParameters = parametersFromInputSchema(inputSchema);
  if (schemaParameters) return schemaParameters;

  if (name === "get_world_manifest") return Type.Object({ worldId: Type.String() }, { additionalProperties: true });
  if (name === "search_world_assets") return Type.Object({ worldId: Type.String(), query: Type.String() }, { additionalProperties: true });
  if (name === "get_asset_brief" || name === "get_asset_detail" || name === "get_asset_source_fragments") {
    return Type.Object({ worldId: Type.String(), assetId: Type.String() }, { additionalProperties: true });
  }
  if (name === "list_local_releases" || name === "propose_release_notes") {
    return Type.Object({ worldId: Type.String() }, { additionalProperties: true });
  }
  if (name === "propose_story_seed") {
    return Type.Object(
      {
        title: Type.String(),
        hook: Type.Optional(Type.String()),
        conflict: Type.Optional(Type.String()),
      },
      { additionalProperties: true },
    );
  }
  return Type.Object(
    {
      title: Type.String(),
      body: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
    },
    { additionalProperties: true },
  );
}

function parametersFromInputSchema(inputSchema: Record<string, unknown> | undefined) {
  if (!inputSchema || inputSchema.type !== "object") return null;
  const required = inputSchema.required;
  if (!Array.isArray(required) || !required.every((field): field is string => typeof field === "string")) return null;

  return Type.Object(
    Object.fromEntries(required.map((field) => [field, Type.String()])),
    { additionalProperties: true },
  );
}

function mapAgentEvent(event: AgentEvent, pendingContextEvents: Map<string, PiRuntimeEvent[]>): PiRuntimeEvent[] {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    return [{ type: "message.delta", text: event.assistantMessageEvent.delta }];
  }

  if (event.type === "tool_execution_start") {
    return [
      {
        type: "tool.requested",
        toolCall: {
          id: event.toolCallId,
          name: piToolNameSchema.parse(event.toolName),
          arguments: event.args && typeof event.args === "object" ? event.args as Record<string, unknown> : {},
        },
      },
    ];
  }

  if (event.type === "tool_execution_end") {
    if (event.isError) {
      pendingContextEvents.delete(event.toolCallId);
      return [
        {
          type: "session.failed",
          code: "PI_TOOL_EXECUTION_FAILED",
          message: `WorldDock tool ${event.toolName} failed.`,
        },
      ];
    }

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
