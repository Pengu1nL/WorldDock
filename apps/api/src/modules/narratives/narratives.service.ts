import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  AGENT_SESSIONS_REPOSITORY,
  type AgentSessionRecord,
  type AgentSessionsRepository,
} from "../agent-sessions/agent-sessions.repository";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import {
  NARRATIVES_REPOSITORY,
  type ChapterRecord,
  type CreateChapterInput,
  type CreateNarrativeInput,
  type NarrativesRepository,
  type NarrativeAssetRecord,
  type NarrativeRecord,
  type UpdateChapterInput,
  type UpdateNarrativeInput,
} from "./narratives.repository";
import {
  STORY_PROGRESSION_AGENT,
  type StoryProgressionAgent,
  type StoryProgressionAgentInput,
} from "./story-progression-agent";

export type ProgressionAssetChange = {
  kind: "character" | "location" | "item" | "event" | "concept" | "faction";
  name: string;
  operation: "create" | "update";
  summary: string;
  body?: string;
  appearance?: string;
  mood?: string;
  visualPrompt?: string;
  tags?: string[];
  relationChanges?: Array<{
    targetName: string;
    relationType: string;
    description?: string;
  }>;
};

export type ProgressionOutput = {
  assetChanges: ProgressionAssetChange[];
  consistencyFlags: Array<{
    severity: "warning" | "error";
    claim: string;
    conflictWith: string;
    suggestion: string;
  }>;
  narrativeObservations: Array<{
    observation: string;
    implication: string;
    suggestedAction?: string;
    arcStage?: "setup" | "rising" | "climax" | "falling" | "resolution";
    emotionScore?: number;
  }>;
  worldSnapshot?: WorldSnapshot;
};

export type WorldSnapshot = {
  timestamp: string;
  activeCharacters: Array<{ name: string; location: string; status: string }>;
  unresolvedConflicts: string[];
  ongoingEvents: string[];
};

export type ProgressionDetail = {
  session: AgentSessionRecord;
  subjects: Awaited<ReturnType<AgentSessionsRepository["listSubjects"]>>;
  contextItems: Awaited<ReturnType<AgentSessionsRepository["listContextItems"]>>;
  messages: Awaited<ReturnType<AgentSessionsRepository["listMessages"]>>;
};

type MergeSuggestion = {
  existingAssetId: string;
  existingName: string;
  suggestedName: string;
  kind: ProgressionAssetChange["kind"];
  similarity: number;
};

export type NarrativeSummary = NarrativeRecord & {
  chapterCount: number;
  assetCount: number;
};

@Injectable()
export class NarrativesService {
  constructor(
    @Inject(NARRATIVES_REPOSITORY) private readonly narratives: NarrativesRepository,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(AGENT_SESSIONS_REPOSITORY) private readonly sessions: AgentSessionsRepository,
    @Optional() @Inject(STORY_PROGRESSION_AGENT) private readonly storyAgent?: StoryProgressionAgent,
  ) {}

  async createNarrative(input: CreateNarrativeInput) {
    if (input.worldId) await this.requireWorld(input.worldId);
    return this.narratives.createNarrative(input);
  }

  async listNarratives(query: { worldId?: string }) {
    if (query.worldId) await this.requireWorld(query.worldId);
    return Promise.all((await this.narratives.listNarratives(query)).map((record) => this.toSummary(record)));
  }

  async getNarrativeDetail(narrativeId: string) {
    const narrative = await this.requireNarrative(narrativeId);
    const [chapters, assets] = await Promise.all([
      this.narratives.listChapters(narrativeId),
      this.narratives.listAssets(narrativeId),
    ]);
    return {
      narrative: {
        ...narrative,
        chapterCount: chapters.length,
        assetCount: assets.length,
      },
      chapters,
      assets,
    };
  }

  async updateNarrative(narrativeId: string, input: UpdateNarrativeInput) {
    await this.requireNarrative(narrativeId);
    if (input.worldId) await this.requireWorld(input.worldId);
    const updated = await this.narratives.updateNarrative(narrativeId, input);
    if (!updated) throw this.notFound();
    return updated;
  }

  async deleteNarrative(narrativeId: string) {
    await this.requireNarrative(narrativeId);
    const deleted = await this.narratives.deleteNarrative(narrativeId);
    if (!deleted) throw this.notFound();
    return deleted;
  }

  async createChapter(narrativeId: string, input: Omit<CreateChapterInput, "narrativeId" | "order" | "wordCount"> & { order?: number }) {
    await this.requireNarrative(narrativeId);
    const order = input.order ?? await this.nextChapterOrder(narrativeId);
    const created = await this.narratives.createChapter({
      narrativeId,
      order,
      title: input.title,
      content: input.content,
      wordCount: countWords(input.content),
      status: input.status,
      metadata: input.metadata,
    });
    return created;
  }

  async updateChapter(narrativeId: string, chapterId: string, input: Omit<UpdateChapterInput, "wordCount">) {
    await this.requireNarrative(narrativeId);
    await this.requireChapter(narrativeId, chapterId);
    const normalized: UpdateChapterInput = {
      ...input,
      ...(input.content !== undefined ? { wordCount: countWords(input.content) } : {}),
    };
    const updated = await this.narratives.updateChapter(narrativeId, chapterId, normalized);
    if (!updated) throw this.notFound();
    return updated;
  }

  async deleteChapter(narrativeId: string, chapterId: string) {
    await this.requireNarrative(narrativeId);
    await this.requireChapter(narrativeId, chapterId);
    const deleted = await this.narratives.deleteChapter(narrativeId, chapterId);
    if (!deleted) throw this.notFound();
    return deleted;
  }

  async startProgression(narrativeId: string, chapterId: string) {
    const narrative = await this.requireNarrative(narrativeId);
    const chapter = await this.requireChapter(narrativeId, chapterId);
    const worldId = this.requireProgressionWorldId(narrative);
    const [world, existingAssets, chapters] = await Promise.all([
      this.requireWorld(worldId),
      this.narratives.listAssets(narrativeId),
      this.narratives.listChapters(narrativeId),
    ]);
    const session = await this.sessions.createSessionWithSubject({
      session: {
        worldId,
        narrativeId,
        chapterId,
        kind: "story_progression",
        title: `Progress ${chapter.title}`,
        status: "active",
        current: false,
        metadata: {
          narrativeId,
          chapterId,
          reviewStatus: "running",
        },
      },
      subject: {
        kind: "chapter",
        targetId: chapterId,
        role: "primary",
        title: chapter.title,
        metadata: { narrativeId },
      },
      contextItems: [
        {
          kind: "chapter",
          targetId: chapter.id,
          title: chapter.title,
          summary: chapter.content.slice(0, 280),
          metadata: { narrativeId, order: chapter.order },
        },
      ],
    });
    void this.runStoryProgressionAgent({
      sessionId: session.id,
      world,
      narrative,
      chapter,
      existingAssets,
      previousChapters: chapters.filter((candidate) => candidate.order < chapter.order),
    });
    return session;
  }

  async listProgressions(narrativeId: string) {
    const narrative = await this.requireNarrative(narrativeId);
    const worldId = this.requireProgressionWorldId(narrative);
    const { sessions } = await this.sessions.listSessions(worldId, {
      kind: "story_progression",
      includeArchived: true,
      limit: 50,
    });
    return sessions.filter((session) => session.metadata.narrativeId === narrativeId);
  }

  async getProgressionDetail(narrativeId: string, sessionId: string): Promise<ProgressionDetail> {
    const session = await this.requireProgressionSession(narrativeId, sessionId);
    const [subjects, contextItems, messages] = await Promise.all([
      this.sessions.listSubjects(session.id),
      this.sessions.listContextItems(session.id),
      this.sessions.listMessages(session.id),
    ]);
    return { session, subjects, contextItems, messages };
  }

  async confirmProgression(narrativeId: string, sessionId: string) {
    const narrative = await this.requireNarrative(narrativeId);
    const session = await this.requireProgressionSession(narrativeId, sessionId);
    const chapterId = readRequiredMetadataString(session, "chapterId");
    const output = readProgressionOutput(session.metadata.progressionOutput);
    const appliedAssets = [];
    const mergeSuggestions: MergeSuggestion[] = [];

    for (const change of output.assetChanges) {
      const result = await this.applyAssetChange(narrativeId, chapterId, change);
      appliedAssets.push(result.asset);
      if (result.mergeSuggestion) mergeSuggestions.push(result.mergeSuggestion);
    }

    for (const change of output.assetChanges) {
      await this.applyRelationChanges(narrativeId, change);
    }

    if (output.worldSnapshot) {
      await this.narratives.updateNarrative(narrativeId, {
        metadata: {
          ...narrative.metadata,
          worldSnapshot: output.worldSnapshot,
        },
      });
    }

    const updated = await this.sessions.updateSession(session.id, {
      status: "completed",
      metadata: {
        ...session.metadata,
        reviewStatus: "confirmed",
        appliedAssetIds: appliedAssets.map((asset) => asset.id),
        mergeSuggestions,
        confirmedAt: new Date().toISOString(),
      },
    });
    if (!updated) throw this.notFound();
    return { session: updated, appliedAssets };
  }

  async rejectProgression(narrativeId: string, sessionId: string) {
    const session = await this.requireProgressionSession(narrativeId, sessionId);
    const updated = await this.sessions.updateSession(session.id, {
      status: "cancelled",
      metadata: {
        ...session.metadata,
        reviewStatus: "rejected",
        rejectedAt: new Date().toISOString(),
      },
    });
    if (!updated) throw this.notFound();
    return updated;
  }

  private async nextChapterOrder(narrativeId: string) {
    const chapters = await this.narratives.listChapters(narrativeId);
    return chapters.reduce((max, chapter) => Math.max(max, chapter.order), 0) + 1;
  }

  private async toSummary(record: NarrativeRecord): Promise<NarrativeSummary> {
    const counts = await this.narratives.countNarrativeChildren(record.id);
    return {
      ...record,
      chapterCount: counts.chapters,
      assetCount: counts.assets,
    };
  }

  private async requireWorld(worldId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world) throw this.notFound();
    return world;
  }

  private async requireNarrative(narrativeId: string) {
    const narrative = await this.narratives.findNarrativeById(narrativeId);
    if (!narrative) throw this.notFound();
    return narrative;
  }

  private async requireChapter(narrativeId: string, chapterId: string): Promise<ChapterRecord> {
    const chapter = await this.narratives.findChapter(narrativeId, chapterId);
    if (!chapter) throw this.notFound();
    return chapter;
  }

  private requireProgressionWorldId(narrative: NarrativeRecord) {
    if (narrative.worldId) return narrative.worldId;
    throw new BadRequestException({
      code: "BAD_REQUEST",
      message: "Story progression requires a world-linked narrative.",
    });
  }

  private async requireProgressionSession(narrativeId: string, sessionId: string) {
    const narrative = await this.requireNarrative(narrativeId);
    const worldId = this.requireProgressionWorldId(narrative);
    const session = await this.sessions.findSessionForWorld(worldId, sessionId);
    if (!session || session.kind !== "story_progression" || session.metadata.narrativeId !== narrativeId) {
      throw this.notFound();
    }
    return session;
  }

  private async applyAssetChange(narrativeId: string, chapterId: string, change: ProgressionAssetChange) {
    const existing = await this.narratives.findAssetByName(narrativeId, change.kind, change.name);
    const nameEmbedding = createNameEmbedding(change.name);
    const duplicate = !existing && change.operation === "create"
      ? await this.findSimilarAsset(narrativeId, change.kind, change.name, nameEmbedding)
      : null;
    if (duplicate) {
      await this.narratives.createAssetVersion({
        assetId: duplicate.asset.id,
        chapterId,
        snapshot: snapshotAsset(duplicate.asset),
        diff: {
          operation: "merge_suggested",
          source: "story_progression",
          suggestedName: change.name,
          similarity: duplicate.similarity,
        },
      });
      return {
        asset: duplicate.asset,
        mergeSuggestion: {
          existingAssetId: duplicate.asset.id,
          existingName: duplicate.asset.name,
          suggestedName: change.name,
          kind: change.kind,
          similarity: duplicate.similarity,
        },
      };
    }

    const input = {
      kind: change.kind,
      name: change.name,
      summary: change.summary,
      body: change.body ?? null,
      tags: change.tags ?? [],
      appearance: change.appearance ?? null,
      mood: change.mood ?? null,
      visualPrompt: change.visualPrompt ?? null,
      nameEmbedding,
      metadata: { source: "story_progression" },
    };
    const asset = existing
      ? await this.narratives.updateAsset(narrativeId, existing.id, input)
      : await this.narratives.createAsset({ narrativeId, ...input });
    if (!asset) throw this.notFound();

    await this.narratives.createAssetVersion({
      assetId: asset.id,
      chapterId,
      snapshot: snapshotAsset(asset),
      diff: {
        operation: existing ? "update" : "create",
        source: "story_progression",
      },
    });
    return { asset };
  }

  private async findSimilarAsset(
    narrativeId: string,
    kind: ProgressionAssetChange["kind"],
    name: string,
    nameEmbedding: NameEmbedding,
  ) {
    const candidates = await this.narratives.listAssets(narrativeId, { kind });
    let best: { asset: NarrativeAssetRecord; similarity: number } | null = null;
    for (const asset of candidates) {
      if (asset.name.toLocaleLowerCase() === name.toLocaleLowerCase()) continue;
      const existingEmbedding = parseNameEmbedding(asset.nameEmbedding) ?? createNameEmbedding(asset.name);
      const similarity = cosineSimilarity(nameEmbedding, existingEmbedding);
      if (similarity <= 0.85) continue;
      if (!best || similarity > best.similarity) best = { asset, similarity };
    }
    return best;
  }

  private async applyRelationChanges(narrativeId: string, change: ProgressionAssetChange) {
    if (!change.relationChanges?.length) return;
    const source = await this.narratives.findAssetByName(narrativeId, change.kind, change.name);
    if (!source) return;
    const assets = await this.narratives.listAssets(narrativeId);

    for (const relation of change.relationChanges) {
      const target = assets.find((asset) => asset.name.toLocaleLowerCase() === relation.targetName.toLocaleLowerCase());
      if (!target) continue;
      await this.narratives.createAssetRelation({
        narrativeId,
        sourceAssetId: source.id,
        targetAssetId: target.id,
        relationType: relation.relationType,
        description: relation.description ?? null,
      });
    }
  }

  private async runStoryProgressionAgent(input: StoryProgressionAgentInput) {
    let assistantText = "";
    try {
      await this.sessions.appendMessageAtEnd({
        sessionId: input.sessionId,
        role: "user",
        content: `推演第 ${input.chapter.order} 章《${input.chapter.title}》`,
        status: "complete",
        metadata: { narrativeId: input.narrative.id, chapterId: input.chapter.id },
      });

      if (!this.storyAgent) {
        throw new Error("Story progression agent is not configured.");
      }

      const output = enrichProgressionOutput(await this.storyAgent.run(input), input.narrative.visualStyle);
      assistantText = JSON.stringify(output);
      await this.sessions.appendMessageAtEnd({
        sessionId: input.sessionId,
        role: "assistant",
        content: assistantText,
        status: "complete",
        metadata: { kind: "progression_output" },
      });
      const latest = await this.sessions.findSessionById(input.sessionId);
      if (!latest) return;
      await this.sessions.updateSession(input.sessionId, {
        metadata: {
          ...latest.metadata,
          reviewStatus: "pending_review",
          progressionOutput: output,
          completedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      await this.sessions.appendMessageAtEnd({
        sessionId: input.sessionId,
        role: "assistant",
        content: assistantText,
        status: "failed",
        metadata: {
          kind: "progression_output",
          message: error instanceof Error ? error.message : "Story progression agent failed.",
        },
      });
      const latest = await this.sessions.findSessionById(input.sessionId);
      if (!latest) return;
      await this.sessions.updateSession(input.sessionId, {
        status: "cancelled",
        metadata: {
          ...latest.metadata,
          reviewStatus: "failed",
          errorMessage: error instanceof Error ? error.message : "Story progression agent failed.",
          failedAt: new Date().toISOString(),
        },
      });
    }
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "Narrative not found.",
    });
  }
}

export function countWords(content: string) {
  const matches = content.trim().match(/[\p{Script=Han}]|[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/gu);
  return matches?.length ?? 0;
}

function snapshotAsset(asset: NarrativeAssetRecord) {
  return {
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    summary: asset.summary,
    body: asset.body,
    tags: asset.tags,
    appearance: asset.appearance,
    mood: asset.mood,
    visualPrompt: asset.visualPrompt,
  };
}

type NameEmbedding = {
  model: "local-name-ngram-v1";
  dimensions: Record<string, number>;
};

function createNameEmbedding(name: string): NameEmbedding {
  const tokens = tokenizeName(name);
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const norm = Math.hypot(...counts.values()) || 1;
  return {
    model: "local-name-ngram-v1",
    dimensions: Object.fromEntries([...counts.entries()].map(([token, count]) => [token, count / norm])),
  };
}

function tokenizeName(name: string) {
  const normalized = name.normalize("NFKC").toLocaleLowerCase();
  const compact = normalized.replace(/[^\p{Letter}\p{Number}]+/gu, "");
  const tokens: string[] = [];
  for (const char of [...compact]) {
    tokens.push(`char:${char}`);
  }
  for (let index = 0; index < compact.length - 1; index++) {
    tokens.push(`bi:${compact.slice(index, index + 2)}`);
  }
  for (const word of normalized.match(/[a-z0-9]+/g) ?? []) {
    tokens.push(`word:${word}`);
  }
  return tokens.length > 0 ? tokens : [`raw:${normalized.trim()}`];
}

function parseNameEmbedding(value: unknown): NameEmbedding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<NameEmbedding>;
  if (record.model !== "local-name-ngram-v1" || !record.dimensions || typeof record.dimensions !== "object") return null;
  const dimensions: Record<string, number> = {};
  for (const [key, weight] of Object.entries(record.dimensions)) {
    if (typeof weight === "number" && Number.isFinite(weight)) dimensions[key] = weight;
  }
  return Object.keys(dimensions).length > 0 ? { model: "local-name-ngram-v1", dimensions } : null;
}

function cosineSimilarity(left: NameEmbedding, right: NameEmbedding) {
  let dot = 0;
  for (const [token, leftWeight] of Object.entries(left.dimensions)) {
    dot += leftWeight * (right.dimensions[token] ?? 0);
  }
  return Number(dot.toFixed(6));
}

function readRequiredMetadataString(session: AgentSessionRecord, key: string) {
  const value = session.metadata[key];
  if (typeof value === "string" && value) return value;
  throw new Error(`Progression session is missing metadata.${key}.`);
}

function readProgressionOutput(value: unknown): ProgressionOutput {
  if (!value || typeof value !== "object") {
    return { assetChanges: [], consistencyFlags: [], narrativeObservations: [] };
  }
  const raw = value as Partial<ProgressionOutput>;
  return {
    assetChanges: Array.isArray(raw.assetChanges) ? raw.assetChanges : [],
    consistencyFlags: Array.isArray(raw.consistencyFlags) ? raw.consistencyFlags : [],
    narrativeObservations: Array.isArray(raw.narrativeObservations) ? raw.narrativeObservations : [],
    ...(readWorldSnapshot(raw.worldSnapshot) ? { worldSnapshot: readWorldSnapshot(raw.worldSnapshot) } : {}),
  };
}

function enrichProgressionOutput(output: ProgressionOutput, visualStyle: Record<string, unknown>): ProgressionOutput {
  return {
    ...output,
    assetChanges: output.assetChanges.map((change) => ({
      ...change,
      visualPrompt: change.visualPrompt ?? buildVisualPrompt(visualStyle, change),
    })),
  };
}

function buildVisualPrompt(visualStyle: Record<string, unknown>, change: ProgressionAssetChange) {
  const parts = [
    textValue(visualStyle.artDirection),
    change.kind === "character" ? textValue(visualStyle.characterBase) : "",
    change.kind !== "character" ? textValue(visualStyle.environmentBase) : "",
    `${change.kind}: ${change.name}`,
    change.appearance,
    change.mood,
    change.summary,
  ].filter((item): item is string => Boolean(item && item.trim()));
  const forbidden = Array.isArray(visualStyle.forbidden)
    ? visualStyle.forbidden.map((item) => textValue(item)).filter(Boolean)
    : [];
  if (forbidden.length > 0) parts.push(`avoid: ${forbidden.join(", ")}`);
  return parts.join("；");
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readWorldSnapshot(value: unknown): WorldSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<WorldSnapshot>;
  const timestamp = textValue(record.timestamp);
  if (!timestamp) return undefined;
  return {
    timestamp,
    activeCharacters: Array.isArray(record.activeCharacters)
      ? record.activeCharacters.map(readSnapshotCharacter).filter((item): item is WorldSnapshot["activeCharacters"][number] => Boolean(item))
      : [],
    unresolvedConflicts: readStringList(record.unresolvedConflicts),
    ongoingEvents: readStringList(record.ongoingEvents),
  };
}

function readSnapshotCharacter(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = textValue(record.name);
  if (!name) return null;
  return {
    name,
    location: textValue(record.location),
    status: textValue(record.status),
  };
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
}
