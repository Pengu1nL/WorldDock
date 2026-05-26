import type { ModerationAction, ModerationStatus, ReportReason, ReportStatus } from "@worlddock/domain";

export const MODERATION_REPOSITORY = Symbol("MODERATION_REPOSITORY");

export type ReportRecord = {
  id: string;
  repositoryId: string;
  reporterId: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ModerationActionRecord = {
  id: string;
  repositoryId: string;
  reportId: string | null;
  moderatorId: string | null;
  action: ModerationAction;
  reason: string;
  previousStatus: ModerationStatus;
  nextStatus: ModerationStatus;
  createdAt: Date;
};

export type ModerationRepository = {
  createReport(input: Omit<ReportRecord, "id" | "status" | "createdAt" | "updatedAt">): Promise<ReportRecord>;
  listReports(status?: ReportStatus): Promise<ReportRecord[]>;
  findReportById(id: string): Promise<ReportRecord | null>;
  updateReportStatus(id: string, status: ReportStatus): Promise<ReportRecord | null>;
  countOpenReports(repositoryId: string): Promise<number>;
  createAction(input: Omit<ModerationActionRecord, "id" | "createdAt">): Promise<ModerationActionRecord>;
};
