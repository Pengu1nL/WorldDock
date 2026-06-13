import { type INestApplication, type ModuleMetadata } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { WorldAssetKind } from "@worlddock/domain";
import { configureApiApp } from "../src/configure-api-app";
import type { AgentProvider, AgentProviderChunk, AgentProviderInput } from "../src/modules/agent/agent.provider";
import type {
  AgentEventRecord,
  AgentRepository,
  AgentRunRecord,
  AgentSuggestionRecord,
  ContextRefRecord,
} from "../src/modules/agent/agent.repository";
import type {
  ArchiveEntryRecord,
  ConflictRecord,
  StorySeedRecord,
  WorldRepository,
  WorldRecord,
} from "../src/modules/worlds/world.repository";
import type { CreateWorldAssetInput, UpdateWorldAssetInput, WorldAssetRecord } from "../src/modules/world-assets/world-assets.service";

type StoredAssetRelation = {
  worldId: string;
  sourceAssetId: string;
  targetAssetId: string;
  createdAt: Date;
};

export type InMemoryWorlds = WorldRepository & {
  stores: {
    worlds: Map<string, WorldRecord>;
    archiveEntries: Map<string, ArchiveEntryRecord>;
    storySeeds: Map<string, StorySeedRecord>;
    conflicts: Map<string, ConflictRecord>;
    assetRelations: StoredAssetRelation[];
  };
};

export async function createHttpTestApp(metadata: ModuleMetadata) {
  const moduleRef = await Test.createTestingModule(metadata).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app as INestApplication;
}

export function createInMemoryWorlds(): InMemoryWorlds {
  const stores: InMemoryWorlds["stores"] = {
    worlds: new Map(),
    archiveEntries: new Map(),
    storySeeds: new Map(),
    conflicts: new Map(),
    assetRelations: [],
  };
  const counters = { world: 1, archive: 1, seed: 1, conflict: 1 };

  const worlds: InMemoryWorlds = {
    stores,
    async createWorld(input) {
      const timestamp = now();
      const world: WorldRecord = {
        id: `world_${counters.world++}`,
        name: input.name,
        type: input.type,
        summary: input.summary,
        tags: [...input.tags],
        status: "draft",
        visibility: "private",
        mode: input.mode,
        maturity: input.maturity ?? 0,
        coverObjectId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      stores.worlds.set(world.id, world);
      return world;
    },
    async listWorlds() {
      return [...stores.worlds.values()]
        .filter((world) => !world.deletedAt)
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    },
    async findWorldById(id) {
      const world = stores.worlds.get(id);
      return world && !world.deletedAt ? world : null;
    },
    async updateWorld(id, input) {
      const world = stores.worlds.get(id);
      if (!world || world.deletedAt) return null;
      const updated: WorldRecord = { ...world, ...input, updatedAt: now() };
      stores.worlds.set(id, updated);
      return updated;
    },
    async deleteWorld(id) {
      const world = stores.worlds.get(id);
      if (!world || world.deletedAt) return null;
      const deleted: WorldRecord = {
        ...world,
        status: "unpublished",
        deletedAt: now(),
        updatedAt: now(),
      };
      stores.worlds.set(id, deleted);
      return deleted;
    },
    async duplicateWorldAssets(input) {
      const idMap = new Map<string, string>();
      const archiveCopies: Array<{ copyId: string; sourceRelations: string[] }> = [];
      const conflictCopies: Array<{ copyId: string; sourceRelated: string[]; sourceDerivedSeeds: string[] }> = [];

      for (const entry of [...stores.archiveEntries.values()].filter((item) => item.worldId === input.sourceWorldId)) {
        const copy = await worlds.createArchiveEntry({
          worldId: input.targetWorldId,
          title: entry.title,
          category: entry.category,
          summary: entry.summary,
          body: entry.body,
          relations: [...(entry.relations ?? [])],
          position: entry.position,
        });
        idMap.set(entry.id, copy.id);
        archiveCopies.push({ copyId: copy.id, sourceRelations: [...(entry.relations ?? [])] });
      }

      for (const seed of [...stores.storySeeds.values()].filter((item) => item.worldId === input.sourceWorldId)) {
        const copy = await worlds.createStorySeed({
          worldId: input.targetWorldId,
          title: seed.title,
          hook: seed.hook,
          trigger: seed.trigger,
          conflict: seed.conflict,
          protagonists: seed.protagonists,
          questions: [...(seed.questions ?? [])],
          position: seed.position,
        });
        idMap.set(seed.id, copy.id);
      }

      for (const conflict of [...stores.conflicts.values()].filter((item) => item.worldId === input.sourceWorldId)) {
        const copy = await worlds.createConflict({
          worldId: input.targetWorldId,
          title: conflict.title,
          summary: conflict.summary,
          body: conflict.body,
          related: [...(conflict.related ?? [])],
          derivedSeeds: [...(conflict.derivedSeeds ?? [])],
          position: conflict.position,
        });
        idMap.set(conflict.id, copy.id);
        conflictCopies.push({
          copyId: copy.id,
          sourceRelated: [...(conflict.related ?? [])],
          sourceDerivedSeeds: [...(conflict.derivedSeeds ?? [])],
        });
      }

      for (const archive of archiveCopies) {
        const copy = stores.archiveEntries.get(archive.copyId);
        if (copy) stores.archiveEntries.set(copy.id, { ...copy, relations: remapIds(archive.sourceRelations, idMap) });
      }
      for (const conflict of conflictCopies) {
        const copy = stores.conflicts.get(conflict.copyId);
        if (copy) {
          stores.conflicts.set(copy.id, {
            ...copy,
            related: remapIds(conflict.sourceRelated, idMap),
            derivedSeeds: remapIds(conflict.sourceDerivedSeeds, idMap),
          });
        }
      }

      for (const relation of stores.assetRelations.filter((item) => item.worldId === input.sourceWorldId)) {
        const sourceAssetId = idMap.get(relation.sourceAssetId);
        const targetAssetId = idMap.get(relation.targetAssetId);
        if (sourceAssetId && targetAssetId) {
          stores.assetRelations.push({
            worldId: input.targetWorldId,
            sourceAssetId,
            targetAssetId,
            createdAt: now(),
          });
        }
      }
    },
    async listArchiveEntries(worldId) {
      return [...stores.archiveEntries.values()]
        .filter((entry) => entry.worldId === worldId)
        .sort(comparePosition);
    },
    async createArchiveEntry(input) {
      const timestamp = now();
      const entry: ArchiveEntryRecord = {
        id: input.id ?? `archive_${counters.archive++}`,
        worldId: input.worldId,
        title: input.title,
        category: input.category,
        summary: input.summary,
        body: input.body,
        relations: [...(input.relations ?? [])],
        position: input.position ?? stores.archiveEntries.size,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      stores.archiveEntries.set(entry.id, entry);
      return entry;
    },
    async listStorySeeds(worldId) {
      return [...stores.storySeeds.values()]
        .filter((seed) => seed.worldId === worldId)
        .sort(comparePosition);
    },
    async createStorySeed(input) {
      const timestamp = now();
      const seed: StorySeedRecord = {
        id: input.id ?? `seed_${counters.seed++}`,
        worldId: input.worldId,
        title: input.title,
        hook: input.hook,
        trigger: input.trigger ?? null,
        conflict: input.conflict,
        protagonists: input.protagonists ?? null,
        questions: [...(input.questions ?? [])],
        position: input.position ?? stores.storySeeds.size,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      stores.storySeeds.set(seed.id, seed);
      return seed;
    },
    async listConflicts(worldId) {
      return [...stores.conflicts.values()]
        .filter((conflict) => conflict.worldId === worldId)
        .sort(comparePosition);
    },
    async createConflict(input) {
      const timestamp = now();
      const conflict: ConflictRecord = {
        id: input.id ?? `conflict_${counters.conflict++}`,
        worldId: input.worldId,
        title: input.title,
        summary: input.summary,
        body: input.body,
        related: [...(input.related ?? [])],
        derivedSeeds: [...(input.derivedSeeds ?? [])],
        position: input.position ?? stores.conflicts.size,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      stores.conflicts.set(conflict.id, conflict);
      return conflict;
    },
    async listAssetRelations(worldId) {
      return stores.assetRelations
        .filter((relation) => relation.worldId === worldId)
        .map((relation) => ({
          sourceAssetId: relation.sourceAssetId,
          targetAssetId: relation.targetAssetId,
        }));
    },
    async countAssets(worldId) {
      return {
        archive: archiveEntriesFor(worlds, worldId).length,
        seeds: storySeedsFor(worlds, worldId).length,
        conflicts: conflictsFor(worlds, worldId).length,
      };
    },
  };

  return worlds;
}

export function createInMemoryWorldAssets(worlds: InMemoryWorlds) {
  return {
    async listAssets(worldId: string, query: { kind?: WorldAssetKind; q?: string; cursor?: string }) {
      let assets = allAssets(worlds, worldId)
        .filter((asset) => !query.kind || asset.kind === query.kind)
        .sort((left, right) => left.position - right.position || Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      if (query.q) {
        const keyword = query.q.toLowerCase();
        assets = assets.filter((asset) =>
          asset.title.toLowerCase().includes(keyword) ||
          asset.summary.toLowerCase().includes(keyword) ||
          asset.body?.toLowerCase().includes(keyword),
        );
      }
      if (query.cursor) {
        const cursorIndex = assets.findIndex((asset) => asset.id === query.cursor);
        if (cursorIndex >= 0) assets = assets.slice(cursorIndex + 1);
      }
      const pageAssets = assets.slice(0, 50);
      return {
        assets: enrichWithRelations(worlds, worldId, pageAssets),
        nextCursor: assets.length > 50 ? assets[49]?.id ?? null : null,
      };
    },
    async createAsset(worldId: string, input: CreateWorldAssetInput) {
      if (input.kind === "setting") {
        return assetFromArchive(await worlds.createArchiveEntry({
          worldId,
          title: input.title,
          category: input.category ?? "世界设定",
          summary: input.summary,
          body: input.body ?? input.summary,
          relations: stringArray(input.payload?.relations),
          position: input.position,
        }));
      }
      if (input.kind === "seed") {
        return assetFromSeed(await worlds.createStorySeed({
          worldId,
          title: input.title,
          hook: stringValue(input.payload?.hook) ?? input.summary,
          trigger: stringValue(input.payload?.trigger),
          conflict: stringValue(input.payload?.conflict) ?? input.body ?? input.summary,
          protagonists: stringValue(input.payload?.protagonists),
          questions: stringArray(input.payload?.questions),
          position: input.position,
        }));
      }
      return assetFromConflict(await worlds.createConflict({
        worldId,
        title: input.title,
        summary: input.summary,
        body: input.body ?? input.summary,
        related: stringArray(input.payload?.related),
        derivedSeeds: stringArray(input.payload?.derivedSeeds),
        position: input.position,
      }));
    },
    async getAsset(worldId: string, assetId: string) {
      return enrichOne(worlds, worldId, assetFromRaw(findRawAsset(worlds, worldId, assetId)));
    },
    async updateAsset(worldId: string, assetId: string, input: UpdateWorldAssetInput) {
      const raw = findRawAsset(worlds, worldId, assetId);
      if (!raw) return null;
      if (raw.kind === "setting") {
        const entry: ArchiveEntryRecord = {
          ...raw.record,
          title: input.title ?? raw.record.title,
          category: input.category ?? raw.record.category,
          summary: input.summary ?? raw.record.summary,
          body: input.body ?? raw.record.body,
          relations: input.payload?.relations === undefined ? raw.record.relations ?? [] : stringArray(input.payload.relations),
          position: input.position ?? raw.record.position,
          updatedAt: now(),
        };
        worlds.stores.archiveEntries.set(entry.id, entry);
        return assetFromArchive(entry);
      }
      if (raw.kind === "seed") {
        const seed: StorySeedRecord = {
          ...raw.record,
          title: input.title ?? raw.record.title,
          hook: input.summary ?? stringValue(input.payload?.hook) ?? raw.record.hook,
          trigger: input.payload?.trigger === undefined ? raw.record.trigger : stringValue(input.payload.trigger),
          conflict: input.body ?? stringValue(input.payload?.conflict) ?? raw.record.conflict,
          protagonists: input.payload?.protagonists === undefined ? raw.record.protagonists : stringValue(input.payload.protagonists),
          questions: input.payload?.questions === undefined ? raw.record.questions ?? [] : stringArray(input.payload.questions),
          position: input.position ?? raw.record.position,
          updatedAt: now(),
        };
        worlds.stores.storySeeds.set(seed.id, seed);
        return assetFromSeed(seed);
      }
      const conflict: ConflictRecord = {
        ...raw.record,
        title: input.title ?? raw.record.title,
        summary: input.summary ?? raw.record.summary,
        body: input.body ?? raw.record.body,
        related: input.payload?.related === undefined ? raw.record.related ?? [] : stringArray(input.payload.related),
        derivedSeeds: input.payload?.derivedSeeds === undefined ? raw.record.derivedSeeds ?? [] : stringArray(input.payload.derivedSeeds),
        position: input.position ?? raw.record.position,
        updatedAt: now(),
      };
      worlds.stores.conflicts.set(conflict.id, conflict);
      return assetFromConflict(conflict);
    },
    async deleteAsset(worldId: string, assetId: string) {
      const raw = findRawAsset(worlds, worldId, assetId);
      if (!raw) return null;
      if (raw.kind === "setting") worlds.stores.archiveEntries.delete(assetId);
      if (raw.kind === "seed") worlds.stores.storySeeds.delete(assetId);
      if (raw.kind === "conflict") worlds.stores.conflicts.delete(assetId);
      removeRelations(worlds, (relation) =>
        relation.worldId === worldId && (relation.sourceAssetId === assetId || relation.targetAssetId === assetId),
      );
      return assetFromRaw(raw);
    },
    async reorderAssets(worldId: string, assetIds: string[]) {
      assetIds.forEach((assetId, position) => {
        const raw = findRawAsset(worlds, worldId, assetId);
        if (!raw) return;
        raw.record.position = position;
        raw.record.updatedAt = now();
      });
      return this.listAssets(worldId, {});
    },
    async addRelation(worldId: string, sourceAssetId: string, targetAssetId: string) {
      if (!findRawAsset(worlds, worldId, sourceAssetId) || !findRawAsset(worlds, worldId, targetAssetId)) return null;
      const existing = worlds.stores.assetRelations.find((relation) =>
        relation.worldId === worldId &&
        relation.sourceAssetId === sourceAssetId &&
        relation.targetAssetId === targetAssetId,
      );
      if (existing) return relationResponse(existing);
      const relation = { worldId, sourceAssetId, targetAssetId, createdAt: now() };
      worlds.stores.assetRelations.push(relation);
      return relationResponse(relation);
    },
    async deleteRelation(worldId: string, sourceAssetId: string, targetAssetId: string) {
      removeRelations(worlds, (relation) =>
        relation.worldId === worldId &&
        relation.sourceAssetId === sourceAssetId &&
        relation.targetAssetId === targetAssetId,
      );
      return { worldId, sourceAssetId, targetAssetId };
    },
  };
}

export type InMemoryAgents = AgentRepository & {
  stores: {
    runs: Map<string, AgentRunRecord>;
    events: AgentEventRecord[];
    suggestions: Map<string, AgentSuggestionRecord>;
    contextRefs: Map<string, ContextRefRecord>;
  };
};

export function createInMemoryAgents(): InMemoryAgents {
  const stores: InMemoryAgents["stores"] = {
    runs: new Map(),
    events: [],
    suggestions: new Map(),
    contextRefs: new Map(),
  };
  const counters = { run: 1, event: 1, suggestion: 1, context: 1 };

  return {
    stores,
    async createRun(input) {
      const timestamp = now();
      const run: AgentRunRecord = {
        id: `run_${counters.run++}`,
        worldId: input.worldId,
        status: "running",
        mode: input.mode,
        prompt: input.prompt,
        model: input.model ?? null,
        provider: input.provider ?? "mock",
        piSessionId: input.piSessionId ?? null,
        tokenUsage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
        errorCode: null,
        errorMessage: null,
      };
      stores.runs.set(run.id, run);
      return run;
    },
    async findRunById(id) {
      return stores.runs.get(id) ?? null;
    },
    async updateRun(id, input) {
      const run = stores.runs.get(id);
      if (!run) return null;
      const updated = { ...run, ...input, updatedAt: now() };
      stores.runs.set(id, updated);
      return updated;
    },
    async updateRunIfStatus(id, status, input) {
      const run = stores.runs.get(id);
      if (!run || run.status !== status) return null;
      const updated = { ...run, ...input, updatedAt: now() };
      stores.runs.set(id, updated);
      return updated;
    },
    async appendEvent(input) {
      const event: AgentEventRecord = {
        id: `event_${counters.event++}`,
        createdAt: now(),
        ...input,
      };
      stores.events.push(event);
      return event;
    },
    async listEvents(runId) {
      return stores.events
        .filter((event) => event.runId === runId)
        .sort((left, right) => left.sequence - right.sequence);
    },
    async createContextRef(input) {
      const contextRef: ContextRefRecord = {
        id: `ctx_${counters.context++}`,
        ...input,
      };
      stores.contextRefs.set(contextRef.id, contextRef);
      return contextRef;
    },
    async createSuggestion(input) {
      const suggestion: AgentSuggestionRecord = {
        id: `suggestion_${counters.suggestion++}`,
        status: "pending",
        savedAssetId: null,
        ...input,
      };
      stores.suggestions.set(suggestion.id, suggestion);
      return suggestion;
    },
    async listSuggestions(runId) {
      return [...stores.suggestions.values()].filter((suggestion) => suggestion.runId === runId);
    },
    async findSuggestionById(id) {
      return stores.suggestions.get(id) ?? null;
    },
    async updateSuggestion(id, input) {
      const suggestion = stores.suggestions.get(id);
      if (!suggestion) return null;
      const updated = { ...suggestion, ...input };
      stores.suggestions.set(id, updated);
      return updated;
    },
  };
}

export function createMockStreamingAgentProvider(chunks: AgentProviderChunk[] = defaultAgentChunks()) {
  const calls: AgentProviderInput[] = [];
  const provider: AgentProvider & { calls: AgentProviderInput[] } = {
    calls,
    async *stream(input) {
      calls.push(input);
      for (const chunk of chunks) {
        if (input.signal?.aborted) return;
        yield chunk;
      }
    },
  };
  return provider;
}

function defaultAgentChunks(): AgentProviderChunk[] {
  return [
    {
      type: "context",
      contextRef: {
        kind: "world",
        title: "回忆所 · 世界摘要",
        excerpt: "记忆可以被买卖。",
        targetId: "world_1",
        level: "manifest",
        source: "initial",
      },
    },
    { type: "delta", text: "可以先确认记忆交易的边界。" },
    {
      type: "suggestion",
      suggestion: {
        id: "setting_memory_license",
        kind: "setting",
        category: "世界规则",
        title: "记忆交易许可",
        summary: "所有记忆交易都需要登记许可。",
        body: "未经登记的记忆交易会触发城市信用审查。",
      },
    },
    {
      type: "usage",
      tokenUsage: { inputTokens: 12, outputTokens: 24, totalTokens: 36 },
    },
  ];
}

function allAssets(worlds: InMemoryWorlds, worldId: string): WorldAssetRecord[] {
  return [
    ...archiveEntriesFor(worlds, worldId).map(assetFromArchive),
    ...storySeedsFor(worlds, worldId).map(assetFromSeed),
    ...conflictsFor(worlds, worldId).map(assetFromConflict),
  ];
}

function assetFromRaw(raw: ReturnType<typeof findRawAsset>): WorldAssetRecord | null {
  if (!raw) return null;
  if (raw.kind === "setting") return assetFromArchive(raw.record);
  if (raw.kind === "seed") return assetFromSeed(raw.record);
  return assetFromConflict(raw.record);
}

function assetFromArchive(entry: ArchiveEntryRecord): WorldAssetRecord {
  return {
    id: entry.id,
    worldId: entry.worldId,
    kind: "setting",
    title: entry.title,
    category: entry.category,
    summary: entry.summary,
    body: entry.body,
    payload: { relations: [...(entry.relations ?? [])] },
    position: entry.position ?? 0,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function assetFromSeed(seed: StorySeedRecord): WorldAssetRecord {
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
      questions: seed.questions,
    },
    position: seed.position ?? 0,
    createdAt: seed.createdAt.toISOString(),
    updatedAt: seed.updatedAt.toISOString(),
  };
}

function assetFromConflict(conflict: ConflictRecord): WorldAssetRecord {
  return {
    id: conflict.id,
    worldId: conflict.worldId,
    kind: "conflict",
    title: conflict.title,
    category: "冲突",
    summary: conflict.summary,
    body: conflict.body,
    payload: {
      related: [...(conflict.related ?? [])],
      derivedSeeds: [...(conflict.derivedSeeds ?? [])],
    },
    position: conflict.position ?? 0,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
  };
}

function enrichOne(worlds: InMemoryWorlds, worldId: string, asset: WorldAssetRecord | null) {
  if (!asset) return null;
  return enrichWithRelations(worlds, worldId, [asset])[0] ?? null;
}

function enrichWithRelations(worlds: InMemoryWorlds, worldId: string, assets: WorldAssetRecord[]) {
  const titleById = new Map(allAssets(worlds, worldId).map((asset) => [asset.id, asset.title]));
  return assets.map((asset) => {
    const relationTargets = worlds.stores.assetRelations
      .filter((relation) => relation.worldId === worldId && relation.sourceAssetId === asset.id)
      .map((relation) => ({
        targetAssetId: relation.targetAssetId,
        label: titleById.get(relation.targetAssetId) ?? relation.targetAssetId,
      }));
    if (relationTargets.length === 0) return asset;
    return {
      ...asset,
      payload: {
        ...asset.payload,
        relationLabels: relationTargets.map((target) => target.label),
        relationTargets,
      },
    };
  });
}

function findRawAsset(worlds: InMemoryWorlds, worldId: string, assetId: string) {
  const archiveEntry = worlds.stores.archiveEntries.get(assetId);
  if (archiveEntry?.worldId === worldId) return { kind: "setting" as const, record: archiveEntry };
  const storySeed = worlds.stores.storySeeds.get(assetId);
  if (storySeed?.worldId === worldId) return { kind: "seed" as const, record: storySeed };
  const conflict = worlds.stores.conflicts.get(assetId);
  if (conflict?.worldId === worldId) return { kind: "conflict" as const, record: conflict };
  return null;
}

function relationResponse(relation: StoredAssetRelation) {
  return {
    worldId: relation.worldId,
    sourceAssetId: relation.sourceAssetId,
    targetAssetId: relation.targetAssetId,
    createdAt: relation.createdAt.toISOString(),
  };
}

function removeRelations(worlds: InMemoryWorlds, predicate: (relation: StoredAssetRelation) => boolean) {
  worlds.stores.assetRelations = worlds.stores.assetRelations.filter((relation) => !predicate(relation));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function remapIds(values: string[], idMap: Map<string, string>) {
  return values.map((value) => idMap.get(value) ?? value);
}

function comparePosition<T extends { position?: number; updatedAt: Date }>(left: T, right: T) {
  return (left.position ?? 0) - (right.position ?? 0) || right.updatedAt.getTime() - left.updatedAt.getTime();
}

function archiveEntriesFor(worlds: InMemoryWorlds, worldId: string) {
  return [...worlds.stores.archiveEntries.values()].filter((entry) => entry.worldId === worldId);
}

function storySeedsFor(worlds: InMemoryWorlds, worldId: string) {
  return [...worlds.stores.storySeeds.values()].filter((seed) => seed.worldId === worldId);
}

function conflictsFor(worlds: InMemoryWorlds, worldId: string) {
  return [...worlds.stores.conflicts.values()].filter((conflict) => conflict.worldId === worldId);
}

function now() {
  return new Date(Date.now());
}
