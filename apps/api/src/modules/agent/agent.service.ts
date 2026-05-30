import { Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { agentEventSchema, suggestionSchema, type AgentEvent, type TokenUsage, type WorldSuggestion } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { BillingService } from "../billing/billing.service";
import { WORLD_REPOSITORY, type WorldRepository, type WorldRecord } from "../worlds/world.repository";
import { selectInitialWorldContext } from "./context-builder";
import { describeWorldTools } from "./pi/world-tool-registry";
import { loadWorldDockPiSkills } from "./pi/skill-loader";
import { buildDisclosureBriefs, buildDisclosureCards, buildDisclosureManifest } from "./pi/world-tools";
import { AGENT_PROVIDER, type AgentProvider } from "./agent.provider";
import { AGENT_REPOSITORY, type AgentEventRecord, type AgentRepository, type AgentRunRecord } from "./agent.repository";

@Injectable()
export class AgentService {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(AGENT_PROVIDER) private readonly provider: AgentProvider,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    private readonly billing: BillingService,
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
          const suggestion = suggestionSchema.parse(chunk.suggestion);
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

      const settlement = await this.billing.settleAgentRun(run.userId, run.id, tokenUsage, resolveBillingModel(run.provider, run.model));
      if (!settlement) return;

      const completed = await this.agents.updateRunIfStatus(run.id, "running", {
        status: "completed",
        tokenUsage,
        completedAt: new Date(),
      });
      if (!completed) return;
      yield await this.append(run.id, sequence++, "run.completed", { tokenUsage });
    } catch (error) {
      const failure = agentFailureFromError(error);
      const refund = await this.billing.refundAgentRun(run.userId, run.id, failure.reason);
      if (!refund) return;

      const failed = await this.agents.updateRunIfStatus(run.id, "running", {
        status: "failed",
        failedAt: new Date(),
        errorCode: failure.code,
        errorMessage: failure.message,
      });
      if (!failed) return;
      yield await this.append(run.id, sequence++, "run.failed", { code: failure.code, message: failure.message });
    }
  }

  async cancelRun(subject: AuthSubject, runId: string) {
    const run = await this.requireOwnedRun(subject, runId);
    if (run.status !== "running") return run;

    const events = await this.agents.listEvents(run.id);
    const nextSequence = events.length + 1;
    const refund = await this.billing.refundAgentRun(run.userId, run.id, "user_cancelled");
    if (!refund) return await this.agents.findRunById(run.id) ?? run;

    const cancelled = await this.agents.updateRunIfStatus(run.id, "running", {
      status: "cancelled",
      cancelledAt: new Date(),
    });
    if (!cancelled) return await this.agents.findRunById(run.id) ?? run;
    await this.append(run.id, nextSequence, "run.cancelled", { reason: "user_cancelled" });
    return cancelled;
  }

  async saveSuggestion(subject: AuthSubject, suggestionId: string) {
    const suggestion = await this.requireOwnedSuggestion(subject, suggestionId);
    if (suggestion.status === "saved") return suggestion;

    const savedAssetId = await this.saveSuggestionAsset(suggestion.worldId, suggestion.suggestion);
    return this.agents.updateSuggestion(suggestion.id, { status: "saved", savedAssetId });
  }

  async editSuggestion(subject: AuthSubject, suggestionId: string, input: { suggestion: unknown }) {
    const suggestion = await this.requireOwnedSuggestion(subject, suggestionId);
    if (suggestion.status !== "pending" && suggestion.status !== "edited") return suggestion;
    return this.agents.updateSuggestion(suggestion.id, {
      status: "edited",
      suggestion: suggestionSchema.parse(input.suggestion),
    });
  }

  async discardSuggestion(subject: AuthSubject, suggestionId: string) {
    const suggestion = await this.requireOwnedSuggestion(subject, suggestionId);
    return this.agents.updateSuggestion(suggestion.id, { status: "discarded" });
  }

  private async saveSuggestionAsset(worldId: string, suggestion: WorldSuggestion) {
    if (suggestion.kind === "setting") {
      const entry = await this.worlds.createArchiveEntry({
        worldId,
        title: suggestion.title,
        category: suggestion.category,
        summary: suggestion.summary,
        body: suggestion.body,
        relations: suggestion.relations ?? [],
      });
      return entry.id;
    }

    if (suggestion.kind === "seed") {
      const seed = await this.worlds.createStorySeed({
        worldId,
        title: suggestion.title,
        hook: suggestion.hook,
        trigger: suggestion.trigger,
        conflict: suggestion.conflict,
        protagonists: suggestion.protagonists,
        questions: suggestion.questions,
      });
      return seed.id;
    }

    const conflict = await this.worlds.createConflict({
      worldId,
      title: suggestion.title,
      summary: suggestion.summary,
      body: suggestion.body,
      related: suggestion.related ?? [],
      derivedSeeds: suggestion.derivedSeeds ?? [],
    });
    return conflict.id;
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
