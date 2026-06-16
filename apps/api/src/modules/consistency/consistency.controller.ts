import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { consistencyIssueStatusSchema } from "@worlddock/contract/consistency";
import { z } from "zod";
import type {
  AgentSessionContextItemRecord,
  AgentSessionMessageRecord,
  AgentSessionRecord,
  AgentSessionSubjectRecord,
} from "../agent-sessions/agent-sessions.repository";
import type { OfficialAssetPatchBatchView } from "../official-assets/world-asset-patches.service";
import type { ConsistencyIssueRecord } from "./consistency.repository";
import { ConsistencyService } from "./consistency.service";

const listConsistencyIssuesQuerySchema = z.object({
  status: consistencyIssueStatusSchema.optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

const createRepairSessionSchema = z.object({
  title: z.string().trim().min(1).optional(),
}).strict();

const patchBatchSchema = z.object({
  sessionId: z.string().trim().min(1),
  patches: z.array(z.object({
    assetId: z.string().trim().min(1),
    afterMarkdown: z.string().refine((value) => value.trim().length > 0, {
      message: "Patch markdown is required.",
    }),
    reason: z.string().trim().min(1).optional(),
  }).strict()).min(1),
}).strict();

@Controller("worlds/:worldId/consistency-issues")
export class ConsistencyController {
  constructor(@Inject(ConsistencyService) private readonly consistency: ConsistencyService) {}

  @Post("check")
  async check(@Param("worldId") worldId: string) {
    const result = await this.consistency.runCheck(worldId);
    return {
      issues: result.issues.map(serializeConsistencyIssue),
    };
  }

  @Get()
  async list(@Param("worldId") worldId: string, @Query() query: unknown) {
    const result = await this.consistency.listIssues(worldId, listConsistencyIssuesQuerySchema.parse(query));
    return {
      issues: result.issues.map(serializeConsistencyIssue),
      nextCursor: result.nextCursor,
    };
  }

  @Get(":issueId")
  async detail(@Param("worldId") worldId: string, @Param("issueId") issueId: string) {
    const issue = await this.consistency.getIssue(worldId, issueId);
    if (!issue) throw notFound();
    return {
      issue: serializeConsistencyIssue(issue),
    };
  }

  @Post(":issueId/ignore")
  @HttpCode(200)
  async ignore(@Param("worldId") worldId: string, @Param("issueId") issueId: string) {
    const issue = await this.consistency.updateIssueStatus(worldId, issueId, "ignored");
    if (!issue) throw notFound();
    return {
      issue: serializeConsistencyIssue(issue),
    };
  }

  @Post(":issueId/reopen")
  @HttpCode(200)
  async reopen(@Param("worldId") worldId: string, @Param("issueId") issueId: string) {
    const issue = await this.consistency.updateIssueStatus(worldId, issueId, "open");
    if (!issue) throw notFound();
    return {
      issue: serializeConsistencyIssue(issue),
    };
  }

  @Post(":issueId/repair-sessions")
  async createRepairSession(
    @Param("worldId") worldId: string,
    @Param("issueId") issueId: string,
    @Body() body: unknown,
  ) {
    return serializeAgentSessionDetail(await this.consistency.createRepairSession(
      worldId,
      issueId,
      createRepairSessionSchema.parse(body ?? {}),
    ));
  }

  @Post(":issueId/patch-batches")
  async applyPatchBatch(
    @Param("worldId") worldId: string,
    @Param("issueId") issueId: string,
    @Body() body: unknown,
  ) {
    const input = patchBatchSchema.parse(body);
    return {
      batch: serializePatchBatch(await this.consistency.applyPatchBatch({
        worldId,
        issueId,
        ...input,
      })),
    };
  }

  @Post(":issueId/patch-batches/:batchId/revert")
  @HttpCode(200)
  async revertPatchBatch(
    @Param("worldId") worldId: string,
    @Param("issueId") issueId: string,
    @Param("batchId") batchId: string,
  ) {
    return {
      batch: serializePatchBatch(await this.consistency.revertPatchBatch(worldId, issueId, batchId)),
    };
  }
}

function serializeConsistencyIssue(issue: ConsistencyIssueRecord) {
  return {
    ...issue,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  };
}

function serializePatchBatch(batch: OfficialAssetPatchBatchView) {
  return {
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    appliedAt: batch.appliedAt?.toISOString() ?? null,
    revertedAt: batch.revertedAt?.toISOString() ?? null,
  };
}

function serializeAgentSessionDetail(detail: {
  session: AgentSessionRecord;
  subjects: AgentSessionSubjectRecord[];
  contextItems: AgentSessionContextItemRecord[];
  messages: AgentSessionMessageRecord[];
}) {
  return {
    session: serializeSession(detail.session),
    subjects: detail.subjects.map(serializeSubject),
    contextItems: detail.contextItems.map(serializeContextItem),
    messages: detail.messages.map(serializeMessage),
  };
}

function serializeSession(record: AgentSessionRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeSubject(record: AgentSessionSubjectRecord) {
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

function serializeContextItem(record: AgentSessionContextItemRecord) {
  const source = typeof record.metadata.source === "string" ? record.metadata.source : undefined;
  return {
    ...record,
    ...(source ? { source } : {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeMessage(record: AgentSessionMessageRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function notFound() {
  return new NotFoundException({
    code: "NOT_FOUND",
    message: "Consistency issue not found.",
  });
}
