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
      getApiKey: (provider) => (provider === options.modelProvider ? options.providerApiKey : undefined),
      toolExecution: "sequential",
    });

    agent.subscribe((event) => {
      for (const mapped of mapAgentEvent(event, pendingContextEvents)) {
        if (mapped.type === "session.failed") failed = true;
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
  const model = getModels(provider).find((candidate) => candidate.id === options.modelId) ?? getModel(provider, options.modelId as never);
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
  if (name === "list_repository_releases") return Type.Object({ repositoryId: Type.String() }, { additionalProperties: true });
  if (name === "propose_release_notes") return Type.Object({ repositoryId: Type.String() }, { additionalProperties: true });
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
          message: `WorldDock tool ${event.toolName} failed: ${toolErrorMessage(event.result)}`,
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

function toolErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return "tool execution failed";
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return "tool execution failed";
  const text = content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as { type?: unknown; text?: unknown };
      return record.type === "text" && typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || "tool execution failed";
}

function normalizeToolResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const record = value as { details?: unknown };
  if (record.details && typeof record.details === "object") return record.details as Record<string, unknown>;
  return value as Record<string, unknown>;
}
