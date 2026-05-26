import { Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { agentEventSchema, suggestionSchema, type AgentEvent, type TokenUsage, type WorldSuggestion } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { BillingService } from "../billing/billing.service";
import { WORLD_REPOSITORY, type WorldRepository, type WorldRecord } from "../worlds/world.repository";
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
      model: process.env.AI_MODEL ?? "mock",
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

    try {
      for await (const chunk of this.provider.stream({
        prompt: run.prompt,
        mode: run.mode,
        world: { name: world.name, summary: world.summary },
      })) {
        const latestRun = await this.agents.findRunById(run.id);
        if (latestRun?.status === "cancelled") return;

        if (chunk.type === "context") {
          const created = await this.agents.createContextRef({ runId: run.id, ...chunk.contextRef });
          yield await this.append(run.id, sequence++, "context.used", {
            contextRef: { id: created.id, kind: created.kind, title: created.title, excerpt: created.excerpt, targetId: created.targetId ?? undefined },
          });
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
      }

      await this.agents.updateRun(run.id, {
        status: "completed",
        tokenUsage,
        completedAt: new Date(),
      });
      await this.billing.settleAgentRun(run.userId, run.id, tokenUsage);
      yield await this.append(run.id, sequence++, "run.completed", { tokenUsage });
    } catch {
      await this.agents.updateRun(run.id, {
        status: "failed",
        failedAt: new Date(),
        errorCode: "MODEL_UNAVAILABLE",
        errorMessage: "Agent provider is unavailable.",
      });
      await this.billing.refundAgentRun(run.userId, run.id, "model_unavailable");
      yield await this.append(run.id, sequence++, "run.failed", { code: "MODEL_UNAVAILABLE", message: "Agent provider is unavailable." });
    }
  }

  async cancelRun(subject: AuthSubject, runId: string) {
    const run = await this.requireOwnedRun(subject, runId);
    if (run.status !== "running") return run;

    const events = await this.agents.listEvents(run.id);
    const nextSequence = events.length + 1;
    const cancelled = await this.agents.updateRun(run.id, {
      status: "cancelled",
      cancelledAt: new Date(),
    });
    await this.billing.refundAgentRun(run.userId, run.id, "user_cancelled");
    await this.append(run.id, nextSequence, "run.cancelled", { reason: "user_cancelled" });
    return cancelled ?? run;
  }

  async saveSuggestion(subject: AuthSubject, suggestionId: string) {
    const suggestion = await this.requireOwnedSuggestion(subject, suggestionId);
    if (suggestion.status === "saved") return suggestion;

    const savedAssetId = await this.saveSuggestionAsset(suggestion.worldId, suggestion.suggestion);
    return this.agents.updateSuggestion(suggestion.id, { status: "saved", savedAssetId });
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
