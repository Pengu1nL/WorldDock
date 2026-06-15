import { z } from "zod";

export const worldAssetKindSchema = z.enum(["setting", "seed", "conflict"]);

export const worldAssetSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  kind: worldAssetKindSchema,
  title: z.string().min(1),
  category: z.string().min(1).optional(),
  summary: z.string().min(1),
  body: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  position: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const worldAssetRelationSchema = z.object({
  worldId: z.string().min(1),
  sourceAssetId: z.string().min(1),
  targetAssetId: z.string().min(1),
  createdAt: z.string().datetime().optional(),
});

export const worldAssetListSchema = z.object({
  assets: z.array(worldAssetSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const officialWorldAssetTypeSchema = z.enum([
  "character",
  "organization",
  "location",
  "event",
  "rule",
]);

export const officialWorldAssetStatusSchema = z.enum(["active", "archived"]);

export const worldAssetPatchStatusSchema = z.enum(["applied", "reverted"]);

export const officialWorldAssetSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  type: officialWorldAssetTypeSchema,
  name: z.string().min(1),
  summary: z.string().min(1),
  documentKey: z.string().min(1),
  status: officialWorldAssetStatusSchema,
  version: z.number().int().min(1),
  tags: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable().optional(),
});

export const worldAssetIndexSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime().optional(),
});

export const worldAssetRevisionSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  version: z.number().int().min(1),
  markdown: z.string(),
  summary: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export const lineDiffOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("context"),
    text: z.string(),
    lineFrom: z.number().int().min(1),
    lineTo: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("remove"),
    text: z.string(),
    lineFrom: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("add"),
    text: z.string(),
    lineTo: z.number().int().min(1),
  }),
]);

export const worldAssetPatchSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  batchId: z.string().min(1).nullable().optional(),
  status: worldAssetPatchStatusSchema,
  beforeRevisionId: z.string().min(1).nullable().optional(),
  afterRevisionId: z.string().min(1).nullable().optional(),
  diff: z.union([z.string(), z.array(lineDiffOperationSchema)]).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  appliedAt: z.string().datetime().nullable().optional(),
  revertedAt: z.string().datetime().nullable().optional(),
});

export const worldAssetPatchBatchSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  sessionId: z.string().min(1),
  issueId: z.string().min(1).nullable().optional(),
  status: worldAssetPatchStatusSchema,
  patchIds: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  appliedAt: z.string().datetime().nullable().optional(),
  revertedAt: z.string().datetime().nullable().optional(),
});

export const worldAssetDetailSchema = z.object({
  asset: officialWorldAssetSchema,
  markdown: z.string(),
  indexes: z.array(worldAssetIndexSchema).default([]),
  revisions: z.array(worldAssetRevisionSchema).default([]),
});

export const officialWorldAssetListSchema = z.object({
  assets: z.array(officialWorldAssetSchema),
  nextCursor: z.string().min(1).nullable(),
});

export type WorldAssetKind = z.infer<typeof worldAssetKindSchema>;
export type WorldAsset = z.infer<typeof worldAssetSchema>;
export type WorldAssetRelation = z.infer<typeof worldAssetRelationSchema>;
export type WorldAssetList = z.infer<typeof worldAssetListSchema>;
export type OfficialWorldAssetType = z.infer<typeof officialWorldAssetTypeSchema>;
export type OfficialWorldAsset = z.infer<typeof officialWorldAssetSchema>;
export type OfficialWorldAssetStatus = z.infer<
  typeof officialWorldAssetStatusSchema
>;
export type WorldAssetIndex = z.infer<typeof worldAssetIndexSchema>;
export type WorldAssetDetail = z.infer<typeof worldAssetDetailSchema>;
export type WorldAssetRevision = z.infer<typeof worldAssetRevisionSchema>;
export type LineDiffOperation = z.infer<typeof lineDiffOperationSchema>;
export type WorldAssetPatchStatus = z.infer<typeof worldAssetPatchStatusSchema>;
export type WorldAssetPatch = z.infer<typeof worldAssetPatchSchema>;
export type WorldAssetPatchBatch = z.infer<typeof worldAssetPatchBatchSchema>;
export type OfficialWorldAssetList = z.infer<typeof officialWorldAssetListSchema>;
