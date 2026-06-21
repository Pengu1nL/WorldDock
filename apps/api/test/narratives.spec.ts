import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { NarrativesController } from "../src/modules/narratives/narratives.controller";
import {
  NARRATIVES_REPOSITORY,
  type ChapterRecord,
  type NarrativesRepository,
  type NarrativeAssetRelationRecord,
  type NarrativeAssetRecord,
  type NarrativeAssetVersionRecord,
  type NarrativeRecord,
} from "../src/modules/narratives/narratives.repository";
import { NarrativesService } from "../src/modules/narratives/narratives.service";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import {
  createHttpTestApp,
  createInMemoryAgentSessions,
  createInMemoryWorlds,
  type InMemoryAgentSessions,
  type InMemoryWorlds,
} from "./local-api-test-helpers";
import {
  STORY_PROGRESSION_AGENT,
  type StoryProgressionAgent,
  type StoryProgressionAgentInput,
} from "../src/modules/narratives/story-progression-agent";

describe("narratives local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates, lists, updates, reads, and deletes narratives", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    app = await createNarrativesApp(worlds, createInMemoryNarratives());

    const created = await request(app.getHttpServer())
      .post("/v1/narratives")
      .send({
        worldId: world.id,
        title: "雨巷档案",
        synopsis: "一名档案员追踪会下雨的记忆。",
        status: "in_progress",
        visualStyle: {
          artDirection: "水墨赛博雨夜",
          characterBase: "低饱和灰蓝服装，真实电影感",
          environmentBase: "潮湿石巷、霓虹倒影、白塔远景",
          forbidden: ["卡通", "高饱和糖果色"],
        },
      })
      .expect(201);

    const narrativeId = created.body.narrative.id;
    expect(created.body.narrative).toMatchObject({
      worldId: world.id,
      title: "雨巷档案",
      synopsis: "一名档案员追踪会下雨的记忆。",
      status: "in_progress",
      visualStyle: expect.objectContaining({
        artDirection: "水墨赛博雨夜",
        forbidden: ["卡通", "高饱和糖果色"],
      }),
      chapterCount: 0,
      assetCount: 0,
    });

    const list = await request(app.getHttpServer())
      .get("/v1/narratives")
      .query({ worldId: world.id })
      .expect(200);
    expect(list.body.narratives.map((narrative: { id: string }) => narrative.id)).toEqual([narrativeId]);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/narratives/${narrativeId}`)
      .send({ title: "雨巷纪事", status: "completed" })
      .expect(200);
    expect(updated.body.narrative).toMatchObject({ id: narrativeId, title: "雨巷纪事", status: "completed" });

    const detail = await request(app.getHttpServer()).get(`/v1/narratives/${narrativeId}`).expect(200);
    expect(detail.body).toMatchObject({
      narrative: { id: narrativeId, worldId: world.id, title: "雨巷纪事" },
      chapters: [],
      assets: [],
    });

    const deleted = await request(app.getHttpServer()).delete(`/v1/narratives/${narrativeId}`).expect(200);
    expect(deleted.body.narrative).toMatchObject({ id: narrativeId });
    await request(app.getHttpServer()).get(`/v1/narratives/${narrativeId}`).expect(404);
  });

  it("creates, updates, and deletes chapters under a narrative", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    const narratives = createInMemoryNarratives();
    app = await createNarrativesApp(worlds, narratives);

    const narrative = await narratives.createNarrative({
      worldId: world.id,
      title: "白塔城",
      synopsis: null,
      status: "draft",
      metadata: {},
    });

    const first = await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/chapters`)
      .send({ title: "迟到者", content: "The city bell rings late.", status: "completed" })
      .expect(201);
    expect(first.body.chapter).toMatchObject({
      narrativeId: narrative.id,
      order: 1,
      title: "迟到者",
      wordCount: 5,
      status: "completed",
    });

    const second = await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/chapters`)
      .send({ title: "钟楼", content: "Rain waits above the tower." })
      .expect(201);
    expect(second.body.chapter).toMatchObject({ order: 2, status: "draft" });

    const updated = await request(app.getHttpServer())
      .patch(`/v1/narratives/${narrative.id}/chapters/${first.body.chapter.id}`)
      .send({ content: "The city bell rings late again.", status: "revised" })
      .expect(200);
    expect(updated.body.chapter).toMatchObject({ wordCount: 6, status: "revised" });

    const detail = await request(app.getHttpServer()).get(`/v1/narratives/${narrative.id}`).expect(200);
    expect(detail.body.chapters.map((chapter: { id: string }) => chapter.id)).toEqual([
      first.body.chapter.id,
      second.body.chapter.id,
    ]);

    await request(app.getHttpServer())
      .delete(`/v1/narratives/${narrative.id}/chapters/${first.body.chapter.id}`)
      .expect(200);
    const afterDelete = await request(app.getHttpServer()).get(`/v1/narratives/${narrative.id}`).expect(200);
    expect(afterDelete.body.chapters.map((chapter: { id: string }) => chapter.id)).toEqual([second.body.chapter.id]);
  });

  it("rejects narratives for missing worlds", async () => {
    app = await createNarrativesApp(createInMemoryWorlds(), createInMemoryNarratives());

    const response = await request(app.getHttpServer())
      .post("/v1/narratives")
      .send({ worldId: "missing_world", title: "孤岛故事" })
      .expect(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Narrative not found.",
    });
  });

  it("creates, polls, confirms, and rejects story progression sessions", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    const narratives = createInMemoryNarratives();
    const sessions = createInMemoryAgentSessions();
    const storyAgent = createFakeStoryProgressionAgent({
      assetChanges: [{
        kind: "character",
        name: "林晚",
        operation: "create",
        summary: "抵达白塔城的迟到者。",
        body: "她注意到城市公共时间出现裂缝。",
        appearance: "灰色雨衣，随身携带旧怀表。",
        tags: ["迟到者"],
      }],
      consistencyFlags: [{
        severity: "warning",
        claim: "报时塔慢了一分钟",
        conflictWith: "白塔城公共时间绝对同步",
        suggestion: "补充报时塔异常原因。",
      }],
      narrativeObservations: [{
        observation: "公共时间出现裂缝。",
        implication: "城市权威开始失效。",
        suggestedAction: "让林晚追查报时塔维护记录。",
        arcStage: "setup",
        emotionScore: -0.35,
      }],
      worldSnapshot: {
        timestamp: "after chapter 1",
        activeCharacters: [{ name: "林晚", location: "白塔城", status: "抵达" }],
        unresolvedConflicts: ["公共时间异常"],
        ongoingEvents: ["报时塔慢了一分钟"],
      },
    });
    app = await createNarrativesApp(worlds, narratives, sessions, storyAgent);

    const narrative = await narratives.createNarrative({
      worldId: world.id,
      title: "白塔城",
      synopsis: null,
      status: "in_progress",
      visualStyle: {
        artDirection: "水墨赛博雨夜",
        characterBase: "低饱和灰蓝服装，真实电影感",
        environmentBase: "潮湿石巷、霓虹倒影、白塔远景",
        forbidden: ["卡通", "高饱和糖果色"],
      },
      metadata: {},
    });
    const chapter = await narratives.createChapter({
      narrativeId: narrative.id,
      order: 1,
      title: "迟到者",
      content: "林晚抵达白塔城，发现报时塔慢了一分钟。",
      wordCount: 18,
      status: "completed",
      metadata: {},
    });

    const started = await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/chapters/${chapter.id}/progress`)
      .send({})
      .expect(201);

    expect(started.body).toMatchObject({
      sessionId: expect.any(String),
      session: {
        worldId: world.id,
        kind: "story_progression",
        status: "active",
        metadata: expect.objectContaining({
          narrativeId: narrative.id,
          chapterId: chapter.id,
          reviewStatus: "running",
        }),
      },
    });
    expect(storyAgent.calls).toHaveLength(1);
    expect(storyAgent.calls[0]).toMatchObject({
      narrative: expect.objectContaining({ id: narrative.id, title: "白塔城" }),
      chapter: expect.objectContaining({ id: chapter.id, content: "林晚抵达白塔城，发现报时塔慢了一分钟。" }),
      existingAssets: [],
      previousChapters: [],
    });

    const progressions = await request(app.getHttpServer())
      .get(`/v1/narratives/${narrative.id}/progressions`)
      .expect(200);
    expect(progressions.body.progressions.map((session: { id: string }) => session.id)).toEqual([started.body.sessionId]);

    const detail = await waitForProgressionStatus(app, narrative.id, started.body.sessionId, "pending_review");
    expect(detail.body.session.metadata.progressionOutput.assetChanges).toHaveLength(1);
    expect(detail.body.session.metadata.progressionOutput.assetChanges[0].visualPrompt).toContain("水墨赛博雨夜");
    expect(detail.body.session.metadata.progressionOutput.narrativeObservations[0]).toMatchObject({
      arcStage: "setup",
      emotionScore: -0.35,
    });
    expect(detail.body.session.metadata.progressionOutput.worldSnapshot.activeCharacters[0]).toMatchObject({
      name: "林晚",
      location: "白塔城",
    });
    expect(detail.body.messages.map((message: { role: string }) => message.role)).toEqual(["user", "assistant"]);

    const confirmed = await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/progressions/${started.body.sessionId}/confirm`)
      .expect(200);
    expect(confirmed.body).toMatchObject({
      appliedAssets: [expect.objectContaining({ kind: "character", name: "林晚" })],
      session: expect.objectContaining({
        status: "completed",
        metadata: expect.objectContaining({ reviewStatus: "confirmed" }),
      }),
    });

    const afterConfirm = await request(app.getHttpServer()).get(`/v1/narratives/${narrative.id}`).expect(200);
    expect(afterConfirm.body.narrative.metadata.worldSnapshot).toMatchObject({
      timestamp: "after chapter 1",
      unresolvedConflicts: ["公共时间异常"],
    });
    expect(afterConfirm.body.assets).toEqual([
      expect.objectContaining({
        kind: "character",
        name: "林晚",
        summary: "抵达白塔城的迟到者。",
        appearance: "灰色雨衣，随身携带旧怀表。",
        visualPrompt: expect.stringContaining("水墨赛博雨夜"),
        nameEmbedding: expect.objectContaining({ dimensions: expect.any(Object) }),
      }),
    ]);

    const rejectedStart = await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/chapters/${chapter.id}/progress`)
      .send({})
      .expect(201);
    await waitForProgressionStatus(app, narrative.id, rejectedStart.body.sessionId, "pending_review");
    const rejected = await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/progressions/${rejectedStart.body.sessionId}/reject`)
      .expect(200);
    expect(rejected.body.session).toMatchObject({
      status: "cancelled",
      metadata: expect.objectContaining({ reviewStatus: "rejected" }),
    });
  });

  it("loads narrative assets once when applying multiple relation changes", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    const narratives = createInMemoryNarratives();
    const sessions = createInMemoryAgentSessions();
    let listAssetsCalls = 0;
    const originalListAssets = narratives.listAssets.bind(narratives);
    narratives.listAssets = async (...args) => {
      listAssetsCalls += 1;
      return originalListAssets(...args);
    };
    app = await createNarrativesApp(worlds, narratives, sessions);

    const narrative = await narratives.createNarrative({
      worldId: world.id,
      title: "白塔城",
      synopsis: null,
      status: "in_progress",
      metadata: {},
    });
    const chapter = await narratives.createChapter({
      narrativeId: narrative.id,
      order: 1,
      title: "迟到者",
      content: "林晚抵达白塔城，随身携带旧怀表。",
      wordCount: 18,
      status: "completed",
      metadata: {},
    });
    await narratives.createAsset({
      narrativeId: narrative.id,
      kind: "character",
      name: "林晚",
      summary: "迟到者。",
      body: null,
      tags: [],
      appearance: null,
      mood: null,
      visualPrompt: null,
      nameEmbedding: null,
      metadata: {},
    });
    await narratives.createAsset({
      narrativeId: narrative.id,
      kind: "location",
      name: "白塔城",
      summary: "公共时间异常的城市。",
      body: null,
      tags: [],
      appearance: null,
      mood: null,
      visualPrompt: null,
      nameEmbedding: null,
      metadata: {},
    });
    await narratives.createAsset({
      narrativeId: narrative.id,
      kind: "item",
      name: "旧怀表",
      summary: "林晚随身携带的怀表。",
      body: null,
      tags: [],
      appearance: null,
      mood: null,
      visualPrompt: null,
      nameEmbedding: null,
      metadata: {},
    });

    const session = await sessions.createSessionWithSubject({
      session: {
        worldId: world.id,
        narrativeId: narrative.id,
        chapterId: chapter.id,
        kind: "story_progression",
        title: `Progress ${chapter.title}`,
        status: "active",
        current: false,
        metadata: {
          narrativeId: narrative.id,
          chapterId: chapter.id,
          reviewStatus: "pending_review",
          assetChanges: [{
            kind: "character",
            name: "林晚",
            operation: "update",
            summary: "抵达白塔城的迟到者。",
            relationChanges: [
              { targetName: "白塔城", relationType: "located_in", description: "抵达城市。" },
              { targetName: "旧怀表", relationType: "owns", description: "随身携带。" },
            ],
          }],
          consistencyFlags: [],
          narrativeObservations: [],
        },
      },
      subject: {
        kind: "chapter",
        targetId: chapter.id,
        role: "primary",
        title: chapter.title,
        metadata: { narrativeId: narrative.id },
      },
    });
    await sessions.updateSession(session.id, {
      metadata: {
        ...session.metadata,
        progressionOutput: session.metadata,
      },
    });

    await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/progressions/${session.id}/confirm`)
      .expect(200);

    expect(listAssetsCalls).toBe(1);
  });

  it("stores name embeddings and suggests merge for similar asset names", async () => {
    const worlds = createInMemoryWorlds();
    const world = await createWorld(worlds);
    const narratives = createInMemoryNarratives();
    const sessions = createInMemoryAgentSessions();
    const storyAgent = createFakeStoryProgressionAgent({
      assetChanges: [{
        kind: "character",
        name: "林 晚",
        operation: "create",
        summary: "被 agent 重新识别出的迟到者。",
      }],
      consistencyFlags: [],
      narrativeObservations: [],
    });
    app = await createNarrativesApp(worlds, narratives, sessions, storyAgent);

    const narrative = await narratives.createNarrative({
      worldId: world.id,
      title: "白塔城",
      synopsis: null,
      status: "in_progress",
      metadata: {},
    });
    const chapter = await narratives.createChapter({
      narrativeId: narrative.id,
      order: 1,
      title: "迟到者",
      content: "林晚抵达白塔城。",
      wordCount: 9,
      status: "completed",
      metadata: {},
    });
    const existing = await narratives.createAsset({
      narrativeId: narrative.id,
      kind: "character",
      name: "林晚",
      summary: "原有角色。",
      body: null,
      tags: [],
      appearance: null,
      mood: null,
      visualPrompt: null,
      nameEmbedding: null,
      metadata: {},
    });

    const started = await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/chapters/${chapter.id}/progress`)
      .send({})
      .expect(201);
    await waitForProgressionStatus(app, narrative.id, started.body.sessionId, "pending_review");

    const confirmed = await request(app.getHttpServer())
      .post(`/v1/narratives/${narrative.id}/progressions/${started.body.sessionId}/confirm`)
      .expect(200);
    expect(confirmed.body.appliedAssets).toEqual([expect.objectContaining({ id: existing.id, name: "林晚" })]);
    expect(confirmed.body.session.metadata.mergeSuggestions).toEqual([
      expect.objectContaining({
        existingAssetId: existing.id,
        existingName: "林晚",
        suggestedName: "林 晚",
        similarity: expect.any(Number),
      }),
    ]);

    const detail = await request(app.getHttpServer()).get(`/v1/narratives/${narrative.id}`).expect(200);
    expect(detail.body.assets.map((asset: { name: string }) => asset.name)).toEqual(["林晚"]);
  });
});

async function createNarrativesApp(
  worlds: InMemoryWorlds,
  narratives: NarrativesRepository,
  sessions: InMemoryAgentSessions = createInMemoryAgentSessions(),
  storyAgent?: StoryProgressionAgent,
) {
  return createHttpTestApp({
    controllers: [NarrativesController],
    providers: [
      NarrativesService,
      AgentSessionsService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: NARRATIVES_REPOSITORY, useValue: narratives },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      ...(storyAgent ? [{ provide: STORY_PROGRESSION_AGENT, useValue: storyAgent }] : []),
    ],
  });
}

function createFakeStoryProgressionAgent(output: Awaited<ReturnType<StoryProgressionAgent["run"]>>) {
  const calls: StoryProgressionAgentInput[] = [];
  const agent: StoryProgressionAgent & { calls: StoryProgressionAgentInput[] } = {
    calls,
    async run(input) {
      calls.push(input);
      return output;
    },
  };
  return agent;
}

async function waitForProgressionStatus(
  app: INestApplication,
  narrativeId: string,
  sessionId: string,
  reviewStatus: string,
) {
  let lastResponse: request.Response | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await request(app.getHttpServer())
      .get(`/v1/narratives/${narrativeId}/progressions/${sessionId}`)
      .expect(200);
    lastResponse = response;
    if (response.body.session.metadata.reviewStatus === reviewStatus) return response;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(lastResponse?.body.session.metadata.reviewStatus).toBe(reviewStatus);
  return lastResponse as request.Response;
}

function createWorld(worlds: InMemoryWorlds) {
  return worlds.createWorld({
    name: "回忆所",
    type: "近未来",
    summary: "记忆可以被买卖。",
    tags: ["记忆"],
    mode: "local",
    maturity: 12,
  });
}

function createInMemoryNarratives(): NarrativesRepository {
  const narratives = new Map<string, NarrativeRecord>();
  const chapters = new Map<string, ChapterRecord>();
  const assets = new Map<string, NarrativeAssetRecord>();
  const versions = new Map<string, NarrativeAssetVersionRecord>();
  const relations = new Map<string, NarrativeAssetRelationRecord>();
  const counters = { narrative: 1, chapter: 1, asset: 1, version: 1, relation: 1 };

  return {
    async createNarrative(input) {
      const timestamp = now();
      const narrative: NarrativeRecord = {
        id: `narrative_${counters.narrative++}`,
        worldId: input.worldId,
        title: input.title,
        synopsis: input.synopsis,
        status: input.status,
        metadata: input.metadata,
        visualStyle: input.visualStyle ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      narratives.set(narrative.id, narrative);
      return narrative;
    },
    async listNarratives(query = {}) {
      return [...narratives.values()]
        .filter((narrative) => !query.worldId || narrative.worldId === query.worldId)
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id));
    },
    async findNarrativeById(id) {
      return narratives.get(id) ?? null;
    },
    async updateNarrative(id, input) {
      const narrative = narratives.get(id);
      if (!narrative) return null;
      const updated = { ...narrative, ...input, updatedAt: now() };
      narratives.set(id, updated);
      return updated;
    },
    async deleteNarrative(id) {
      const narrative = narratives.get(id);
      if (!narrative) return null;
      narratives.delete(id);
      for (const chapter of chapters.values()) {
        if (chapter.narrativeId === id) chapters.delete(chapter.id);
      }
      for (const asset of assets.values()) {
        if (asset.narrativeId === id) assets.delete(asset.id);
      }
      return narrative;
    },
    async countNarrativeChildren(narrativeId) {
      return {
        chapters: [...chapters.values()].filter((chapter) => chapter.narrativeId === narrativeId).length,
        assets: [...assets.values()].filter((asset) => asset.narrativeId === narrativeId).length,
      };
    },
    async listChapters(narrativeId) {
      return [...chapters.values()]
        .filter((chapter) => chapter.narrativeId === narrativeId)
        .sort((left, right) => left.order - right.order || left.createdAt.getTime() - right.createdAt.getTime());
    },
    async findChapter(narrativeId, chapterId) {
      const chapter = chapters.get(chapterId);
      return chapter?.narrativeId === narrativeId ? chapter : null;
    },
    async createChapter(input) {
      const timestamp = now();
      const chapter: ChapterRecord = {
        id: `chapter_${counters.chapter++}`,
        narrativeId: input.narrativeId,
        order: input.order,
        title: input.title,
        content: input.content,
        wordCount: input.wordCount,
        status: input.status,
        metadata: input.metadata,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      chapters.set(chapter.id, chapter);
      return chapter;
    },
    async updateChapter(narrativeId, chapterId, input) {
      const chapter = chapters.get(chapterId);
      if (!chapter || chapter.narrativeId !== narrativeId) return null;
      const updated = { ...chapter, ...input, updatedAt: now() };
      chapters.set(chapterId, updated);
      return updated;
    },
    async deleteChapter(narrativeId, chapterId) {
      const chapter = chapters.get(chapterId);
      if (!chapter || chapter.narrativeId !== narrativeId) return null;
      chapters.delete(chapterId);
      return chapter;
    },
    async listAssets(narrativeId, query = {}) {
      return [...assets.values()]
        .filter((asset) => asset.narrativeId === narrativeId)
        .filter((asset) => !query.kind || asset.kind === query.kind)
        .filter((asset) => !query.q || asset.name.includes(query.q) || asset.summary.includes(query.q))
        .sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));
    },
    async findAsset(narrativeId, assetId) {
      const asset = assets.get(assetId);
      return asset?.narrativeId === narrativeId ? asset : null;
    },
    async findAssetByName(narrativeId, kind, name) {
      const normalized = name.toLocaleLowerCase();
      return [...assets.values()].find((asset) =>
        asset.narrativeId === narrativeId &&
        asset.kind === kind &&
        asset.name.toLocaleLowerCase() === normalized
      ) ?? null;
    },
    async createAsset(input) {
      const timestamp = now();
      const asset: NarrativeAssetRecord = {
        id: `narrative_asset_${counters.asset++}`,
        narrativeId: input.narrativeId,
        kind: input.kind,
        name: input.name,
        summary: input.summary,
        body: input.body,
        tags: input.tags,
        appearance: input.appearance,
        mood: input.mood,
        visualPrompt: input.visualPrompt,
        nameEmbedding: input.nameEmbedding,
        metadata: input.metadata,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      assets.set(asset.id, asset);
      return asset;
    },
    async updateAsset(narrativeId, assetId, input) {
      const asset = assets.get(assetId);
      if (!asset || asset.narrativeId !== narrativeId) return null;
      const updated: NarrativeAssetRecord = { ...asset, ...input, updatedAt: now() };
      assets.set(assetId, updated);
      return updated;
    },
    async createAssetVersion(input) {
      const version: NarrativeAssetVersionRecord = {
        id: `narrative_asset_version_${counters.version++}`,
        assetId: input.assetId,
        chapterId: input.chapterId,
        snapshot: input.snapshot,
        diff: input.diff,
        createdAt: now(),
      };
      versions.set(version.id, version);
      return version;
    },
    async listAssetVersions(assetId) {
      return [...versions.values()]
        .filter((version) => version.assetId === assetId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    },
    async createAssetRelation(input) {
      const relation: NarrativeAssetRelationRecord = {
        id: `narrative_asset_relation_${counters.relation++}`,
        narrativeId: input.narrativeId,
        sourceAssetId: input.sourceAssetId,
        targetAssetId: input.targetAssetId,
        relationType: input.relationType,
        description: input.description,
        createdAt: now(),
      };
      relations.set(relation.id, relation);
      return relation;
    },
  };
}

function now() {
  return new Date();
}
