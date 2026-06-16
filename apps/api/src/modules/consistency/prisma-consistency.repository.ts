import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import {
  consistencyIssueSeveritySchema,
  consistencyIssueStatusSchema,
} from "@worlddock/contract/consistency";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import {
  decodeConsistencyIssueListCursor,
  encodeConsistencyIssueListCursor,
  normalizeConsistencyIssueListLimit,
  type ConsistencyIssueEvidenceRecord,
  type ConsistencyIssueRecord,
  type ConsistencyRepository,
} from "./consistency.repository";

@Injectable()
export class PrismaConsistencyRepository implements ConsistencyRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createIssueIfOpenDedupeKeyAbsent(
    input: Parameters<ConsistencyRepository["createIssueIfOpenDedupeKeyAbsent"]>[0],
    dedupeKey: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dedupeLockKey(input.worldId, dedupeKey)}))`;

      const existingIssues = await tx.consistencyIssue.findMany({
        where: {
          worldId: input.worldId,
          status: "open",
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      const existingIssue = existingIssues.map(mapConsistencyIssue)
        .find((issue) => issue.metadata.dedupeKey === dedupeKey);
      if (existingIssue) return existingIssue;

      const issue = await tx.consistencyIssue.create({
        data: {
          worldId: input.worldId,
          title: input.title,
          description: input.description,
          involves: input.involves,
          severity: input.severity,
          status: "open",
          subjectAssetIds: input.subjectAssetIds,
          evidence: input.evidence as never,
          metadata: { ...(input.metadata ?? {}), dedupeKey } as never,
        },
      });
      return mapConsistencyIssue(issue);
    });
  }

  async listIssues(worldId: string, query: Parameters<ConsistencyRepository["listIssues"]>[1] = {}) {
    const where: Record<string, unknown> = { worldId };
    if (query.status) where.status = query.status;
    if (query.cursor) {
      const cursor = decodeConsistencyIssueListCursor(query.cursor);
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ];
    }

    const limit = normalizeConsistencyIssueListLimit(query.limit);
    const issues = await this.prisma.consistencyIssue.findMany({
      where: where as never,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit + 1,
    });
    const page = issues.slice(0, limit).map(mapConsistencyIssue);
    return {
      issues: page,
      nextCursor: issues.length > limit ? encodeConsistencyIssueListCursor(page[page.length - 1]) : null,
    };
  }

  async getIssue(worldId: string, issueId: string) {
    const issue = await this.prisma.consistencyIssue.findFirst({ where: { worldId, id: issueId } });
    return issue ? mapConsistencyIssue(issue) : null;
  }

  async updateIssueStatus(
    worldId: string,
    issueId: string,
    status: Parameters<ConsistencyRepository["updateIssueStatus"]>[2],
  ) {
    const resolvedAt = status === "resolved" || status === "ignored" ? new Date() : null;
    const updated = await this.prisma.consistencyIssue.updateMany({
      where: { worldId, id: issueId },
      data: { status, resolvedAt },
    });
    if (updated.count === 0) return null;
    const issue = await this.prisma.consistencyIssue.findUnique({ where: { id: issueId } });
    return issue ? mapConsistencyIssue(issue) : null;
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapConsistencyIssue(issue: {
  id: string;
  worldId: string;
  title: string;
  description: string;
  involves: string[];
  severity: string;
  status: string;
  subjectAssetIds: string[];
  evidence: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}): ConsistencyIssueRecord {
  return {
    id: issue.id,
    worldId: issue.worldId,
    title: issue.title,
    description: issue.description,
    involves: [...issue.involves],
    severity: consistencyIssueSeveritySchema.parse(issue.severity),
    status: consistencyIssueStatusSchema.parse(issue.status),
    subjectAssetIds: [...issue.subjectAssetIds],
    evidence: parseEvidence(issue.evidence),
    metadata: isRecord(issue.metadata) ? issue.metadata : {},
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    resolvedAt: issue.resolvedAt,
  };
}

function parseEvidence(value: unknown): ConsistencyIssueEvidenceRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEvidence);
}

function isEvidence(value: unknown): value is ConsistencyIssueEvidenceRecord {
  return isRecord(value) && typeof value.quote === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupeLockKey(worldId: string, dedupeKey: string) {
  return `consistency-issue:${worldId}:${dedupeKey}`;
}
