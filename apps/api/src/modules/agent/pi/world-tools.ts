import { officialWorldAssetTypeSchema, type OfficialWorldAssetType } from "@worlddock/contract/assets";
import { consistencyIssueSeveritySchema } from "@worlddock/contract/consistency";
import type { ConsistencyService } from "../../consistency/consistency.service";
import type { OfficialAssetsService } from "../../official-assets/official-assets.service";
import type { OfficialAssetRecord } from "../../official-assets/official-assets.repository";
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

type DisclosureAssetCounts = Awaited<ReturnType<WorldRepository["countAssets"]>> & {
  official?: number;
  total?: number;
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
    return { found: true, manifest: await buildDisclosureManifest(worlds, world, officialAssets) };
  });

  registry.register("search_world_assets", async (input) => {
    const worldId = String(input.worldId ?? "");
    const query = String(input.query ?? "").toLowerCase();
    const assets = await listSearchableAssets(worlds, officialAssets, worldId);
    return {
      cards: assets
        .filter((asset) => !query || `${asset.title}\n${asset.summary}\n${asset.body}`.toLowerCase().includes(query))
        .slice(0, 12)
        .map(toCard),
    };
  });

  registry.register("get_asset_brief", async (input) => {
    const asset = await findDisclosureAsset(worlds, officialAssets, String(input.worldId ?? ""), String(input.assetId ?? ""));
    if (!asset) return {};
    return {
      found: true,
      brief: toBrief(asset),
    };
  });

  registry.register("get_asset_detail", async (input) => {
    const asset = await findDisclosureAsset(worlds, officialAssets, String(input.worldId ?? ""), String(input.assetId ?? ""));
    return asset ? { found: true, detail: { ...toBrief(asset), body: asset.body } } : { found: false };
  });

  registry.register("get_asset_source_fragments", async (input) => {
    const asset = await findDisclosureAsset(worlds, officialAssets, String(input.worldId ?? ""), String(input.assetId ?? ""));
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
    const worldId = readToolText(input.worldId);
    const name = readToolText(input.name, input.title);
    const existingAsset = await findExistingOfficialAssetByName(officialAssets, worldId, name);
    if (existingAsset) return buildDuplicateAssetNameDecisionResult(name, existingAsset);

    const created = await officialAssets.createAsset(worldId, {
      type: normalizeOfficialAssetType(input.type),
      name,
      summary: readToolText(input.summary),
      markdown: readToolMarkdown(input.markdown),
      tags: Array.isArray(input.tags) ? input.tags.map(String).filter((item) => item.trim()) : [],
      metadata: isRecord(input.metadata) ? input.metadata : {},
    });
    return serializeOfficialAssetToolResult(created);
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

  registry.register("create_consistency_issue", async (input) => {
    if (!consistency) {
      throw new Error("Consistency issue create tool is unavailable: ConsistencyService is not configured.");
    }
    const title = readToolText(input.title);
    const description = readToolText(input.description, input.summary);
    const subjectAssetIds = readToolTextList(input.subjectAssetIds, input.involves, input.assetIds);
    if (!title || !description || subjectAssetIds.length === 0) {
      throw new Error("create_consistency_issue title, description, and subjectAssetIds are required.");
    }
    return {
      issue: await consistency.createIssue({
        worldId: readToolText(input.worldId),
        title,
        description,
        severity: consistencyIssueSeveritySchema.catch("normal").parse(input.severity),
        subjectAssetIds,
        evidence: readToolEvidence(input.evidence),
        metadata: isRecord(input.metadata) ? input.metadata : {},
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

function readToolTextList(...values: unknown[]) {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const entries = value.map((entry) => readToolText(entry)).filter(Boolean);
    if (entries.length > 0) return [...new Set(entries)];
  }
  return [];
}

function normalizeOfficialAssetType(value: unknown): OfficialWorldAssetType {
  const parsed = officialWorldAssetTypeSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const text = readToolText(value).toLowerCase();
  const aliases: Record<string, OfficialWorldAssetType> = {
    character: "character",
    characters: "character",
    person: "character",
    people: "character",
    role: "character",
    角色: "character",
    人物: "character",
    organization: "organization",
    organizations: "organization",
    organisation: "organization",
    organisations: "organization",
    faction: "organization",
    force: "organization",
    势力: "organization",
    组织: "organization",
    机构: "organization",
    location: "location",
    locations: "location",
    place: "location",
    地点: "location",
    场所: "location",
    event: "event",
    events: "event",
    历史事件: "event",
    事件: "event",
    rule: "rule",
    rules: "rule",
    setting: "rule",
    world_rule: "rule",
    世界规则: "rule",
    规则: "rule",
    设定规则: "rule",
  };
  const normalized = aliases[text];
  if (normalized) return normalized;
  return officialWorldAssetTypeSchema.parse(value);
}

function readToolEvidence(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!isRecord(entry)) return null;
    const quote = readToolText(entry.quote, entry.text);
    if (!quote) return null;
    return {
      assetId: readToolText(entry.assetId) || undefined,
      messageId: readToolText(entry.messageId) || undefined,
      quote,
      confidence: typeof entry.confidence === "number" ? entry.confidence : undefined,
    };
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
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

async function findExistingOfficialAssetByName(
  officialAssets: OfficialAssetsService,
  worldId: string,
  name: string,
) {
  const normalizedName = normalizeAssetName(name);
  if (!worldId || !normalizedName) return null;

  if (typeof officialAssets.findActiveAssetByName === "function") {
    return officialAssets.findActiveAssetByName(worldId, name);
  }

  const listAssets = (officialAssets as { listAssets?: OfficialAssetsService["listAssets"] }).listAssets;
  if (typeof listAssets !== "function") return null;

  const { assets } = await listAssets.call(officialAssets, worldId, { q: name, limit: 50 });
  return assets.find((asset) =>
    asset.status === "active" && normalizeAssetName(asset.name) === normalizedName
  ) ?? null;
}

function buildDuplicateAssetNameDecisionResult(
  name: string,
  existingAsset: NonNullable<Awaited<ReturnType<OfficialAssetsService["findActiveAssetByName"]>>>,
) {
  return {
    needsUserDecision: true,
    code: "OFFICIAL_ASSET_NAME_CONFLICT",
    message: `资产库中已经存在名为「${name}」的资产。请询问用户：要改用其他名称新建，还是修改当前已经存在的资产？`,
    conflict: {
      name,
      existingAsset: {
        id: existingAsset.id,
        name: existingAsset.name,
        type: existingAsset.type,
        summary: existingAsset.summary,
      },
    },
  };
}

function normalizeAssetName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function serializeOfficialAssetToolResult(
  detail: Awaited<ReturnType<OfficialAssetsService["createAsset"]>>,
) {
  return {
    asset: {
      ...detail.asset,
      createdAt: detail.asset.createdAt.toISOString(),
      updatedAt: detail.asset.updatedAt.toISOString(),
      archivedAt: detail.asset.archivedAt?.toISOString() ?? null,
    },
    markdown: detail.markdown,
    indexes: detail.indexes.map((index) => ({
      ...index,
      createdAt: index.createdAt.toISOString(),
      updatedAt: index.updatedAt.toISOString(),
    })),
    revisions: detail.revisions.map((revision) => ({
      ...revision,
      createdAt: revision.createdAt.toISOString(),
      updatedAt: revision.updatedAt.toISOString(),
    })),
  };
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

async function listSearchableAssets(
  worlds: WorldRepository,
  officialAssets: OfficialAssetsService | undefined,
  worldId: string,
) {
  const [disclosureAssets, formalAssets] = await Promise.all([
    listDisclosureAssets(worlds, worldId),
    listFormalDisclosureAssets(officialAssets, worldId),
  ]);
  return [...formalAssets, ...disclosureAssets];
}

async function listFormalDisclosureAssets(
  officialAssets: OfficialAssetsService | undefined,
  worldId: string,
): Promise<DisclosureAsset[]> {
  const listAssets = officialAssets && (officialAssets as { listAssets?: OfficialAssetsService["listAssets"] }).listAssets;
  if (typeof listAssets !== "function") return [];

  const { assets } = await listAssets.call(officialAssets, worldId, { limit: 50 });
  return assets
    .filter((asset) => asset.status === "active")
    .map(officialAssetToDisclosureAsset);
}

async function findDisclosureAsset(
  worlds: WorldRepository,
  officialAssets: OfficialAssetsService | undefined,
  worldId: string,
  assetId: string,
) {
  const legacyAsset = (await listDisclosureAssets(worlds, worldId)).find((asset) => asset.id === assetId) ?? null;
  if (legacyAsset) return legacyAsset;

  return findFormalDisclosureAsset(officialAssets, worldId, assetId);
}

async function findFormalDisclosureAsset(
  officialAssets: OfficialAssetsService | undefined,
  worldId: string,
  assetId: string,
): Promise<DisclosureAsset | null> {
  const getAsset = officialAssets && (officialAssets as { getAsset?: OfficialAssetsService["getAsset"] }).getAsset;
  if (typeof getAsset !== "function" || !assetId.trim()) return null;

  try {
    const detail = await getAsset.call(officialAssets, worldId, assetId);
    if (!detail || detail.asset.status !== "active") return null;
    return officialAssetDetailToDisclosureAsset(detail);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
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

export function toManifest(world: WorldRecord, counts: DisclosureAssetCounts, assets: DisclosureAsset[]) {
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

export async function buildDisclosureManifest(
  worlds: WorldRepository,
  world: WorldRecord,
  officialAssets?: OfficialAssetsService,
) {
  const [legacyCounts, legacyAssets, formalAssets] = await Promise.all([
    worlds.countAssets(world.id),
    listDisclosureAssets(worlds, world.id),
    listFormalDisclosureAssets(officialAssets, world.id),
  ]);
  const assets = [...formalAssets, ...legacyAssets];
  const counts = {
    ...legacyCounts,
    official: formalAssets.length,
    total: legacyCounts.archive + legacyCounts.seeds + legacyCounts.conflicts + formalAssets.length,
  };
  return toManifest(world, counts, assets);
}

export async function buildDisclosureCards(
  worlds: WorldRepository,
  worldId: string,
  officialAssets?: OfficialAssetsService,
) {
  return (await listSearchableAssets(worlds, officialAssets, worldId)).map(toCard);
}

export async function buildDisclosureBriefs(
  worlds: WorldRepository,
  worldId: string,
  officialAssets?: OfficialAssetsService,
) {
  return (await listSearchableAssets(worlds, officialAssets, worldId)).map(toBrief);
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

function officialAssetToDisclosureAsset(asset: OfficialAssetRecord): DisclosureAsset {
  return {
    id: asset.id,
    worldId: asset.worldId,
    kind: "setting",
    title: asset.name,
    excerpt: asset.summary,
    summary: asset.summary,
    body: asset.summary,
    relations: [],
    updatedAt: asset.updatedAt,
  };
}

function officialAssetDetailToDisclosureAsset(
  detail: Awaited<ReturnType<OfficialAssetsService["getAsset"]>>,
): DisclosureAsset {
  return {
    ...officialAssetToDisclosureAsset(detail.asset),
    body: detail.markdown,
  };
}

function excerpt(text: string, max = 320) {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function isNotFoundError(error: unknown) {
  if (!isRecord(error)) return false;
  const status = typeof (error as { getStatus?: unknown }).getStatus === "function"
    ? (error as { getStatus: () => number }).getStatus()
    : undefined;
  if (status === 404) return true;
  if ((error as { status?: unknown }).status === 404 || (error as { statusCode?: unknown }).statusCode === 404) return true;

  const response = (error as { response?: unknown }).response;
  return isRecord(response) && (response.code === "NOT_FOUND" || response.statusCode === 404);
}
