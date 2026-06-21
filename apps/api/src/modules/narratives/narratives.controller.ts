import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  type AgentSessionContextItemRecord,
  type AgentSessionMessageRecord,
  type AgentSessionRecord,
  type AgentSessionSubjectRecord,
} from "../agent-sessions/agent-sessions.repository";
import {
  type ChapterRecord,
  type NarrativeAssetRecord,
  type NarrativeRecord,
} from "./narratives.repository";
import { NarrativesService, type NarrativeSummary } from "./narratives.service";

const narrativeStatusSchema = z.enum(["draft", "in_progress", "completed", "archived"]);
const chapterStatusSchema = z.enum(["draft", "completed", "revised"]);

const createNarrativeSchema = z.object({
  worldId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  synopsis: z.string().trim().min(1).nullable().optional(),
  status: narrativeStatusSchema.default("draft"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  visualStyle: z.record(z.string(), z.unknown()).default({}),
});

const updateNarrativeSchema = z.object({
  worldId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).optional(),
  synopsis: z.string().trim().min(1).nullable().optional(),
  status: narrativeStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  visualStyle: z.record(z.string(), z.unknown()).optional(),
});

const listNarrativesQuerySchema = z.object({
  worldId: z.string().trim().min(1).optional(),
});

const createChapterSchema = z.object({
  order: z.number().int().min(1).optional(),
  title: z.string().trim().min(1),
  content: z.string(),
  status: chapterStatusSchema.default("draft"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const updateChapterSchema = z.object({
  order: z.number().int().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  content: z.string().optional(),
  status: chapterStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const startProgressionSchema = z.object({}).passthrough().default({});

@Controller("narratives")
export class NarrativesController {
  constructor(private readonly narratives: NarrativesService) {}

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createNarrativeSchema.parse(body);
    const narrative = await this.narratives.createNarrative({
      ...parsed,
      worldId: parsed.worldId ?? null,
      synopsis: parsed.synopsis ?? null,
    });
    return { narrative: serializeNarrativeSummary({ ...narrative, chapterCount: 0, assetCount: 0 }) };
  }

  @Get()
  async list(@Query() query: unknown) {
    const narratives = await this.narratives.listNarratives(listNarrativesQuerySchema.parse(query));
    return { narratives: narratives.map(serializeNarrativeSummary) };
  }

  @Get(":narrativeId")
  async detail(@Param("narrativeId") narrativeId: string) {
    const detail = await this.narratives.getNarrativeDetail(narrativeId);
    return {
      narrative: serializeNarrativeSummary(detail.narrative),
      chapters: detail.chapters.map(serializeChapter),
      assets: detail.assets.map(serializeAsset),
    };
  }

  @Patch(":narrativeId")
  async update(@Param("narrativeId") narrativeId: string, @Body() body: unknown) {
    const parsed = updateNarrativeSchema.parse(body);
    const narrative = await this.narratives.updateNarrative(narrativeId, {
      ...parsed,
      ...(parsed.worldId !== undefined ? { worldId: parsed.worldId } : {}),
      ...(parsed.synopsis !== undefined ? { synopsis: parsed.synopsis } : {}),
    });
    const counts = (await this.narratives.getNarrativeDetail(narrative.id)).narrative;
    return { narrative: serializeNarrativeSummary(counts) };
  }

  @Delete(":narrativeId")
  async delete(@Param("narrativeId") narrativeId: string) {
    return { narrative: serializeNarrative(await this.narratives.deleteNarrative(narrativeId)) };
  }

  @Get(":narrativeId/progressions")
  async listProgressions(@Param("narrativeId") narrativeId: string) {
    return { progressions: (await this.narratives.listProgressions(narrativeId)).map(serializeSession) };
  }

  @Get(":narrativeId/progressions/:sessionId")
  async progressionDetail(@Param("narrativeId") narrativeId: string, @Param("sessionId") sessionId: string) {
    return serializeProgressionDetail(await this.narratives.getProgressionDetail(narrativeId, sessionId));
  }

  @Post(":narrativeId/progressions/:sessionId/confirm")
  @HttpCode(200)
  async confirmProgression(@Param("narrativeId") narrativeId: string, @Param("sessionId") sessionId: string) {
    const result = await this.narratives.confirmProgression(narrativeId, sessionId);
    return {
      session: serializeSession(result.session),
      appliedAssets: result.appliedAssets.map(serializeAsset),
    };
  }

  @Post(":narrativeId/progressions/:sessionId/reject")
  @HttpCode(200)
  async rejectProgression(@Param("narrativeId") narrativeId: string, @Param("sessionId") sessionId: string) {
    return { session: serializeSession(await this.narratives.rejectProgression(narrativeId, sessionId)) };
  }

  @Post(":narrativeId/chapters")
  async createChapter(@Param("narrativeId") narrativeId: string, @Body() body: unknown) {
    return { chapter: serializeChapter(await this.narratives.createChapter(narrativeId, createChapterSchema.parse(body))) };
  }

  @Post(":narrativeId/chapters/:chapterId/progress")
  async startProgression(
    @Param("narrativeId") narrativeId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: unknown,
  ) {
    startProgressionSchema.parse(body);
    const session = await this.narratives.startProgression(narrativeId, chapterId);
    return { sessionId: session.id, session: serializeSession(session) };
  }

  @Patch(":narrativeId/chapters/:chapterId")
  async updateChapter(
    @Param("narrativeId") narrativeId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: unknown,
  ) {
    return {
      chapter: serializeChapter(await this.narratives.updateChapter(narrativeId, chapterId, updateChapterSchema.parse(body))),
    };
  }

  @Delete(":narrativeId/chapters/:chapterId")
  async deleteChapter(@Param("narrativeId") narrativeId: string, @Param("chapterId") chapterId: string) {
    return { chapter: serializeChapter(await this.narratives.deleteChapter(narrativeId, chapterId)) };
  }
}

function serializeNarrative(record: NarrativeRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeNarrativeSummary(record: NarrativeSummary) {
  return {
    ...serializeNarrative(record),
    chapterCount: record.chapterCount,
    assetCount: record.assetCount,
  };
}

function serializeChapter(record: ChapterRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeAsset(record: NarrativeAssetRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeSession(record: AgentSessionRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeProgressionDetail(detail: {
  session: AgentSessionRecord;
  subjects: AgentSessionSubjectRecord[];
  contextItems: AgentSessionContextItemRecord[];
  messages: AgentSessionMessageRecord[];
}) {
  return {
    session: serializeSession(detail.session),
    subjects: detail.subjects.map((subject) => ({
      ...subject,
      createdAt: subject.createdAt.toISOString(),
      updatedAt: subject.updatedAt.toISOString(),
    })),
    contextItems: detail.contextItems.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    messages: detail.messages.map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    })),
  };
}
