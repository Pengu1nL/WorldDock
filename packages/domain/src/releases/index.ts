import { z } from "zod";

export const releaseStatusSchema = z.enum(["draft", "published", "rolled_back"]);
export const releaseDiffKindSchema = z.enum(["added", "changed", "removed"]);

export const releaseChangeSchema = z.object({
  assetId: z.string().min(1),
  kind: releaseDiffKindSchema,
  title: z.string().min(1),
  beforeHash: z.string().optional(),
  afterHash: z.string().optional(),
});

export const worldReleaseSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  repositoryId: z.string().min(1),
  version: z.string().regex(/^v\d+\.\d+\.\d+$/),
  status: releaseStatusSchema,
  note: z.string().min(1),
  changes: z.array(releaseChangeSchema),
  createdAt: z.string().datetime(),
});

export const releasePreflightCheckSchema = z.object({
  code: z.enum(["assets", "license", "release_note", "moderation", "entitlement"]),
  ok: z.boolean(),
  message: z.string().min(1),
});

export const releasePreflightSchema = z.object({
  ok: z.boolean(),
  checks: z.array(releasePreflightCheckSchema),
  changes: z.array(releaseChangeSchema),
});

export const forkSyncPreviewSchema = z.object({
  forkId: z.string().min(1),
  repositoryId: z.string().min(1),
  sourceReleaseId: z.string().min(1),
  upstreamReleaseId: z.string().min(1),
  hasUpstreamChanges: z.boolean(),
  changes: z.array(releaseChangeSchema),
});

export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;
export type ReleaseDiffKind = z.infer<typeof releaseDiffKindSchema>;
export type ReleaseChange = z.infer<typeof releaseChangeSchema>;
export type WorldRelease = z.infer<typeof worldReleaseSchema>;
export type ReleasePreflight = z.infer<typeof releasePreflightSchema>;
export type ForkSyncPreview = z.infer<typeof forkSyncPreviewSchema>;
