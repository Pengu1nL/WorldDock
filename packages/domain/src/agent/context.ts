import { z } from "zod";

export const worldDisclosureLevelSchema = z.enum(["manifest", "card", "brief", "detail", "source_fragment", "release_delta"]);
export const worldContextAssetKindSchema = z.enum(["world", "setting", "seed", "conflict"]);
export const worldDisclosableAssetKindSchema = z.enum(["setting", "seed", "conflict"]);

export const worldContextBudget = {
  manifestTokens: 1200,
  initialCardCount: 8,
  initialBriefCount: 3,
  cardTokens: 80,
  briefTokens: 600,
  detailTokens: 2000,
  sourceFragmentTokens: 1200,
} as const;

export const worldAssetCardSchema = z.object({
  worldId: z.string().min(1),
  targetId: z.string().min(1),
  kind: worldDisclosableAssetKindSchema,
  title: z.string().min(1),
  excerpt: z.string().min(1),
  tags: z.array(z.string()).default([]),
  relations: z.array(z.string()).default([]),
  updatedAt: z.string().datetime().optional(),
  score: z.number().default(0),
});

export const worldAssetBriefSchema = worldAssetCardSchema.extend({
  summary: z.string().min(1),
  facts: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  sourcePointers: z.array(z.string()).default([]),
});

export const worldManifestSchema = z.object({
  worldId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  status: z.string().min(1),
  visibility: z.string().min(1),
  assetCounts: z.object({
    archive: z.number().int().nonnegative(),
    seeds: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
    official: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
  }),
  recentChanges: z.array(z.string()).default([]),
  index: z.array(worldAssetCardSchema).default([]),
});

export const worldContextRefSchema = z.object({
  level: worldDisclosureLevelSchema,
  kind: worldContextAssetKindSchema,
  title: z.string().min(1),
  excerpt: z.string().min(1),
  targetId: z.string().min(1).optional(),
  source: z.enum(["initial", "tool"]).default("initial"),
});

export type WorldDisclosureLevel = z.infer<typeof worldDisclosureLevelSchema>;
export type WorldContextAssetKind = z.infer<typeof worldContextAssetKindSchema>;
export type WorldDisclosableAssetKind = z.infer<typeof worldDisclosableAssetKindSchema>;
export type WorldAssetCard = z.infer<typeof worldAssetCardSchema>;
export type WorldAssetBrief = z.infer<typeof worldAssetBriefSchema>;
export type WorldManifest = z.infer<typeof worldManifestSchema>;
export type WorldContextRef = z.infer<typeof worldContextRefSchema>;
