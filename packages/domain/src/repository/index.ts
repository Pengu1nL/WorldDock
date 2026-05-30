import { z } from "zod";
import { moderationStatusSchema } from "../moderation";
import { releaseChangeSchema, releaseStatusSchema } from "../releases";

export const licenseSchema = z.enum([
  "all-rights-reserved",
  "non-commercial-attribution",
  "free-fork-attribution",
  "commercial-attribution",
  "no-fork",
]);

export const releaseSchema = z.object({
  version: z.string().min(1),
  updated: z.string().min(1),
  note: z.string().min(1),
  status: releaseStatusSchema.default("published"),
  addedSettings: z.number().int().min(0),
  changedSettings: z.number().int().min(0),
  removedSettings: z.number().int().min(0),
  addedSeeds: z.number().int().min(0),
  source: z.enum(["cloud-publish", "local-push"]),
});

export const releaseDiffSchema = z.object({
  addedSettings: z.number().int().min(0),
  changedSettings: z.number().int().min(0),
  removedSettings: z.number().int().min(0),
  addedSeeds: z.number().int().min(0),
});

export const releaseDetailSchema = z.object({
  id: z.string().min(1),
  repositoryId: z.string().min(1),
  version: z.string().min(1),
  note: z.string().min(1),
  status: releaseStatusSchema.default("published"),
  license: licenseSchema,
  diff: releaseDiffSchema,
  changes: z.array(releaseChangeSchema).default([]),
  createdAt: z.string().datetime(),
});

export const publicRepositorySchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  readme: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)),
  stars: z.number().int().min(0),
  forks: z.number().int().min(0),
  seeds: z.number().int().min(0).optional(),
  maturity: z.number().int().min(0).max(100).optional(),
  updated: z.string().min(1),
  version: z.string().min(1),
  visibility: z.literal("public"),
  license: licenseSchema,
  moderationStatus: moderationStatusSchema.default("visible"),
  moderationReason: z.string().nullable().optional(),
  forkedFrom: z.string().min(1).optional(),
  releases: z.array(releaseSchema).default([]),
});

export const repositoryDetailSchema = publicRepositorySchema;

const snapshotArchiveEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  relations: z.array(z.string().min(1)).optional(),
});

const snapshotStorySeedSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  hook: z.string().min(1),
  trigger: z.string().nullable().optional(),
  conflict: z.string().min(1),
  protagonists: z.string().nullable().optional(),
  questions: z.array(z.string().min(1)).optional(),
});

const snapshotConflictSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  related: z.array(z.string().min(1)).optional(),
  derivedSeeds: z.array(z.string().min(1)).optional(),
});

const snapshotAssetRelationSchema = z.object({
  sourceAssetId: z.string().min(1),
  targetAssetId: z.string().min(1),
});

export const releaseSnapshotSchema = z.object({
  repositoryId: z.string().min(1),
  releaseId: z.string().min(1),
  world: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    summary: z.string().min(1),
    tags: z.array(z.string().min(1)),
    maturity: z.number().int().min(0).max(100),
  }),
  archiveEntries: z.array(snapshotArchiveEntrySchema),
  storySeeds: z.array(snapshotStorySeedSchema),
  conflicts: z.array(snapshotConflictSchema),
  assetRelations: z.array(snapshotAssetRelationSchema).default([]),
  createdAt: z.string().datetime(),
});

export const publishWorldResponseSchema = z.object({
  repository: repositoryDetailSchema,
  release: releaseDetailSchema,
});

export type PublicRepository = z.infer<typeof publicRepositorySchema>;
export type Release = z.infer<typeof releaseSchema>;
export type ReleaseDiff = z.infer<typeof releaseDiffSchema>;
export type ReleaseDetail = z.infer<typeof releaseDetailSchema>;
export type RepositoryDetail = z.infer<typeof repositoryDetailSchema>;
export type ReleaseSnapshot = z.infer<typeof releaseSnapshotSchema>;
export type PublishWorldResponse = z.infer<typeof publishWorldResponseSchema>;
