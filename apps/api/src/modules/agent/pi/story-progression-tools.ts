import type { PiToolName } from "@worlddock/domain/agent/pi";
import type { ChapterRecord, NarrativesRepository, NarrativeAssetRecord } from "../../narratives/narratives.repository";
import { WorldToolRegistry, type WorldToolDefinition } from "./world-tool-registry";

const STORY_PROGRESSION_TOOL_DEFINITIONS: WorldToolDefinition[] = [
  {
    name: "list_characters",
    description: "List compact character cards already derived for this narrative. Use this before expanding a character asset.",
    inputSchema: {
      type: "object",
      required: ["narrativeId"],
      properties: { narrativeId: { type: "string" } },
    },
  },
  {
    name: "get_asset",
    description: "Read one full narrative asset after a card or explicit assetId is relevant.",
    inputSchema: {
      type: "object",
      required: ["narrativeId", "assetId"],
      properties: { narrativeId: { type: "string" }, assetId: { type: "string" } },
    },
  },
  {
    name: "get_previous_chapter_snapshot",
    description: "Read the nearest previous chapter and current compact world snapshot before the supplied chapter order.",
    inputSchema: {
      type: "object",
      required: ["narrativeId", "chapterOrder"],
      properties: { narrativeId: { type: "string" }, chapterOrder: { type: "number" } },
    },
  },
];

export function describeStoryProgressionTools() {
  return [...STORY_PROGRESSION_TOOL_DEFINITIONS];
}

export function createStoryProgressionToolRegistry(narratives: NarrativesRepository, narrativeId: string) {
  const registry = new WorldToolRegistry();

  registry.register("list_characters", async (input) => {
    if (readText(input.narrativeId) !== narrativeId) return { characters: [] };
    const characters = await narratives.listAssets(narrativeId, { kind: "character" });
    return { characters: characters.map(toAssetCard) };
  });

  registry.register("get_asset", async (input) => {
    if (readText(input.narrativeId) !== narrativeId) return { found: false };
    const asset = await narratives.findAsset(narrativeId, readText(input.assetId));
    return asset ? { found: true, asset: toAssetDetail(asset) } : { found: false };
  });

  registry.register("get_previous_chapter_snapshot", async (input) => {
    if (readText(input.narrativeId) !== narrativeId) return { found: false };
    const chapterOrder = readNumber(input.chapterOrder);
    const chapters = await narratives.listChapters(narrativeId);
    const previous = chapters
      .filter((chapter) => chapter.order < chapterOrder)
      .sort((left, right) => right.order - left.order)[0];
    if (!previous) return { found: false, previousChapter: null, assets: [] };

    const assets = await narratives.listAssets(narrativeId);
    return {
      found: true,
      previousChapter: toChapterSnapshot(previous),
      assets: assets.slice(0, 30).map(toAssetCard),
    };
  });

  return registry;
}

function toAssetCard(asset: NarrativeAssetRecord) {
  return {
    narrativeId: asset.narrativeId,
    assetId: asset.id,
    kind: asset.kind,
    name: asset.name,
    summary: asset.summary,
    tags: asset.tags,
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function toAssetDetail(asset: NarrativeAssetRecord) {
  return {
    ...toAssetCard(asset),
    body: asset.body,
    appearance: asset.appearance,
    mood: asset.mood,
    visualPrompt: asset.visualPrompt,
    metadata: asset.metadata,
  };
}

function toChapterSnapshot(chapter: ChapterRecord) {
  return {
    chapterId: chapter.id,
    order: chapter.order,
    title: chapter.title,
    status: chapter.status,
    wordCount: chapter.wordCount,
    summary: chapter.content.slice(0, 800),
    metadata: chapter.metadata,
  };
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isStoryProgressionToolName(name: PiToolName) {
  return STORY_PROGRESSION_TOOL_DEFINITIONS.some((tool) => tool.name === name);
}
