import { Inject, Injectable, NotFoundException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { agentEventSchema, suggestionSchema, type AgentEvent, type TokenUsage, type WorldAsset, type WorldSuggestion } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { BillingService } from "../billing/billing.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  WORLD_REPOSITORY,
  type ArchiveEntryRecord,
  type ConflictRecord,
  type StorySeedRecord,
  type WorldRepository,
  type WorldRecord,
} from "../worlds/world.repository";
import { selectInitialWorldContext } from "./context-builder";
import { describeWorldTools } from "./pi/world-tool-registry";
import { loadWorldDockPiSkills } from "./pi/skill-loader";
import { buildDisclosureBriefs, buildDisclosureCards, buildDisclosureManifest } from "./pi/world-tools";
import { normalizeWorldSuggestion } from "./suggestion-normalizer";
import { AGENT_PROVIDER, type AgentProvider } from "./agent.provider";
import { AGENT_REPOSITORY, type AgentEventRecord, type AgentRepository, type AgentRunRecord, type AgentSuggestionRecord } from "./agent.repository";

type CreateWorldDraftInput = {
  inspiration: string;
  name?: string;
  type?: string;
  styleKw?: string;
  avoid?: string;
};

type WorldDraftTool = {
  id: string;
  label: string;
  detail: string;
};

type WorldCreationDraft = {
  suggestedName: string;
  suggestedType: string;
  styles: string[];
  coreSetting: string;
  coreConflict: string;
  directions: string[];
  firstQuestion: string;
  tools: WorldDraftTool[];
};

@Injectable()
export class AgentService {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(AGENT_PROVIDER) private readonly provider: AgentProvider,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async createRun(subject: AuthSubject, worldId: string, input: { prompt: string; mode: "expand" | "challenge" | "fork" | "polish" }) {
    await this.requireOwnedWorld(subject, worldId);
    await this.billing.assertCanReserve(subject.user.id);
    const run = await this.agents.createRun({
      worldId,
      userId: subject.user.id,
      mode: input.mode,
      prompt: input.prompt,
      model: resolveRunModel(process.env),
      provider: parseAgentProvider(process.env.AI_PROVIDER),
    });
    await this.append(run.id, 1, "run.started", { runId: run.id, mode: input.mode });
    await this.billing.reserveAgentRun(subject.user.id, run.id);
    return { run, suggestions: [] };
  }

  async generateWorldDraft(subject: AuthSubject, input: CreateWorldDraftInput): Promise<{ draft: WorldCreationDraft; tokenUsage: TokenUsage }> {
    const normalized = normalizeCreateWorldDraftInput(input);
    const prompt = buildWorldDraftPrompt(normalized);
    let text = "";
    let tokenUsage: TokenUsage = estimateDraftTokenUsage(prompt, "");
    const suggestions: WorldSuggestion[] = [];

    try {
      for await (const chunk of this.provider.stream({
        prompt,
        mode: "expand",
        runId: `draft_${Date.now()}`,
        userId: subject.user.id,
        model: resolveRunModel(process.env),
        world: {
          id: "world_draft",
          name: normalized.name || inferDraftName(normalized.inspiration),
          summary: summarizeDraftInput(normalized),
        },
        context: [{
          kind: "world",
          level: "manifest",
          source: "initial",
          title: "创建世界草稿",
          excerpt: summarizeDraftInput(normalized),
        }],
        tools: [],
        skills: [],
      })) {
        if (chunk.type === "delta") text += chunk.text;
        if (chunk.type === "suggestion") suggestions.push(chunk.suggestion);
        if (chunk.type === "usage") tokenUsage = chunk.tokenUsage;
        if (chunk.type === "failed") throw new AgentProviderFailure(chunk.code, chunk.message);
      }
    } catch (error) {
      const failure = agentFailureFromError(error);
      throw new ServiceUnavailableException({
        code: failure.code,
        message: failure.message,
      });
    }

    return {
      draft: normalizeWorldCreationDraft(parseWorldDraftJson(text), normalized, suggestions[0]),
      tokenUsage: tokenUsage.totalTokens > 0 ? tokenUsage : estimateDraftTokenUsage(prompt, text),
    };
  }

  async listEvents(subject: AuthSubject, runId: string) {
    const run = await this.requireOwnedRun(subject, runId);
    return this.agents.listEvents(run.id);
  }

  async *streamEvents(subject: AuthSubject, runId: string): AsyncGenerator<AgentEventRecord> {
    const run = await this.agents.findRunById(runId);
    if (!run) throw this.notFound("Agent run not found.");
    const world = await this.requireOwnedWorld(subject, run.worldId);

    const existingEvents = await this.agents.listEvents(run.id);
    for (const event of existingEvents) {
      yield event;
    }

    if (run.status !== "running") return;

    let sequence = existingEvents.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
    let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const context = selectInitialWorldContext({
      prompt: run.prompt,
      manifest: await buildDisclosureManifest(this.worlds, world),
      cards: await buildDisclosureCards(this.worlds, world.id),
      briefs: await buildDisclosureBriefs(this.worlds, world.id),
      maxCards: 8,
      maxBriefs: 3,
    });

    try {
      for await (const chunk of this.provider.stream({
        prompt: run.prompt,
        mode: run.mode,
        runId: run.id,
        userId: run.userId,
        model: run.model,
        world: { id: world.id, name: world.name, summary: world.summary },
        context,
        tools: [...describeWorldTools()],
        skills: loadWorldDockPiSkills(process.env),
      })) {
        const latestRun = await this.agents.findRunById(run.id);
        if (latestRun?.status === "cancelled") return;

        if (chunk.type === "context") {
          const created = await this.agents.createContextRef({ runId: run.id, ...chunk.contextRef });
          yield await this.append(run.id, sequence++, "context.used", {
            contextRef: {
              id: created.id,
              kind: created.kind,
              title: created.title,
              excerpt: created.excerpt,
              targetId: created.targetId ?? undefined,
              level: created.level ?? "card",
              source: created.source ?? "initial",
            },
          });
        }

        if (chunk.type === "pi-session-started") {
          await this.agents.updateRun(run.id, { piSessionId: chunk.piSessionId, provider: "pi" });
          yield await this.append(run.id, sequence++, "pi.session.started", { piSessionId: chunk.piSessionId });
        }

        if (chunk.type === "tool-requested") {
          yield await this.append(run.id, sequence++, "tool.requested", { toolCall: chunk.toolCall });
        }

        if (chunk.type === "tool-completed") {
          yield await this.append(run.id, sequence++, "tool.completed", { toolCallId: chunk.toolCallId, result: chunk.result });
        }

        if (chunk.type === "delta") {
          yield await this.append(run.id, sequence++, "message.delta", { text: chunk.text });
        }

        if (chunk.type === "suggestion") {
          const suggestion = normalizeWorldSuggestion(suggestionSchema.parse(chunk.suggestion));
          const created = await this.agents.createSuggestion({ runId: run.id, worldId: run.worldId, suggestion });
          yield await this.append(run.id, sequence++, "suggestion.created", { suggestionId: created.id, suggestion });
        }

        if (chunk.type === "usage") {
          tokenUsage = chunk.tokenUsage;
        }

        if (chunk.type === "failed") {
          throw new AgentProviderFailure(chunk.code, chunk.message);
        }
      }

      const latestRun = await this.agents.findRunById(run.id);
      if (latestRun?.status !== "running") return;

      const settlement = await this.billing.settleAgentRunAndComplete(run.userId, run.id, tokenUsage, resolveBillingModel(run.provider, run.model));
      if (!settlement) return;
      yield await this.append(run.id, sequence++, "run.completed", { tokenUsage });
    } catch (error) {
      const failure = agentFailureFromError(error);
      const refund = await this.billing.refundAgentRunAndFail(run.userId, run.id, failure.reason, failure);
      if (!refund) return;
      await this.notifications.safeEmitUserEvent(run.userId, {
        type: "agent_run_failed",
        title: "Agent Run 失败",
        body: failure.message,
        targetType: "agent_run",
        targetId: run.id,
        metadata: { code: failure.code, reason: failure.reason, worldId: run.worldId },
        dedupeKey: `agent-run-failed:${run.id}`,
      });
      yield await this.append(run.id, sequence++, "run.failed", { code: failure.code, message: failure.message });
    }
  }

  async cancelRun(subject: AuthSubject, runId: string) {
    const run = await this.requireOwnedRun(subject, runId);
    if (run.status !== "running") return run;

    const events = await this.agents.listEvents(run.id);
    const nextSequence = events.length + 1;
    const refund = await this.billing.refundAgentRunAndCancel(run.userId, run.id, "user_cancelled");
    if (!refund) return await this.agents.findRunById(run.id) ?? run;
    await this.append(run.id, nextSequence, "run.cancelled", { reason: "user_cancelled" });
    return await this.agents.findRunById(run.id) ?? run;
  }

  async saveSuggestion(subject: AuthSubject, suggestionId: string) {
    const suggestion = await this.requireOwnedSuggestion(subject, suggestionId);
    if (suggestion.status === "saved") {
      return {
        suggestion,
        asset: await this.findSavedSuggestionAsset(suggestion),
      };
    }

    const saved = await this.saveSuggestionAsset(suggestion.worldId, suggestion.suggestion);
    const updated = await this.agents.updateSuggestion(suggestion.id, {
      status: "saved",
      savedAssetId: saved.asset.id,
    });
    return {
      suggestion: updated ?? { ...suggestion, status: "saved" as const, savedAssetId: saved.asset.id },
      asset: saved.asset,
    };
  }

  async editSuggestion(subject: AuthSubject, suggestionId: string, input: { suggestion: unknown }) {
    const suggestion = await this.requireOwnedSuggestion(subject, suggestionId);
    if (suggestion.status !== "pending" && suggestion.status !== "edited") return suggestion;
    return this.agents.updateSuggestion(suggestion.id, {
      status: "edited",
      suggestion: normalizeWorldSuggestion(suggestionSchema.parse(input.suggestion)),
    });
  }

  async discardSuggestion(subject: AuthSubject, suggestionId: string) {
    const suggestion = await this.requireOwnedSuggestion(subject, suggestionId);
    return this.agents.updateSuggestion(suggestion.id, { status: "discarded" });
  }

  private async saveSuggestionAsset(worldId: string, suggestion: WorldSuggestion): Promise<{ asset: WorldAsset }> {
    const normalized = normalizeWorldSuggestion(suggestion);
    if (normalized.kind === "setting") {
      const entry = await this.worlds.createArchiveEntry({
        worldId,
        title: normalized.title,
        category: normalized.category,
        summary: normalized.summary,
        body: normalized.body,
        relations: normalized.relations ?? [],
      });
      return { asset: archiveEntryToWorldAsset(entry) };
    }

    if (normalized.kind === "seed") {
      const seed = await this.worlds.createStorySeed({
        worldId,
        title: normalized.title,
        hook: normalized.hook,
        trigger: normalized.trigger,
        conflict: normalized.conflict,
        protagonists: normalized.protagonists,
        questions: normalized.questions,
      });
      return { asset: storySeedToWorldAsset(seed) };
    }

    const conflict = await this.worlds.createConflict({
      worldId,
      title: normalized.title,
      summary: normalized.summary,
      body: normalized.body,
      related: normalized.related ?? [],
      derivedSeeds: normalized.derivedSeeds ?? [],
    });
    return { asset: conflictToWorldAsset(conflict) };
  }

  private async findSavedSuggestionAsset(suggestion: AgentSuggestionRecord): Promise<WorldAsset | null> {
    if (!suggestion.savedAssetId) return null;

    if (suggestion.suggestion.kind === "setting") {
      const entry = (await this.worlds.listArchiveEntries(suggestion.worldId))
        .find((item) => item.id === suggestion.savedAssetId);
      return entry ? archiveEntryToWorldAsset(entry) : null;
    }

    if (suggestion.suggestion.kind === "seed") {
      const seed = (await this.worlds.listStorySeeds(suggestion.worldId))
        .find((item) => item.id === suggestion.savedAssetId);
      return seed ? storySeedToWorldAsset(seed) : null;
    }

    const conflict = (await this.worlds.listConflicts(suggestion.worldId))
      .find((item) => item.id === suggestion.savedAssetId);
    return conflict ? conflictToWorldAsset(conflict) : null;
  }

  private async requireOwnedRun(subject: AuthSubject, runId: string): Promise<AgentRunRecord> {
    const run = await this.agents.findRunById(runId);
    if (!run) throw this.notFound("Agent run not found.");
    await this.requireOwnedWorld(subject, run.worldId);
    return run;
  }

  private async requireOwnedSuggestion(subject: AuthSubject, suggestionId: string) {
    const suggestion = await this.agents.findSuggestionById(suggestionId);
    if (!suggestion) throw this.notFound("Agent suggestion not found.");
    await this.requireOwnedWorld(subject, suggestion.worldId);
    return suggestion;
  }

  private async requireOwnedWorld(subject: AuthSubject, worldId: string): Promise<WorldRecord> {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound("World not found.");
    if (world.ownerId !== subject.user.id) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not have access to this world." });
    }
    return world;
  }

  private async append(runId: string, sequence: number, type: AgentEvent["type"], payload: unknown) {
    const event = agentEventSchema.parse({
      id: "evt_pending",
      runId,
      type,
      sequence,
      createdAt: new Date().toISOString(),
      payload,
    });
    return this.agents.appendEvent({ runId, type: event.type, sequence, payload: event.payload });
  }

  private notFound(message: string) {
    return new NotFoundException({ code: "NOT_FOUND", message });
  }
}

const DEFAULT_WORLD_DRAFT_TOOLS: WorldDraftTool[] = [
  { id: "ctx", label: "分析灵感主题", detail: "提取核心概念、类型线索与世界运行规则" },
  { id: "model", label: "调用真实 Agent", detail: "让当前模型生成名称、设定、矛盾与追问" },
  { id: "shape", label: "整理世界雏形", detail: "收束为可确认的创建草稿" },
];

function normalizeCreateWorldDraftInput(input: CreateWorldDraftInput): CreateWorldDraftInput {
  return {
    inspiration: input.inspiration.trim(),
    name: cleanOptional(input.name),
    type: cleanOptional(input.type),
    styleKw: cleanOptional(input.styleKw),
    avoid: cleanOptional(input.avoid),
  };
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildWorldDraftPrompt(input: CreateWorldDraftInput) {
  return [
    "请基于用户的初始灵感生成一个 WorldDock 创建世界雏形。",
    "只返回一个 JSON 对象，不要 Markdown，不要解释。",
    "JSON 字段必须为：suggestedName, suggestedType, styles, coreSetting, coreConflict, directions, firstQuestion。",
    "styles 和 directions 必须是简体中文字符串数组；directions 给 3 条。",
    "风格要具体，设定要可继续推演，避免套话。",
    `初始灵感：${input.inspiration}`,
    input.name ? `用户给定名称：${input.name}` : "",
    input.type ? `用户给定类型：${input.type}` : "",
    input.styleKw ? `风格关键词：${input.styleKw}` : "",
    input.avoid ? `不想要的方向：${input.avoid}` : "",
  ].filter(Boolean).join("\n");
}

function summarizeDraftInput(input: CreateWorldDraftInput) {
  return [
    `初始灵感：${input.inspiration}`,
    input.styleKw ? `风格关键词：${input.styleKw}` : "",
    input.avoid ? `避开的方向：${input.avoid}` : "",
  ].filter(Boolean).join("\n");
}

function parseWorldDraftJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidates = [
    fenced,
    trimmed,
    extractJsonObject(trimmed),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Try the next candidate; model output may include prose around the JSON.
    }
  }
  return null;
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeWorldCreationDraft(
  parsed: Record<string, unknown> | null,
  input: CreateWorldDraftInput,
  suggestion?: WorldSuggestion,
): WorldCreationDraft {
  const styles = nonEmptyStrings(parsed?.styles).slice(0, 6);
  const directions = nonEmptyStrings(parsed?.directions).slice(0, 3);
  const fallbackStyles = parseStyleTags(input.styleKw);
  const coreSetting = firstNonEmptyString([
    stringField(parsed, "coreSetting", "core_setting", "setting"),
    suggestionExcerpt(suggestion),
    `基于「${input.inspiration}」，这个世界已经具备一个可继续扩展的核心秩序。`,
  ]);

  return {
    suggestedName: firstNonEmptyString([
      input.name,
      stringField(parsed, "suggestedName", "suggested_name", "name"),
      suggestion?.title,
      inferDraftName(input.inspiration),
    ]),
    suggestedType: firstNonEmptyString([
      input.type,
      stringField(parsed, "suggestedType", "suggested_type", "type"),
      fallbackStyles.length > 0 ? fallbackStyles.join(" / ") : undefined,
      "未分类世界",
    ]),
    styles: styles.length > 0 ? styles : (fallbackStyles.length > 0 ? fallbackStyles : ["待探索"]),
    coreSetting,
    coreConflict: firstNonEmptyString([
      stringField(parsed, "coreConflict", "core_conflict", "conflict"),
      "这个世界的公共秩序会持续挤压个体选择，迫使角色在安全、自由与代价之间取舍。",
    ]),
    directions: directions.length > 0 ? directions : [
      "梳理核心制度如何运转，以及谁从中获益",
      "寻找最容易破坏秩序的边缘角色或灰色市场",
      "设计一个能暴露世界矛盾的第一幕事件",
    ],
    firstQuestion: firstNonEmptyString([
      stringField(parsed, "firstQuestion", "first_question", "question"),
      `你希望「${inferDraftName(input.inspiration)}」的核心异常更像自然规律、社会制度，还是某个隐秘组织刻意维持的结果？`,
    ]),
    tools: DEFAULT_WORLD_DRAFT_TOOLS,
  };
}

function stringField(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function nonEmptyStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

function firstNonEmptyString(values: Array<string | undefined>) {
  return values.find((value) => value && value.trim())?.trim() ?? "";
}

function suggestionExcerpt(suggestion?: WorldSuggestion) {
  if (!suggestion) return undefined;
  if (suggestion.kind === "seed") return suggestion.hook || suggestion.conflict;
  return suggestion.summary || suggestion.body;
}

function parseStyleTags(styleKw?: string) {
  return (styleKw ?? "")
    .split(/[,\s，、·]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function inferDraftName(inspiration: string) {
  const compact = inspiration
    .replace(/\s+/g, "")
    .replace(/[。！？!?，,；;：:].*$/, "");
  if (!compact) return "未命名世界";
  return compact.length > 8 ? compact.slice(0, 8) : compact;
}

function estimateDraftTokenUsage(prompt: string, output: string): TokenUsage {
  const inputTokens = Math.max(1, Math.ceil(prompt.length / 2));
  const outputTokens = Math.max(1, Math.ceil(output.length / 2));
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

class AgentProviderFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reason = code.toLowerCase(),
  ) {
    super(message);
  }
}

function agentFailureFromError(error: unknown) {
  if (error instanceof AgentProviderFailure) {
    return { code: error.code, message: error.message, reason: error.reason };
  }
  return {
    code: "MODEL_UNAVAILABLE",
    message: "Agent provider is unavailable.",
    reason: "model_unavailable",
  };
}

function parseAgentProvider(value: string | undefined): AgentRunRecord["provider"] {
  if (value === "pi" || value === "vercel-ai" || value === "mock" || value === "openai") return value;
  return "openai";
}

function resolveRunModel(env: Record<string, string | undefined>) {
  if (env.AI_PROVIDER === "pi") return env.PI_MODEL_ID ?? env.AI_MODEL ?? null;
  if (env.AI_PROVIDER === "mock") return "mock";
  return env.AI_MODEL ?? null;
}

function resolveBillingModel(provider: AgentRunRecord["provider"], model: string | null | undefined) {
  if (provider === "mock" || !model || model === "mock") return { provider: "openai-compatible", model: "qwen3-32b" };
  if (model.startsWith("openai/")) return { provider: "openai", model: model.replace("openai/", "") };
  if (model.startsWith("anthropic/")) return { provider: "anthropic", model: model.replace("anthropic/", "") };
  if (model.startsWith("gpt-")) return { provider: "openai", model };
  if (model.startsWith("claude")) return { provider: "anthropic", model };
  return { provider: "openai-compatible", model };
}

function archiveEntryToWorldAsset(entry: ArchiveEntryRecord): WorldAsset {
  return {
    id: entry.id,
    worldId: entry.worldId,
    kind: "setting",
    title: entry.title,
    category: entry.category,
    summary: entry.summary,
    body: entry.body,
    payload: { relations: entry.relations ?? [] },
    position: entry.position ?? 0,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function storySeedToWorldAsset(seed: StorySeedRecord): WorldAsset {
  return {
    id: seed.id,
    worldId: seed.worldId,
    kind: "seed",
    title: seed.title,
    category: "故事种子",
    summary: seed.hook,
    body: seed.conflict,
    payload: {
      hook: seed.hook,
      trigger: seed.trigger,
      conflict: seed.conflict,
      protagonists: seed.protagonists,
      questions: seed.questions ?? [],
    },
    position: seed.position ?? 0,
    createdAt: seed.createdAt.toISOString(),
    updatedAt: seed.updatedAt.toISOString(),
  };
}

function conflictToWorldAsset(conflict: ConflictRecord): WorldAsset {
  return {
    id: conflict.id,
    worldId: conflict.worldId,
    kind: "conflict",
    title: conflict.title,
    category: "冲突",
    summary: conflict.summary,
    body: conflict.body,
    payload: {
      related: conflict.related ?? [],
      derivedSeeds: conflict.derivedSeeds ?? [],
    },
    position: conflict.position ?? 0,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
  };
}
