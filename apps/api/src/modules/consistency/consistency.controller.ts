import { Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { consistencyIssueStatusSchema } from "@worlddock/contract/consistency";
import { z } from "zod";
import type { ConsistencyIssueRecord } from "./consistency.repository";
import { ConsistencyService } from "./consistency.service";

const listConsistencyIssuesQuerySchema = z.object({
  status: consistencyIssueStatusSchema.optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

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
}

function serializeConsistencyIssue(issue: ConsistencyIssueRecord) {
  return {
    ...issue,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  };
}

function notFound() {
  return new NotFoundException({
    code: "NOT_FOUND",
    message: "Consistency issue not found.",
  });
}
