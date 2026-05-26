import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateReportInput, ModerateReportInput, ModerationAction, ModerationStatus, ReportStatus } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { OUTBOX_REPOSITORY, type OutboxRepository } from "../outbox/outbox.repository";
import { REPOSITORY_REPOSITORY, type PublicRepositoryRecord, type RepositoryRepository } from "../repositories/repository.repository";
import { MODERATION_REPOSITORY, type ModerationRepository } from "./moderation.repository";

const duplicateReportThreshold = 3;

@Injectable()
export class ModerationService {
  constructor(
    @Inject(MODERATION_REPOSITORY) private readonly moderation: ModerationRepository,
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
  ) {}

  async reportRepository(subject: AuthSubject, repositoryId: string, input: CreateReportInput) {
    const repository = await this.requireVisibleRepository(repositoryId);
    const report = await this.moderation.createReport({
      repositoryId: repository.id,
      reporterId: subject.user.id,
      reason: input.reason,
      detail: input.detail ?? null,
    });
    const openReportCount = await this.moderation.countOpenReports(repository.id);
    if (openReportCount >= duplicateReportThreshold) {
      await this.outbox.createEvent({
        type: "repository.moderation_scan_requested",
        aggregateId: repository.id,
        payload: {
          repositoryId: repository.id,
          reportId: report.id,
          source: "duplicate-report-threshold",
          openReportCount,
        },
      });
    }
    return this.toReportResponse(report);
  }

  async listReports(subject: AuthSubject, status?: ReportStatus) {
    this.assertAdmin(subject);
    const reports = await this.moderation.listReports(status);
    return Promise.all(reports.map((report) => this.toReportResponse(report)));
  }

  async moderateReport(subject: AuthSubject, reportId: string, input: ModerateReportInput) {
    this.assertAdmin(subject);
    const report = await this.moderation.findReportById(reportId);
    if (!report) throw this.notFound("Report not found.");
    const repository = await this.repositories.findById(report.repositoryId);
    if (!repository) throw this.notFound("Repository not found.");

    const action = await this.applyModerationAction({
      repository,
      reportId: report.id,
      moderatorId: subject.user.id,
      action: input.action,
      reason: input.reason,
    });
    const resolvedReport = await this.moderation.updateReportStatus(report.id, "resolved");

    return {
      report: resolvedReport ? this.toReportResponse(resolvedReport) : this.toReportResponse(report),
      action: toActionResponse(action),
    };
  }

  async flagRepositoryFromScan(repositoryId: string, reason: string) {
    const repository = await this.repositories.findById(repositoryId);
    if (!repository || repository.moderationStatus === "removed") return null;
    return this.applyModerationAction({
      repository,
      reportId: null,
      moderatorId: null,
      action: "scan_flagged",
      reason,
    });
  }

  private async applyModerationAction(input: {
    repository: PublicRepositoryRecord;
    reportId: string | null;
    moderatorId: string | null;
    action: ModerateReportInput["action"] | "scan_flagged";
    reason: string;
  }) {
    const nextStatus = toNextStatus(input.repository.moderationStatus, input.action);
    const updatedRepository = nextStatus === input.repository.moderationStatus
      ? input.repository
      : await this.repositories.setModerationStatus(input.repository.id, {
          status: nextStatus,
          reason: input.reason,
          moderatedAt: new Date(),
        }) ?? input.repository;
    const action = await this.moderation.createAction({
      repositoryId: input.repository.id,
      reportId: input.reportId,
      moderatorId: input.moderatorId,
      action: input.action,
      reason: input.reason,
      previousStatus: input.repository.moderationStatus,
      nextStatus,
    });

    if (nextStatus !== input.repository.moderationStatus) {
      await this.outbox.createEvent({
        type: `repository.moderation_${nextStatus}`,
        aggregateId: updatedRepository.id,
        payload: {
          repositoryId: updatedRepository.id,
          actionId: action.id,
          reportId: input.reportId,
          previousStatus: input.repository.moderationStatus,
          nextStatus,
        },
      });
    }

    return action;
  }

  private async toReportResponse(report: Awaited<ReturnType<ModerationRepository["findReportById"]>> extends infer Report ? NonNullable<Report> : never) {
    const repository = await this.repositories.findById(report.repositoryId);
    return {
      id: report.id,
      repositoryId: report.repositoryId,
      repository: repository ? {
        id: repository.id,
        owner: repository.ownerName,
        slug: repository.slug,
        name: repository.name,
        moderationStatus: repository.moderationStatus,
      } : null,
      reporterId: report.reporterId,
      reason: report.reason,
      detail: report.detail,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private async requireVisibleRepository(repositoryId: string) {
    const repository = await this.repositories.findById(repositoryId);
    if (!repository || repository.moderationStatus === "removed") {
      throw this.notFound("Repository not found.");
    }
    return repository;
  }

  private assertAdmin(subject: AuthSubject) {
    if (subject.user.role !== "admin") {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Admin access is required." });
    }
  }

  private notFound(message: string) {
    return new NotFoundException({ code: "NOT_FOUND", message });
  }
}

function toNextStatus(current: ModerationStatus, action: ModerateReportInput["action"] | "scan_flagged") {
  if (action === "keep") return current;
  if (action === "remove") return "removed";
  return "limited";
}

function toActionResponse(action: {
  id: string;
  repositoryId: string;
  reportId: string | null;
  moderatorId: string | null;
  action: ModerationAction;
  reason: string;
  previousStatus: ModerationStatus;
  nextStatus: ModerationStatus;
  createdAt: Date;
}) {
  return {
    ...action,
    createdAt: action.createdAt.toISOString(),
  };
}
