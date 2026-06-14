import { z } from "zod";

export const consistencyIssueSeveritySchema = z.enum([
  "low",
  "normal",
  "high",
  "critical",
]);

export const consistencyIssueStatusSchema = z.enum([
  "open",
  "repairing",
  "resolved",
  "ignored",
]);

export const consistencyIssueEvidenceSchema = z.object({
  assetId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  quote: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

export const consistencyIssueSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: consistencyIssueSeveritySchema,
  status: consistencyIssueStatusSchema,
  subjectAssetIds: z.array(z.string().min(1)).default([]),
  evidence: z.array(consistencyIssueEvidenceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().optional(),
});

export const consistencyIssueListResponseSchema = z.object({
  issues: z.array(consistencyIssueSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const consistencyIssueDetailResponseSchema = z.object({
  issue: consistencyIssueSchema,
});

export type ConsistencyIssueSeverity = z.infer<
  typeof consistencyIssueSeveritySchema
>;
export type ConsistencyIssueStatus = z.infer<typeof consistencyIssueStatusSchema>;
export type ConsistencyIssueEvidence = z.infer<
  typeof consistencyIssueEvidenceSchema
>;
export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;
export type ConsistencyIssueListResponse = z.infer<
  typeof consistencyIssueListResponseSchema
>;
export type ConsistencyIssueDetailResponse = z.infer<
  typeof consistencyIssueDetailResponseSchema
>;
