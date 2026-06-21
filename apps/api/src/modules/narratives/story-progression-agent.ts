import { Inject, Injectable } from "@nestjs/common";
import type { WorldContextRef } from "@worlddock/domain/agent/context";
import { createPiAgentCoreAdapter } from "../agent/pi/pi-agent-core.adapter";
import { PiAgentCoreRuntimeClient } from "../agent/pi/pi-runtime.client";
import { PiSessionRunner } from "../agent/pi/pi-session-runner";
import { SafetyGate } from "../agent/pi/safety-gate";
import { createStoryProgressionToolRegistry, describeStoryProgressionTools } from "../agent/pi/story-progression-tools";
import type { WorldRecord } from "../worlds/world.repository";
import {
  NARRATIVES_REPOSITORY,
  type ChapterRecord,
  type NarrativesRepository,
  type NarrativeAssetRecord,
  type NarrativeRecord,
} from "./narratives.repository";
import type { ProgressionOutput } from "./narratives.service";

export const STORY_PROGRESSION_AGENT = Symbol("STORY_PROGRESSION_AGENT");

export type StoryProgressionAgentInput = {
  sessionId: string;
  world: WorldRecord;
  narrative: NarrativeRecord;
  chapter: ChapterRecord;
  existingAssets: NarrativeAssetRecord[];
  previousChapters: ChapterRecord[];
};

export type StoryProgressionAgent = {
  run(input: StoryProgressionAgentInput): Promise<ProgressionOutput>;
};

@Injectable()
export class PiStoryProgressionAgent implements StoryProgressionAgent {
  constructor(@Inject(NARRATIVES_REPOSITORY) private readonly narratives: NarrativesRepository) {}

  async run(input: StoryProgressionAgentInput): Promise<ProgressionOutput> {
    let assistantText = "";
    const runner = new PiSessionRunner(
      new PiAgentCoreRuntimeClient(createPiAgentCoreAdapter({
        modelProvider: process.env.PI_MODEL_PROVIDER,
        modelId: process.env.PI_MODEL_ID,
        providerApiKey: process.env.PI_PROVIDER_API_KEY,
      })),
      createStoryProgressionToolRegistry(this.narratives, input.narrative.id),
      new SafetyGate(),
    );

    for await (const event of runner.run({
      runId: input.sessionId,
      worldId: input.world.id,
      prompt: buildStoryProgressionPrompt(input),
      model: process.env.PI_MODEL_ID ?? process.env.AI_MODEL ?? null,
      context: buildStoryProgressionContext(input),
      policy: { kind: "story_progression" },
      tools: describeStoryProgressionTools(),
      skills: [],
    })) {
      if (event.type === "message.delta") assistantText += event.text;
      if (event.type === "session.failed") {
        throw new Error(`${event.code}: ${event.message}`);
      }
    }

    return parseProgressionOutputText(assistantText);
  }
}

function buildStoryProgressionContext(input: StoryProgressionAgentInput): WorldContextRef[] {
  return [{
    level: "manifest",
    kind: "world",
    title: `${input.world.name} / ${input.narrative.title}`,
    excerpt: [
      input.world.summary,
      input.narrative.synopsis ? `叙事简介：${input.narrative.synopsis}` : "",
      `当前章节：第 ${input.chapter.order} 章《${input.chapter.title}》`,
      `已有叙事资产：${input.existingAssets.length} 个；此前章节：${input.previousChapters.length} 章。`,
    ].filter(Boolean).join("\n"),
    targetId: input.world.id,
    source: "initial",
  }];
}

function buildStoryProgressionPrompt(input: StoryProgressionAgentInput) {
  return [
    `narrativeId: ${input.narrative.id}`,
    `chapterId: ${input.chapter.id}`,
    `chapterOrder: ${input.chapter.order}`,
    `叙事标题：${input.narrative.title}`,
    input.narrative.synopsis ? `叙事简介：${input.narrative.synopsis}` : "",
    Object.keys(input.narrative.visualStyle).length > 0 ? `视觉规范：${JSON.stringify(input.narrative.visualStyle)}` : "",
    "当前章节正文：",
    input.chapter.content,
    "",
    "请完成故事推演，最终只返回 ProgressionOutput JSON。",
  ].filter(Boolean).join("\n");
}

function parseProgressionOutputText(text: string): ProgressionOutput {
  const parsed = parseJsonObject(text);
  if (!parsed) throw new Error("Story progression agent did not return a JSON object.");
  return normalizeProgressionOutput(parsed);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidates = [fenced, trimmed, extractJsonObject(trimmed)].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Try the next candidate; model output may include surrounding prose.
    }
  }
  return null;
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeProgressionOutput(value: Record<string, unknown>): ProgressionOutput {
  return {
    assetChanges: arrayOfRecords(value.assetChanges).map((change) => ({
      kind: normalizeAssetKind(change.kind),
      name: readText(change.name),
      operation: normalizeOperation(change.operation),
      summary: readText(change.summary),
      body: optionalText(change.body),
      appearance: optionalText(change.appearance),
      mood: optionalText(change.mood),
      visualPrompt: optionalText(change.visualPrompt),
      tags: readTextArray(change.tags),
      relationChanges: arrayOfRecords(change.relationChanges).map((relation) => ({
        targetName: readText(relation.targetName),
        relationType: readText(relation.relationType),
        description: optionalText(relation.description),
      })).filter((relation) => relation.targetName && relation.relationType),
    })).filter((change) => change.name && change.summary),
    consistencyFlags: arrayOfRecords(value.consistencyFlags).map((flag) => ({
      severity: normalizeSeverity(flag.severity),
      claim: readText(flag.claim),
      conflictWith: readText(flag.conflictWith),
      suggestion: readText(flag.suggestion),
    })).filter((flag) => flag.claim && flag.conflictWith && flag.suggestion),
    narrativeObservations: arrayOfRecords(value.narrativeObservations).map((observation) => ({
      observation: readText(observation.observation),
      implication: readText(observation.implication),
      suggestedAction: optionalText(observation.suggestedAction),
      arcStage: normalizeArcStage(observation.arcStage),
      emotionScore: typeof observation.emotionScore === "number" ? observation.emotionScore : undefined,
    })).filter((observation) => observation.observation && observation.implication),
    ...(readWorldSnapshot(value.worldSnapshot) ? { worldSnapshot: readWorldSnapshot(value.worldSnapshot) } : {}),
  };
}

function normalizeAssetKind(value: unknown): ProgressionOutput["assetChanges"][number]["kind"] {
  if (
    value === "character" ||
    value === "location" ||
    value === "item" ||
    value === "event" ||
    value === "concept" ||
    value === "faction"
  ) {
    return value;
  }
  return "concept";
}

function normalizeOperation(value: unknown): ProgressionOutput["assetChanges"][number]["operation"] {
  return value === "update" ? "update" : "create";
}

function normalizeSeverity(value: unknown): ProgressionOutput["consistencyFlags"][number]["severity"] {
  return value === "error" ? "error" : "warning";
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const text = readText(value);
  return text || undefined;
}

function readTextArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : [];
}

function normalizeArcStage(value: unknown): ProgressionOutput["narrativeObservations"][number]["arcStage"] {
  if (
    value === "setup" ||
    value === "rising" ||
    value === "climax" ||
    value === "falling" ||
    value === "resolution"
  ) {
    return value;
  }
  return undefined;
}

function readWorldSnapshot(value: unknown): ProgressionOutput["worldSnapshot"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const timestamp = readText(record.timestamp);
  if (!timestamp) return undefined;
  return {
    timestamp,
    activeCharacters: arrayOfRecords(record.activeCharacters).map((character) => ({
      name: readText(character.name),
      location: readText(character.location),
      status: readText(character.status),
    })).filter((character) => character.name),
    unresolvedConflicts: readTextArray(record.unresolvedConflicts),
    ongoingEvents: readTextArray(record.ongoingEvents),
  };
}
