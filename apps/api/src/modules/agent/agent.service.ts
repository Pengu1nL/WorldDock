import { ConflictException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { agentEventSchema, suggestionSchema, type AgentEvent, type TokenUsage, type WorldAsset, type WorldSuggestion } from "@worlddock/domain";
import {
  AGENT_SESSIONS_REPOSITORY,
  type AgentSessionRecord,
  type CreateAgentSessionContextItemInput,
  type AgentSessionsRepository,
} from "../agent-sessions/agent-sessions.repository";
import { OfficialAssetsService, type CreateOfficialAssetInput } from "../official-assets/official-assets.service";
import { PotentialAssetsService } from "../potential-assets/potential-assets.service";
import type { PotentialAssetRecord } from "../potential-assets/potential-assets.repository";
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
import { loadSessionPiSkills } from "./pi/session-skill-loader";
import { DEFAULT_PI_SESSION_POLICY, type PiSessionPolicy } from "./pi/safety-gate";
import { buildDisclosureBriefs, buildDisclosureCards, buildDisclosureManifest } from "./pi/world-tools";
import { normalizeWorldSuggestion } from "./suggestion-normalizer";
import { AGENT_PROVIDER, type AgentProvider, type AgentProviderChunk, type AgentProviderInput } from "./agent.provider";
import { AGENT_REPOSITORY, type AgentEventRecord, type AgentRepository, type AgentRunRecord, type AgentSuggestionRecord } from "./agent.repository";

const LEGACY_AGENT_RUN_MODE: AgentRunRecord["mode"] = "expand";

type AgentProviderChunkContext = Extract<AgentProviderChunk, { type: "context" }>["contextRef"];
type SessionContextItemFromProvider = Omit<CreateAgentSessionContextItemInput, "sessionId" | "targetId"> & {
  targetId?: string | null;
  source: NonNullable<AgentProviderChunkContext["source"]>;
};
type AgentProviderSessionConfig = Pick<AgentProviderInput, "policy" | "tools" | "skills">;

function buildAgentProviderSessionConfig(
  policy: PiSessionPolicy,
  env: { PI_SKILLS_DIR?: string },
): AgentProviderSessionConfig {
  return {
    policy,
    tools: [...describeWorldTools(policy)],
    skills: loadPiSkillsForPolicy(policy, env.PI_SKILLS_DIR),
  };
}

function policyForSession(session: Pick<AgentSessionRecord, "kind">): PiSessionPolicy {
  if (session.kind === "asset_edit") return { kind: "asset_edit" };
  if (session.kind === "consistency_repair") return { kind: "consistency_repair" };
  return DEFAULT_PI_SESSION_POLICY;
}

function loadPiSkillsForPolicy(policy: PiSessionPolicy, skillsDir?: string) {
  if (policy.kind === "asset_edit") {
    return loadSessionPiSkills({ kind: "asset_edit", skillsDir });
  }
  if (policy.kind === "consistency_repair") {
    return loadSessionPiSkills({ kind: "consistency_repair", skillsDir });
  }
  return loadSessionPiSkills({ kind: "world_exploration", intent: policy.intent, skillsDir });
}

type CreateWorldDraftInput = {
  inspiration: string;
  name?: string;
  type?: string;
  styleKw?: string;
  avoid?: string;
};

type PromotePotentialAssetInput = {
  name?: string;
  markdown?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

type WorldDraftTool = {
  id: string;
  label: string;
  detail: string;
};

type WorldCreationDraft = {
  suggestedName: string;
  suggestedType: string;
  shortSummary: string;
  styles: string[];
  coreSetting: string;
  coreConflict: string;
  directions: string[];
  firstQuestion: string;
  tools: WorldDraftTool[];
};

@Injectable()
export class AgentService {
  private readonly runAbortControllers = new Map<string, AbortController>();
  private readonly activeSessionRunStreams = new Map<string, Promise<void>>();

  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(AGENT_PROVIDER) private readonly provider: AgentProvider,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Optional() @Inject(AGENT_SESSIONS_REPOSITORY) private readonly sessions?: AgentSessionsRepository,
    @Optional() @Inject(PotentialAssetsService) private readonly potentialAssets?: PotentialAssetsService,
    @Optional() @Inject(OfficialAssetsService) private readonly officialAssets?: OfficialAssetsService,
  ) {}

  async createRun(worldId: string, input: { prompt: string }) {
    await this.requireWorld(worldId);
    const run = await this.agents.createRun({
      worldId,
      mode: LEGACY_AGENT_RUN_MODE,
      prompt: input.prompt,
      model: resolveRunModel(process.env),
      provider: parseAgentProvider(process.env.AI_PROVIDER),
    });
    await this.append(run.id, 1, "run.started", { runId: run.id });
    return { run, suggestions: [] };
  }

  async createSessionRun(worldId: string, sessionId: string, input: { prompt: string }) {
    await this.requireWorld(worldId);
    const sessions = this.requireSessionsRepository();
    const session = await sessions.findSessionForWorld(worldId, sessionId);
    if (!session) throw this.notFound("Agent session not found.");

    const run = await this.agents.createRun({
      worldId,
      sessionId,
      mode: LEGACY_AGENT_RUN_MODE,
      prompt: input.prompt,
      model: resolveRunModel(process.env),
      provider: parseAgentProvider(process.env.AI_PROVIDER),
    });
    await sessions.appendMessageAtEnd({
      sessionId,
      role: "user",
      content: input.prompt,
      status: "complete",
      metadata: { runId: run.id },
    });
    await this.append(run.id, 1, "run.started", { runId: run.id, sessionId });
    return { run };
  }

  async promotePotentialAsset(worldId: string, potentialAssetId: string, input: PromotePotentialAssetInput) {
    await this.requireWorld(worldId);
    const potentialAssets = this.requirePotentialAssetsService();
    const officialAssets = this.requireOfficialAssetsService();
    const potentialAsset = await potentialAssets.getForWorld(worldId, potentialAssetId);
    if (potentialAsset.status !== "active") throw this.potentialAssetNotActive();

    const sourceMetadata = {
      sourcePotentialAssetId: potentialAsset.id,
      sourceSessionId: potentialAsset.sessionId,
      sourceRunId: potentialAsset.runId,
    };
    const officialAssetId = officialAssetIdForPotentialAsset(potentialAsset.id);
    const createAssetInput: CreateOfficialAssetInput = {
      id: officialAssetId,
      type: potentialAsset.type,
      name: cleanOptional(input.name) ?? potentialAsset.title,
      summary: potentialAsset.summary,
      markdown: input.markdown,
      tags: input.tags ?? [],
      metadata: {
        ...(input.metadata ?? {}),
        ...sourceMetadata,
      },
    };
    let created: Awaited<ReturnType<OfficialAssetsService["createAsset"]>>;
    try {
      created = await officialAssets.createAsset(worldId, createAssetInput);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw this.potentialAssetNotActive();
      throw error;
    }
    const depositionRun = await this.createCompletedAssetDepositionRun(
      worldId,
      potentialAsset,
      created.asset.id,
      createAssetInput,
    );
    const promotedPotentialAsset = await potentialAssets.markPromoted(worldId, potentialAsset.id, created.asset.id, {
      ...sourceMetadata,
      officialAssetId: created.asset.id,
      depositionRunId: depositionRun.id,
      promotedAt: new Date().toISOString(),
    });

    return {
      ...created,
      potentialAsset: promotedPotentialAsset,
      depositionRun,
    };
  }

  async generateWorldDraft(input: CreateWorldDraftInput): Promise<{ draft: WorldCreationDraft; tokenUsage: TokenUsage }> {
    const normalized = normalizeCreateWorldDraftInput(input);
    const prompt = buildWorldDraftPrompt(normalized);
    let text = "";
    let tokenUsage: TokenUsage = estimateDraftTokenUsage(prompt, "");
    const suggestions: WorldSuggestion[] = [];

    try {
      for await (const chunk of this.provider.stream({
        prompt,
        runId: `draft_${Date.now()}`,
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

  async listEvents(runId: string) {
    const run = await this.requireRun(runId);
    return this.agents.listEvents(run.id);
  }

  async *streamEvents(runId: string): AsyncGenerator<AgentEventRecord> {
    const run = await this.agents.findRunById(runId);
    if (!run) throw this.notFound("Agent run not found.");
    if (run.sessionId) throw this.notFound("Agent run not found.");
    const world = await this.requireWorld(run.worldId);

    const existingEvents = await this.agents.listEvents(run.id);
    for (const event of existingEvents) {
      yield event;
    }

    if (run.status !== "running") return;

    let sequence = existingEvents.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
    let lastYieldedSequence = sequence - 1;
    let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const controller = new AbortController();
    this.runAbortControllers.set(run.id, controller);

    try {
      const context = selectInitialWorldContext({
        prompt: run.prompt,
        manifest: await buildDisclosureManifest(this.worlds, world),
        cards: await buildDisclosureCards(this.worlds, world.id),
        briefs: await buildDisclosureBriefs(this.worlds, world.id),
        maxCards: 8,
        maxBriefs: 3,
      });

      const latestBeforeProvider = await this.agents.findRunById(run.id);
      if (controller.signal.aborted || latestBeforeProvider?.status !== "running") {
        for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
          yield event;
          lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
        }
        return;
      }

      const providerInput = {
        prompt: run.prompt,
        runId: run.id,
        model: run.model,
        world: { id: world.id, name: world.name, summary: world.summary },
        context,
        ...buildAgentProviderSessionConfig(DEFAULT_PI_SESSION_POLICY, process.env),
        signal: controller.signal,
      };
      const iterator = this.provider.stream(providerInput)[Symbol.asyncIterator]();

      try {
        while (true) {
          const next = await nextProviderChunk(iterator, controller.signal);
          if (next.status === "aborted") {
            closeProviderIterator(iterator);
            for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
              yield event;
              lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
            }
            return;
          }
          if (next.result.done) break;
          const chunk = next.result.value;

          if (chunk.type === "usage") {
            tokenUsage = chunk.tokenUsage;
            await this.agents.updateRun(run.id, { tokenUsage });
          }

          const latestRun = await this.agents.findRunById(run.id);
          if (latestRun?.status === "cancelled") {
            for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
              yield event;
              lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
            }
            return;
          }

          if (chunk.type === "context") {
            const created = await this.agents.createContextRef({ runId: run.id, ...chunk.contextRef });
            const event = await this.append(run.id, sequence++, "context.used", {
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
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "pi-session-started") {
            await this.agents.updateRun(run.id, { piSessionId: chunk.piSessionId, provider: "pi" });
            const event = await this.append(run.id, sequence++, "pi.session.started", { piSessionId: chunk.piSessionId });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "tool-requested") {
            const event = await this.append(run.id, sequence++, "tool.requested", { toolCall: chunk.toolCall });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "tool-completed") {
            const event = await this.append(run.id, sequence++, "tool.completed", { toolCallId: chunk.toolCallId, result: chunk.result });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "delta") {
            const event = await this.append(run.id, sequence++, "message.delta", { text: chunk.text });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "suggestion") {
            const suggestion = normalizeWorldSuggestion(suggestionSchema.parse(chunk.suggestion));
            const created = await this.agents.createSuggestion({ runId: run.id, worldId: run.worldId, suggestion });
            const event = await this.append(run.id, sequence++, "suggestion.created", { suggestionId: created.id, suggestion });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "failed") {
            throw new AgentProviderFailure(chunk.code, chunk.message);
          }
        }

        if (controller.signal.aborted) {
          for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }
          return;
        }

        const latestRun = await this.agents.findRunById(run.id);
        if (latestRun?.status === "cancelled") {
          for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }
          return;
        }
        if (latestRun?.status !== "running") return;

        const completed = await this.agents.updateRunIfStatus(run.id, "running", {
          status: "completed",
          tokenUsage,
          completedAt: new Date(),
        });
        if (!completed) return;
        const event = await this.append(run.id, sequence++, "run.completed", { tokenUsage });
        yield event;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }
          return;
        }
        const failure = agentFailureFromError(error);
        const failed = await this.agents.updateRunIfStatus(run.id, "running", {
          status: "failed",
          tokenUsage,
          failedAt: new Date(),
          errorCode: failure.code,
          errorMessage: failure.message,
        });
        if (!failed) return;
        yield await this.append(run.id, sequence++, "run.failed", { code: failure.code, message: failure.message });
      }
    } finally {
      if (this.runAbortControllers.get(run.id) === controller) {
        this.runAbortControllers.delete(run.id);
      }
    }
  }

  async *streamSessionRunEvents(runId: string): AsyncGenerator<AgentEventRecord> {
    const run = await this.agents.findRunById(runId);
    if (!run) throw this.notFound("Agent run not found.");
    if (!run.sessionId) throw this.notFound("Agent session run not found.");
    const sessions = this.requireSessionsRepository();
    const session = await sessions.findSessionForWorld(run.worldId, run.sessionId);
    if (!session) throw this.notFound("Agent session not found.");
    const world = await this.requireWorld(run.worldId);

    const existingEvents = await this.agents.listEvents(run.id);
    if (run.status !== "running") {
      for (const event of existingEvents) {
        yield event;
      }
      return;
    }

    let lastYieldedSequence = existingEvents.reduce((max, event) => Math.max(max, event.sequence), 0);

    const activeStream = this.activeSessionRunStreams.get(run.id);
    if (activeStream) {
      for (const event of existingEvents) {
        yield event;
      }
      yield* this.streamEventsFromActiveSessionRun(run.id, lastYieldedSequence, activeStream);
      return;
    }

    let finishActiveStream = () => {};
    const currentStream = new Promise<void>((resolve) => {
      finishActiveStream = resolve;
    });
    this.activeSessionRunStreams.set(run.id, currentStream);

    let sequence = lastYieldedSequence + 1;
    let assistantText = "";
    let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const controller = new AbortController();
    this.runAbortControllers.set(run.id, controller);

    try {
      for (const event of existingEvents) {
        yield event;
      }

      const context = selectInitialWorldContext({
        prompt: run.prompt,
        manifest: await buildDisclosureManifest(this.worlds, world),
        cards: await buildDisclosureCards(this.worlds, world.id),
        briefs: await buildDisclosureBriefs(this.worlds, world.id),
        maxCards: 8,
        maxBriefs: 3,
      });

      const latestBeforeProvider = await this.agents.findRunById(run.id);
      if (controller.signal.aborted || latestBeforeProvider?.status !== "running") {
        for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
          yield event;
          lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
        }
        return;
      }

      const providerInput = {
        prompt: run.prompt,
        runId: run.id,
        model: run.model,
        world: { id: world.id, name: world.name, summary: world.summary },
        context,
        ...buildAgentProviderSessionConfig(policyForSession(session), process.env),
        signal: controller.signal,
      };
      const iterator = this.provider.stream(providerInput)[Symbol.asyncIterator]();

      try {
        while (true) {
          const next = await nextProviderChunk(iterator, controller.signal);
          if (next.status === "aborted") {
            closeProviderIterator(iterator);
            for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
              yield event;
              lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
            }
            return;
          }
          if (next.result.done) break;
          const chunk = next.result.value;

          if (chunk.type === "usage") {
            tokenUsage = chunk.tokenUsage;
            await this.agents.updateRun(run.id, { tokenUsage });
          }

          const latestRun = await this.agents.findRunById(run.id);
          if (latestRun?.status === "cancelled") {
            for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
              yield event;
              lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
            }
            return;
          }

          if (chunk.type === "context") {
            const created = await this.agents.createContextRef({ runId: run.id, ...chunk.contextRef });
            const contextItem = await this.appendSessionContextItem(run.sessionId, run.id, chunk.contextRef);
            const event = await this.append(run.id, sequence++, "context.used", {
              contextRef: {
                id: created.id,
                kind: created.kind,
                title: created.title,
                excerpt: created.excerpt,
                targetId: created.targetId ?? undefined,
                level: created.level ?? "card",
                source: created.source ?? "initial",
              },
              contextItemId: contextItem.id,
            });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "pi-session-started") {
            await this.agents.updateRun(run.id, { piSessionId: chunk.piSessionId, provider: "pi" });
            const event = await this.append(run.id, sequence++, "pi.session.started", { piSessionId: chunk.piSessionId });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "tool-requested") {
            const event = await this.append(run.id, sequence++, "tool.requested", { toolCall: chunk.toolCall });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "tool-completed") {
            const event = await this.append(run.id, sequence++, "tool.completed", { toolCallId: chunk.toolCallId, result: chunk.result });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "delta") {
            assistantText += chunk.text;
            const event = await this.append(run.id, sequence++, "message.delta", { text: chunk.text });
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }

          if (chunk.type === "failed") {
            throw new AgentProviderFailure(chunk.code, chunk.message);
          }
        }

        if (controller.signal.aborted) {
          for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }
          return;
        }

        const latestRun = await this.agents.findRunById(run.id);
        if (latestRun?.status === "cancelled") {
          for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }
          return;
        }
        if (latestRun?.status !== "running") return;

        const completed = await this.agents.updateRunIfStatus(run.id, "running", {
          status: "completed",
          tokenUsage,
          completedAt: new Date(),
        });
        if (!completed) return;
        await sessions.appendMessageAtEnd({
          sessionId: run.sessionId,
          role: "assistant",
          content: assistantText,
          status: "complete",
          metadata: { runId: run.id, tokenUsage },
        });
        try {
          const detectedAssets = await this.potentialAssets?.analyzeCompletedRun({
            worldId: run.worldId,
            sessionId: run.sessionId,
            runId: run.id,
          }) ?? [];
          for (const potentialAsset of detectedAssets) {
            const currentSequence = sequence;
            const event = await this.append(run.id, currentSequence, "potential_asset.detected", {
              potentialAssetId: potentialAsset.id,
              potentialAsset: serializePotentialAssetForEvent(potentialAsset),
            });
            sequence = currentSequence + 1;
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }
        } catch {
          // Potential asset detection must not prevent the run from reaching its terminal event.
        }
        const event = await this.append(run.id, sequence++, "run.completed", { tokenUsage });
        yield event;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          for (const event of await this.listEventsAfter(run.id, lastYieldedSequence, "run.cancelled")) {
            yield event;
            lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
          }
          return;
        }
        const failure = agentFailureFromError(error);
        const failed = await this.agents.updateRunIfStatus(run.id, "running", {
          status: "failed",
          tokenUsage,
          failedAt: new Date(),
          errorCode: failure.code,
          errorMessage: failure.message,
        });
        if (!failed) return;
        await sessions.appendMessageAtEnd({
          sessionId: run.sessionId,
          role: "assistant",
          content: assistantText,
          status: "failed",
          metadata: { runId: run.id, code: failure.code, message: failure.message },
        });
        yield await this.append(run.id, sequence++, "run.failed", { code: failure.code, message: failure.message });
      }
    } finally {
      if (this.runAbortControllers.get(run.id) === controller) {
        this.runAbortControllers.delete(run.id);
      }
      if (this.activeSessionRunStreams.get(run.id) === currentStream) {
        this.activeSessionRunStreams.delete(run.id);
      }
      finishActiveStream();
    }
  }

  async cancelRun(runId: string) {
    const run = await this.requireRun(runId);
    if (run.status !== "running") return run;

    const events = await this.agents.listEvents(run.id);
    const nextSequence = events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
    const cancelled = await this.agents.updateRunIfStatus(run.id, "running", {
      status: "cancelled",
      cancelledAt: new Date(),
    });
    if (!cancelled) return await this.agents.findRunById(run.id) ?? run;
    await this.append(run.id, nextSequence, "run.cancelled", { reason: "user_cancelled" });
    this.runAbortControllers.get(run.id)?.abort();
    return await this.agents.findRunById(run.id) ?? run;
  }

  async saveSuggestion(suggestionId: string) {
    const suggestion = await this.requireSuggestion(suggestionId);
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

  async editSuggestion(suggestionId: string, input: { suggestion: unknown }) {
    const suggestion = await this.requireSuggestion(suggestionId);
    if (suggestion.status !== "pending" && suggestion.status !== "edited") return suggestion;
    return this.agents.updateSuggestion(suggestion.id, {
      status: "edited",
      suggestion: normalizeWorldSuggestion(suggestionSchema.parse(input.suggestion)),
    });
  }

  async discardSuggestion(suggestionId: string) {
    const suggestion = await this.requireSuggestion(suggestionId);
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

  private async requireRun(runId: string): Promise<AgentRunRecord> {
    const run = await this.agents.findRunById(runId);
    if (!run) throw this.notFound("Agent run not found.");
    await this.requireWorld(run.worldId);
    return run;
  }

  private async requireSuggestion(suggestionId: string) {
    const suggestion = await this.agents.findSuggestionById(suggestionId);
    if (!suggestion) throw this.notFound("Agent suggestion not found.");
    await this.requireWorld(suggestion.worldId);
    return suggestion;
  }

  private async requireWorld(worldId: string): Promise<WorldRecord> {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound("World not found.");
    return world;
  }

  private requireSessionsRepository() {
    if (!this.sessions) {
      throw new ServiceUnavailableException({
        code: "AGENT_SESSIONS_UNAVAILABLE",
        message: "Agent sessions repository is unavailable.",
      });
    }
    return this.sessions;
  }

  private requirePotentialAssetsService() {
    if (!this.potentialAssets) {
      throw new ServiceUnavailableException({
        code: "POTENTIAL_ASSETS_UNAVAILABLE",
        message: "Potential assets service is unavailable.",
      });
    }
    return this.potentialAssets;
  }

  private requireOfficialAssetsService() {
    if (!this.officialAssets) {
      throw new ServiceUnavailableException({
        code: "OFFICIAL_ASSETS_UNAVAILABLE",
        message: "Official assets service is unavailable.",
      });
    }
    return this.officialAssets;
  }

  private async createCompletedAssetDepositionRun(
    worldId: string,
    potentialAsset: PotentialAssetRecord,
    officialAssetId: string,
    createAssetInput: CreateOfficialAssetInput,
  ) {
    const tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const run = await this.agents.createRun({
      worldId,
      sessionId: potentialAsset.sessionId,
      mode: LEGACY_AGENT_RUN_MODE,
      prompt: `Promote potential asset ${potentialAsset.id} into official asset ${officialAssetId}.`,
      model: resolveRunModel(process.env),
      provider: parseAgentProvider(process.env.AI_PROVIDER),
    });
    const toolCall = {
      id: "call_create_world_asset",
      name: "create_world_asset" as const,
      arguments: buildAssetDepositionToolArguments(worldId, potentialAsset, createAssetInput),
    };

    await this.append(run.id, 1, "run.started", { runId: run.id });
    await this.append(run.id, 2, "tool.requested", { toolCall });
    await this.append(run.id, 3, "tool.completed", {
      toolCallId: toolCall.id,
      result: {
        assetId: officialAssetId,
        sourcePotentialAssetId: potentialAsset.id,
      },
    });
    const completed = await this.agents.updateRunIfStatus(run.id, "running", {
      status: "completed",
      tokenUsage,
      completedAt: new Date(),
    });
    await this.append(run.id, 4, "run.completed", { tokenUsage });
    return completed ?? await this.agents.findRunById(run.id) ?? run;
  }

  private async *streamEventsFromActiveSessionRun(
    runId: string,
    lastYieldedSequence: number,
    activeStream: Promise<void>,
  ): AsyncGenerator<AgentEventRecord> {
    let settled = false;
    void activeStream.then(() => {
      settled = true;
    });

    while (true) {
      const events = await this.listEventsAfter(runId, lastYieldedSequence);
      for (const event of events) {
        yield event;
        lastYieldedSequence = Math.max(lastYieldedSequence, event.sequence);
      }
      if (settled) return;
      await Promise.race([delay(10), activeStream]);
    }
  }

  private async appendSessionContextItem(
    sessionId: string,
    runId: string,
    contextRef: AgentProviderChunkContext,
  ) {
    const sessions = this.requireSessionsRepository();
    const mapped = mapProviderContextToSessionItem(contextRef);
    const { source, targetId, metadata, ...contextItem } = mapped;
    return sessions.createContextItem({
      sessionId,
      ...contextItem,
      targetId: targetId ?? runId,
      metadata: {
        ...metadata,
        runId,
        source,
      },
    });
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

  private async listEventsAfter(runId: string, sequence: number, waitForType?: AgentEvent["type"]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const events = (await this.agents.listEvents(runId))
        .filter((event) => event.sequence > sequence)
        .sort((a, b) => a.sequence - b.sequence);
      if (!waitForType || events.some((event) => event.type === waitForType)) return events;
      await delay(10);
    }
    return (await this.agents.listEvents(runId))
      .filter((event) => event.sequence > sequence)
      .sort((a, b) => a.sequence - b.sequence);
  }

  private notFound(message: string) {
    return new NotFoundException({ code: "NOT_FOUND", message });
  }

  private potentialAssetNotActive() {
    return new ConflictException({
      code: "POTENTIAL_ASSET_NOT_ACTIVE",
      message: "Potential asset is not active and cannot be promoted.",
    });
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

function officialAssetIdForPotentialAsset(potentialAssetId: string) {
  return `official_asset_${potentialAssetId}`;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

function buildWorldDraftPrompt(input: CreateWorldDraftInput) {
  return [
    "请基于用户的初始灵感生成一个 WorldDock 创建世界雏形。",
    "只返回一个 JSON 对象，不要 Markdown，不要解释。",
    "JSON 字段必须为：suggestedName, suggestedType, shortSummary, styles, coreSetting, coreConflict, directions, firstQuestion。",
    "styles 和 directions 必须是简体中文字符串数组；directions 给 3 条。",
    "shortSummary 是世界卡片用的一句话概括，24-42 个汉字，必须简短，不要包含「核心矛盾」「初始灵感」等标签。",
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
    shortSummary: firstNonEmptyString([
      stringField(parsed, "shortSummary", "short_summary", "summary"),
      compactWorldSummary(coreSetting),
      compactWorldSummary(input.inspiration),
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

function compactWorldSummary(value?: string) {
  const cleaned = (value ?? "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/^(?:核心设定|核心矛盾|初始灵感|风格关键词|避开的方向)\s*[:：]\s*/, "").trim())
    .find(Boolean);
  if (!cleaned) return undefined;
  const sentence = cleaned.match(/^(.{1,80}?[。！？!?])/)?.[1] ?? cleaned;
  const chars = Array.from(sentence.trim());
  if (chars.length <= 56) return sentence.trim();
  return `${chars.slice(0, 55).join("").replace(/[，,、；;：:\s]+$/, "")}…`;
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

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function nextProviderChunk(
  iterator: AsyncIterator<AgentProviderChunk>,
  signal: AbortSignal,
): Promise<
  | { status: "next"; result: IteratorResult<AgentProviderChunk> }
  | { status: "aborted" }
> {
  if (signal.aborted) return { status: "aborted" };

  let removeAbortListener = () => {};
  const aborted = new Promise<"aborted">((resolve) => {
    const onAbort = () => resolve("aborted");
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });
  const next = iterator.next().then((result) => ({ status: "next" as const, result }));
  try {
    const result = await Promise.race([next, aborted]);
    if (result === "aborted") return { status: "aborted" };
    return result;
  } finally {
    removeAbortListener();
  }
}

function closeProviderIterator(iterator: AsyncIterator<AgentProviderChunk>) {
  void iterator.return?.();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAgentProvider(value: string | undefined): AgentRunRecord["provider"] {
  if (!value || value === "pi") return "pi";
  throw new Error(`Unsupported agent provider: ${value}`);
}

function mapProviderContextToSessionItem(contextRef: AgentProviderChunkContext): SessionContextItemFromProvider {
  const providerLevel = contextRef.level ?? "card";
  const source = contextRef.source ?? "initial";
  return {
    kind: providerLevel === "manifest" ? "asset_index" : "source_fragment",
    title: contextRef.title,
    summary: contextRef.excerpt,
    targetId: contextRef.targetId,
    source,
    metadata: {
      providerKind: contextRef.kind,
      providerLevel,
    },
  };
}

function resolveRunModel(env: Record<string, string | undefined>) {
  return env.PI_MODEL_ID ?? env.AI_MODEL ?? null;
}

function serializePotentialAssetForEvent(asset: PotentialAssetRecord) {
  return {
    ...asset,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function buildAssetDepositionToolArguments(
  worldId: string,
  potentialAsset: PotentialAssetRecord,
  createAssetInput: CreateOfficialAssetInput,
) {
  const metadata = createAssetInput.metadata ?? {};

  return {
    worldId,
    potentialAssetId: potentialAsset.id,
    type: createAssetInput.type,
    name: createAssetInput.name,
    summary: createAssetInput.summary,
    tags: createAssetInput.tags ?? [],
    metadataKeys: Object.keys(metadata).sort(),
    metadataSourceIds: {
      sourcePotentialAssetId: stringOrNull(metadata.sourcePotentialAssetId),
      sourceSessionId: stringOrNull(metadata.sourceSessionId),
      sourceRunId: stringOrNull(metadata.sourceRunId),
    },
    markdownProvided: createAssetInput.markdown !== undefined,
    markdownLength: createAssetInput.markdown?.length ?? 0,
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
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
