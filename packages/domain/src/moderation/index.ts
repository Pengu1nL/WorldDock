import { z } from "zod";

export const moderationStatusSchema = z.enum(["visible", "limited", "removed"]);
export const moderationActionSchema = z.enum(["keep", "limit", "remove", "scan_flagged"]);
export const reportStatusSchema = z.enum(["open", "resolved"]);
export const reportReasonSchema = z.enum(["spam", "sensitive_content", "abuse", "copyright", "other"]);
export const reportTargetTypeSchema = z.enum(["repository", "creator"]);

export const createReportSchema = z.object({
  reason: reportReasonSchema.default("other"),
  detail: z.string().trim().min(6).max(2000),
});

export const moderateReportSchema = z.object({
  action: z.enum(["keep", "limit", "remove"]),
  reason: z.string().min(1).max(2000),
});

export type ModerationStatus = z.infer<typeof moderationStatusSchema>;
export type ModerationAction = z.infer<typeof moderationActionSchema>;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type ReportReason = z.infer<typeof reportReasonSchema>;
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ModerateReportInput = z.infer<typeof moderateReportSchema>;
