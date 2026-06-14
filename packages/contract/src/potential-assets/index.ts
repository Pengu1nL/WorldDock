import { z } from "zod";
import { officialWorldAssetTypeSchema } from "../assets";

export const potentialAssetStatusSchema = z.enum([
  "active",
  "dismissed",
  "promoted",
]);

export const potentialAssetEvidenceSchema = z.object({
  messageId: z.string().min(1).optional(),
  quote: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const potentialAssetSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1).optional(),
  type: officialWorldAssetTypeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  evidence: z.array(potentialAssetEvidenceSchema).default([]),
  status: potentialAssetStatusSchema,
  promotedAssetId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const potentialAssetListResponseSchema = z.object({
  potentialAssets: z.array(potentialAssetSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const potentialAssetDetailResponseSchema = z.object({
  potentialAsset: potentialAssetSchema,
});

export type PotentialAssetStatus = z.infer<typeof potentialAssetStatusSchema>;
export type PotentialAssetEvidence = z.infer<typeof potentialAssetEvidenceSchema>;
export type PotentialAsset = z.infer<typeof potentialAssetSchema>;
export type PotentialAssetListResponse = z.infer<
  typeof potentialAssetListResponseSchema
>;
export type PotentialAssetDetailResponse = z.infer<
  typeof potentialAssetDetailResponseSchema
>;
