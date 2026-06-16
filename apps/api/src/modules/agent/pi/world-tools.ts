import { officialWorldAssetTypeSchema } from "@worlddock/contract/assets";
import type { ConsistencyService } from "../../consistency/consistency.service";
import type { OfficialAssetsService } from "../../official-assets/official-assets.service";
import type { WorldAssetPatchesService } from "../../official-assets/world-asset-patches.service";
import type { ArchiveEntryRecord, ConflictRecord, StorySeedRecord, WorldRecord, WorldRepository } from "../../worlds/world.repository";
import { normalizeWorldSuggestion } from "../suggestion-normalizer";
import { WorldToolRegistry } from "./world-tool-registry";

export type DisclosureAsset = {
  id: string;
  worldId: string;
  kind: "setting" | "seed" | "conflict";
  title: string;
  excerpt: string;
  summary: string;
  body: string;
  relations: string[];
  updatedAt: Date;
};

export function createWorldToolRegistry(
  worlds: WorldRepository,
  officialAssets?: OfficialAssetsService,
  assetPatches?: WorldAssetPatchesService,
  consistency?: ConsistencyService,
) {
  const registry = new WorldToolRegistry();

  registry.register("get_world_manifest", async (input) => {
    const world = await worlds.findWorldById(String(input.worldId ?? ""));
    if (!world) return { found: false };
    return { found: true, manifest: await buildDisclosureManifest(worlds, world) };
  });

  registry.register("search_world_assets", async (input) => {
    const worldId = String(input.worldId ?? "");
    const query = String(input.query ?? "").toLowerCase();
    const assets = await listDisclosureAssets(worlds, worldId);
    return {
      cards: assets
        .filter((asset) => !query || `${asset.title}\n${asset.summary}\n${asset.body}`.toLowerCase().includes(query))
        .slice(0, 12)
        .map(toCard),
    };
  });

  registry.register("get_asset_brief", async (input) => {
    const asset = await findDisclosureAsset(worlds, String(input.worldId ?? ""), String(input.assetId ?? ""));
    if (!asset) return {};
    return {
      found: true,
      brief: toBrief(asset),
    };
  });

  registry.register("get_asset_detail", async (input) => {
    const asset = await findDisclosureAsset(worlds, String(input.worldId ?? ""), String(input.assetId ?? ""));
    return asset ? { found: true, detail: { ...toBrief(asset), body: asset.body } } : { found: false };
  });

  registry.register("get_asset_source_fragments", async (input) => {
    const asset = await findDisclosureAsset(worlds, String(input.worldId ?? ""), String(input.assetId ?? ""));
    return asset
      ? { found: true, fragments: [{ kind: asset.kind, targetId: asset.id, text: excerpt(asset.body, 1200) }] }
      : { found: false, fragments: [] };
  });

  registry.register("list_local_releases", async (input) => ({
    worldId: String(input.worldId ?? ""),
    releases: [],
  }));

  registry.register("create_world_asset", async (input) => {
    if (!officialAssets) {
      throw new Error("World asset write tool is unavailable: OfficialAssetsService is not configured.");
    }
    return {
      asset: await officialAssets.createAsset(String(input.worldId), {
        type: officialWorldAssetTypeSchema.parse(input.type),
        name: String(input.name ?? input.title ?? ""),
        summary: String(input.summary ?? ""),
        markdown: String(input.markdown ?? ""),
        tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
        metadata: isRecord(input.metadata) ? input.metadata : {},
      }),
    };
  });

  registry.register("apply_world_asset_patch", async (input) => {
    if (!assetPatches) {
      throw new Error("World asset patch tool is unavailable: WorldAssetPatchesService is not configured.");
    }
    const patch = isRecord(input.patch) ? input.patch : {};
    return {
      patch: await assetPatches.applyPatch({
        worldId: readToolText(input.worldId),
        assetId: readToolText(input.assetId),
        sessionId: readToolText(input.sessionId, patch.sessionId),
        afterMarkdown: readToolMarkdown(input.afterMarkdown, patch.afterMarkdown, patch.markdown),
        reason: readToolText(input.reason, patch.reason) || undefined,
      }),
    };
  });

  registry.register("resolve_consistency_issue", async (input) => {
    if (!consistency) {
      throw new Error("Consistency issue resolve tool is unavailable: ConsistencyService is not configured.");
    }
    return {
      batch: await consistency.applyPatchBatch({
        worldId: readToolText(input.worldId),
        issueId: readToolText(input.issueId),
        sessionId: readToolText(input.sessionId),
        patches: readToolPatches(input.patches),
      }),
    };
  });

  registry.register("propose_setting", async (input) => {
    const body = readToolText(input.body, input.summary, "待整理设定建议。");
    return {
      suggestion: normalizeWorldSuggestion({
        id: readToolText(input.id),
        kind: "setting",
        category: readToolText(input.category, "世界规则"),
        title: readToolText(input.title, "未命名设定"),
        summary: readToolText(input.summary, body),
        body,
      }),
    };
  });

  registry.register("propose_story_seed", async (input) => ({
    suggestion: normalizeWorldSuggestion({
      id: readToolText(input.id),
      kind: "seed",
      category: readToolText(input.category, "故事种子"),
      title: readToolText(input.title, "未命名故事种子"),
      hook: readToolText(input.hook, "一个新的故事切口。"),
      trigger: readToolText(input.trigger, "某个边界被打破。"),
      conflict: readToolText(input.conflict, "角色必须在代价之间做选择。"),
      protagonists: readToolText(input.protagonists, "待定主角"),
      questions: Array.isArray(input.questions) ? input.questions.map(String).filter((item) => item.trim()) : [],
    }),
  }));

  registry.register("propose_conflict", async (input) => {
    const body = readToolText(input.body, input.summary, "待整理冲突建议。");
    return {
      suggestion: normalizeWorldSuggestion({
        id: readToolText(input.id),
        kind: "conflict",
        category: readToolText(input.category, "核心冲突"),
        title: readToolText(input.title, "未命名冲突"),
        summary: readToolText(input.summary, body),
        body,
      }),
    };
  });

  registry.register("propose_release_notes", async (input) => ({
    worldId: String(input.worldId ?? ""),
    notes: String(input.notes ?? "待整理版本说明。"),
  }));

  return registry;
}

function readToolText(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function readToolMarkdown(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value);
    if (text.trim()) return text;
  }
  return "";
}

function readToolPatches(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("resolve_consistency_issue requires at least one patch.");
  }
  return value.map((patch) => {
    if (!isRecord(patch)) throw new Error("resolve_consistency_issue patches must be objects.");
    const assetId = readToolText(patch.assetId);
    const afterMarkdown = readToolMarkdown(patch.afterMarkdown, patch.markdown);
    if (!assetId || !afterMarkdown.trim()) {
      throw new Error("resolve_consistency_issue patch assetId and afterMarkdown are required.");
    }
    return {
      assetId,
      afterMarkdown,
      reason: readToolText(patch.reason) || undefined,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function listDisclosureAssets(worlds: WorldRepository, worldId: string) {
  const [archive, seeds, conflicts] = await Promise.all([
    worlds.listArchiveEntries(worldId),
    worlds.listStorySeeds(worldId),
    worlds.listConflicts(worldId),
  ]);
  return [
    ...archive.map(archiveToAsset),
    ...seeds.map(seedToAsset),
    ...conflicts.map(conflictToAsset),
  ];
}

async function findDisclosureAsset(worlds: WorldRepository, worldId: string, assetId: string) {
  return (await listDisclosureAssets(worlds, worldId)).find((asset) => asset.id === assetId) ?? null;
}

export function toCard(asset: DisclosureAsset) {
  return {
    worldId: asset.worldId,
    targetId: asset.id,
    kind: asset.kind,
    title: asset.title,
    excerpt: asset.excerpt,
    tags: [],
    relations: asset.relations,
    updatedAt: asset.updatedAt.toISOString(),
    score: 0,
  };
}

export function toBrief(asset: DisclosureAsset) {
  return {
    ...toCard(asset),
    summary: excerpt(asset.summary, 1200),
    facts: asset.summary.split("\n").filter(Boolean).slice(0, 6),
    openQuestions: [],
    sourcePointers: [`${asset.kind}:${asset.id}`],
  };
}

export function toManifest(world: WorldRecord, counts: Awaited<ReturnType<WorldRepository["countAssets"]>>, assets: DisclosureAsset[]) {
  return {
    worldId: world.id,
    name: world.name,
    type: world.type,
    summary: world.summary,
    tags: world.tags,
    status: world.status,
    visibility: world.visibility,
    assetCounts: counts,
    recentChanges: [...assets]
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, 5)
      .map((asset) => `${asset.kind}: ${asset.title}`),
    index: assets.slice(0, 12).map(toCard),
  };
}

export async function buildDisclosureManifest(worlds: WorldRepository, world: WorldRecord) {
  const [counts, assets] = await Promise.all([worlds.countAssets(world.id), listDisclosureAssets(worlds, world.id)]);
  return toManifest(world, counts, assets);
}

export async function buildDisclosureCards(worlds: WorldRepository, worldId: string) {
  return (await listDisclosureAssets(worlds, worldId)).map(toCard);
}

export async function buildDisclosureBriefs(worlds: WorldRepository, worldId: string) {
  return (await listDisclosureAssets(worlds, worldId)).map(toBrief);
}

function archiveToAsset(entry: ArchiveEntryRecord): DisclosureAsset {
  return {
    id: entry.id,
    worldId: entry.worldId,
    kind: "setting",
    title: entry.title,
    excerpt: entry.summary,
    summary: entry.summary,
    body: entry.body,
    relations: entry.relations ?? [],
    updatedAt: entry.updatedAt,
  };
}

function seedToAsset(seed: StorySeedRecord): DisclosureAsset {
  return {
    id: seed.id,
    worldId: seed.worldId,
    kind: "seed",
    title: seed.title,
    excerpt: seed.hook,
    summary: `${seed.hook}\n\nConflict: ${seed.conflict}`,
    body: [seed.hook, seed.trigger, seed.conflict, seed.protagonists].filter(Boolean).join("\n\n"),
    relations: seed.questions ?? [],
    updatedAt: seed.updatedAt,
  };
}

function conflictToAsset(conflict: ConflictRecord): DisclosureAsset {
  return {
    id: conflict.id,
    worldId: conflict.worldId,
    kind: "conflict",
    title: conflict.title,
    excerpt: conflict.summary,
    summary: conflict.summary,
    body: conflict.body,
    relations: [...(conflict.related ?? []), ...(conflict.derivedSeeds ?? [])],
    updatedAt: conflict.updatedAt,
  };
}

function excerpt(text: string, max = 320) {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
