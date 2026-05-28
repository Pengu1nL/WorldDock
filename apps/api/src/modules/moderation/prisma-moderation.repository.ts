import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { moderationActionSchema, moderationStatusSchema, reportReasonSchema, reportStatusSchema, reportTargetTypeSchema } from "@worlddock/domain";
import type { ModerationActionRecord, ModerationRepository, ReportRecord } from "./moderation.repository";

@Injectable()
export class PrismaModerationRepository implements ModerationRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async createReport(input: Parameters<ModerationRepository["createReport"]>[0]) {
    const report = await this.prisma.report.create({ data: input });
    return mapReport(report);
  }

  async findReportByReporterTargetOnDay(input: Parameters<ModerationRepository["findReportByReporterTargetOnDay"]>[0]) {
    const report = await this.prisma.report.findFirst({
      where: {
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        createdAt: {
          gte: input.dayStart,
          lt: input.dayEnd,
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return report ? mapReport(report) : null;
  }

  async listReports(status?: ReportRecord["status"]) {
    const reports = await this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return reports.map(mapReport);
  }

  async findReportById(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    return report ? mapReport(report) : null;
  }

  async updateReportStatus(id: string, status: ReportRecord["status"]) {
    const updated = await this.prisma.report.updateMany({ where: { id }, data: { status } });
    if (updated.count === 0) return null;
    const report = await this.prisma.report.findUnique({ where: { id } });
    return report ? mapReport(report) : null;
  }

  async countOpenReports(repositoryId: string) {
    return this.prisma.report.count({ where: { repositoryId, status: "open" } });
  }

  async countOpenReportsForTarget(targetType: ReportRecord["targetType"], targetId: string) {
    return this.prisma.report.count({ where: { targetType, targetId, status: "open" } });
  }

  async createAction(input: Parameters<ModerationRepository["createAction"]>[0]) {
    const action = await this.prisma.moderationAction.create({ data: input });
    return mapAction(action);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapReport(record: {
  id: string;
  repositoryId: string | null;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): ReportRecord {
  return {
    id: record.id,
    repositoryId: record.repositoryId,
    reporterId: record.reporterId,
    targetType: reportTargetTypeSchema.parse(record.targetType),
    targetId: record.targetId,
    reason: reportReasonSchema.parse(record.reason),
    detail: record.detail,
    status: reportStatusSchema.parse(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapAction(record: {
  id: string;
  repositoryId: string;
  reportId: string | null;
  moderatorId: string | null;
  action: string;
  reason: string;
  previousStatus: string;
  nextStatus: string;
  createdAt: Date;
}): ModerationActionRecord {
  return {
    id: record.id,
    repositoryId: record.repositoryId,
    reportId: record.reportId,
    moderatorId: record.moderatorId,
    action: moderationActionSchema.parse(record.action),
    reason: record.reason,
    previousStatus: moderationStatusSchema.parse(record.previousStatus),
    nextStatus: moderationStatusSchema.parse(record.nextStatus),
    createdAt: record.createdAt,
  };
}
