import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { officialWorldAssetStatusSchema, officialWorldAssetTypeSchema } from "@worlddock/contract/assets";
import { z } from "zod";
import type {
  AgentSessionContextItemRecord,
  AgentSessionMessageRecord,
  AgentSessionRecord,
  AgentSessionSubjectRecord,
} from "../agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../agent-sessions/agent-sessions.service";
import type {
  OfficialAssetDetailRecord,
  OfficialAssetRecord,
  OfficialAssetRevisionRecord,
  OfficialAssetSectionIndexRecord,
} from "./official-assets.repository";
import { OfficialAssetsService } from "./official-assets.service";

const createOfficialAssetSchema = z.object({
  type: officialWorldAssetTypeSchema,
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  markdown: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const listOfficialAssetsQuerySchema = z.object({
  type: officialWorldAssetTypeSchema.optional(),
  q: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

const updateOfficialAssetSchema = z.object({
  name: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: officialWorldAssetStatusSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, {
  message: "At least one official asset update field is required.",
});

const createOfficialAssetEditSessionSchema = z.object({
  title: z.string().trim().min(1).optional(),
}).strict();

@Controller("worlds/:worldId/official-assets")
export class OfficialAssetsController {
  constructor(
    @Inject(OfficialAssetsService) private readonly officialAssets: OfficialAssetsService,
    @Inject(AgentSessionsService) private readonly agentSessions: AgentSessionsService,
  ) {}

  @Post()
  async create(@Param("worldId") worldId: string, @Body() body: unknown) {
    return serializeOfficialAssetDetail(await this.officialAssets.createAsset(
      worldId,
      createOfficialAssetSchema.parse(body),
    ));
  }

  @Get()
  async list(@Param("worldId") worldId: string, @Query() query: unknown) {
    const result = await this.officialAssets.listAssets(worldId, listOfficialAssetsQuerySchema.parse(query));
    return {
      assets: result.assets.map(serializeOfficialAsset),
      nextCursor: result.nextCursor,
    };
  }

  @Get(":assetId")
  async detail(@Param("worldId") worldId: string, @Param("assetId") assetId: string) {
    return serializeOfficialAssetDetail(await this.officialAssets.getAsset(worldId, assetId));
  }

  @Post(":assetId/edit-sessions")
  async createEditSession(
    @Param("worldId") worldId: string,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
  ) {
    const assetDetail = await this.officialAssets.getAsset(worldId, assetId);
    const input = createOfficialAssetEditSessionSchema.parse(body);
    const session = await this.agentSessions.createSession(worldId, {
      kind: "asset_edit",
      subjectAssetId: assetId,
      title: input.title,
    });

    await this.agentSessions.createContextItem(session.id, {
      kind: "asset_document",
      targetId: assetDetail.asset.id,
      title: assetDetail.asset.name,
      summary: assetDetail.asset.summary,
      metadata: {
        documentKey: assetDetail.asset.documentKey,
        version: assetDetail.asset.version,
        source: "initial",
      },
    });

    return serializeAgentSessionDetail(await this.agentSessions.getSessionDetail(worldId, session.id));
  }

  @Patch(":assetId")
  async update(
    @Param("worldId") worldId: string,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
  ) {
    return serializeOfficialAssetDetail(await this.officialAssets.updateAsset(
      worldId,
      assetId,
      updateOfficialAssetSchema.parse(body),
    ));
  }
}

function serializeOfficialAssetDetail(detail: OfficialAssetDetailRecord & { markdown: string }) {
  return {
    asset: serializeOfficialAsset(detail.asset),
    markdown: detail.markdown,
    indexes: detail.indexes.map(serializeOfficialAssetIndex),
    revisions: detail.revisions.map(serializeOfficialAssetRevision),
  };
}

function serializeOfficialAsset(asset: OfficialAssetRecord) {
  return {
    ...asset,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    archivedAt: asset.archivedAt?.toISOString() ?? null,
  };
}

function serializeOfficialAssetRevision(revision: OfficialAssetRevisionRecord) {
  return {
    ...revision,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
  };
}

function serializeOfficialAssetIndex(index: OfficialAssetSectionIndexRecord) {
  return {
    ...index,
    createdAt: index.createdAt.toISOString(),
    updatedAt: index.updatedAt.toISOString(),
  };
}

function serializeAgentSession(record: AgentSessionRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeAgentSessionDetail(detail: {
  session: AgentSessionRecord;
  subjects: AgentSessionSubjectRecord[];
  contextItems: AgentSessionContextItemRecord[];
  messages: AgentSessionMessageRecord[];
}) {
  return {
    session: serializeAgentSession(detail.session),
    subjects: detail.subjects.map(serializeAgentSessionSubject),
    contextItems: detail.contextItems.map(serializeAgentSessionContextItem),
    messages: detail.messages.map(serializeAgentSessionMessage),
  };
}

function serializeAgentSessionSubject(record: AgentSessionSubjectRecord) {
  return {
    id: record.id,
    sessionId: record.sessionId,
    subjectKind: record.kind,
    subjectId: record.targetId,
    role: record.role,
    title: record.title,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeAgentSessionContextItem(record: AgentSessionContextItemRecord) {
  const source = typeof record.metadata.source === "string" ? record.metadata.source : undefined;
  return {
    ...record,
    ...(source ? { source } : {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeAgentSessionMessage(record: AgentSessionMessageRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
