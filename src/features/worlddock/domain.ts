import { z } from "zod";

export const worldStatusSchema = z.enum(["draft", "unpublished", "published"]);
export const worldModeSchema = z.enum(["cloud", "local"]);
export const visibilitySchema = z.enum(["private", "public"]);

export const worldSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1),
  maturity: z.number().int().min(0).max(100),
  status: worldStatusSchema,
  visibility: visibilitySchema,
  archive: z.number().int().min(0),
  seeds: z.number().int().min(0),
  conflicts: z.number().int().min(0),
  updated: z.string().min(1),
  mode: worldModeSchema,
  hasUnsaved: z.boolean().optional(),
  hasUnpushed: z.boolean().optional(),
  starred: z.number().int().min(0).optional(),
  forked: z.number().int().min(0).optional(),
  isNew: z.boolean().optional(),
});

export const suggestionKindSchema = z.enum(["setting", "conflict", "seed"]);

const baseSuggestionSchema = z.object({
  id: z.string().min(1),
  kind: suggestionKindSchema,
  category: z.string().min(1),
  title: z.string().min(1),
});

export const settingSuggestionSchema = baseSuggestionSchema.extend({
  kind: z.literal("setting"),
  summary: z.string().min(1),
  body: z.string().min(1),
  relations: z.array(z.string().min(1)).optional(),
});

export const conflictSuggestionSchema = baseSuggestionSchema.extend({
  kind: z.literal("conflict"),
  summary: z.string().min(1),
  body: z.string().min(1),
  related: z.array(z.string().min(1)).optional(),
  derivedSeeds: z.array(z.string().min(1)).optional(),
});

export const seedSuggestionSchema = baseSuggestionSchema.extend({
  kind: z.literal("seed"),
  hook: z.string().min(1),
  trigger: z.string().min(1),
  conflict: z.string().min(1),
  protagonists: z.string().min(1),
  questions: z.array(z.string().min(1)),
  parentConflict: z.string().min(1).optional(),
});

export const suggestionSchema = z.discriminatedUnion("kind", [
  settingSuggestionSchema,
  conflictSuggestionSchema,
  seedSuggestionSchema,
]);

export const consistencyIssueSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  involves: z.array(z.string().min(1)),
  severity: z.enum(["normal", "important"]),
});

export const agentSeedSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  inspiration: z.string().min(1),
  suggestedName: z.string().min(1),
  suggestedType: z.string().min(1),
  styles: z.array(z.string().min(1)),
  coreSetting: z.string().min(1),
  coreConflict: z.string().min(1),
  directions: z.array(z.string().min(1)),
  firstQuestion: z.string().min(1),
  tools: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    detail: z.string().min(1),
  })),
  responseChunks: z.array(z.string()),
  suggestions: z.array(suggestionSchema),
  archive: z.record(z.string(), z.number().int().min(0)),
  issues: z.array(consistencyIssueSchema),
});

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
  addedSettings: z.number().int().min(0),
  changedSettings: z.number().int().min(0),
  removedSettings: z.number().int().min(0),
  addedSeeds: z.number().int().min(0),
  source: z.enum(["cloud-publish", "local-push"]),
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
  forkedFrom: z.string().min(1).optional(),
  releases: z.array(releaseSchema).default([]),
});

export const appErrorKindSchema = z.enum([
  "save-failed",
  "network-error",
  "model-unavailable",
  "insufficient-balance",
  "permission-denied",
  "community-disconnected",
]);

export type World = z.infer<typeof worldSchema>;
export type AgentSeed = z.infer<typeof agentSeedSchema>;
export type WorldSuggestion = z.infer<typeof suggestionSchema>;
export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;
export type PublicRepository = z.infer<typeof publicRepositorySchema>;
export type Release = z.infer<typeof releaseSchema>;
export type WorldMode = z.infer<typeof worldModeSchema>;
export type AppErrorKind = z.infer<typeof appErrorKindSchema>;
