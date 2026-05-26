import { z } from "zod";

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

export type AgentSeed = z.infer<typeof agentSeedSchema>;
export type WorldSuggestion = z.infer<typeof suggestionSchema>;
export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;
