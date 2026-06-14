import { z } from "zod";
import { worldContextRefSchema } from "./context";

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

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
});

export const agentRunStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);

export const agentRunSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  userId: z.string().min(1),
  status: agentRunStatusSchema,
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  tokenUsage: tokenUsageSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  failedAt: z.string().datetime().nullable().optional(),
  cancelledAt: z.string().datetime().nullable().optional(),
  errorCode: z.string().min(1).nullable().optional(),
  errorMessage: z.string().min(1).nullable().optional(),
});

export const contextRefSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  kind: z.enum(["world", "archive", "seed", "conflict"]),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  targetId: z.string().min(1).optional(),
  level: worldContextRefSchema.shape.level.default("card"),
  source: worldContextRefSchema.shape.source.default("initial"),
});

export const agentSuggestionRecordSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  worldId: z.string().min(1),
  status: z.enum(["pending", "edited", "saved", "discarded", "superseded"]),
  suggestion: suggestionSchema,
  savedAssetId: z.string().min(1).nullable().optional(),
});

const baseAgentEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  sequence: z.number().int().min(1),
  createdAt: z.string().datetime(),
});

const agentPiToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.enum([
    "get_world_manifest",
    "search_world_assets",
    "get_asset_brief",
    "get_asset_detail",
    "get_asset_source_fragments",
    "list_local_releases",
    "create_world_asset",
    "update_world_asset_index",
    "apply_world_asset_patch",
    "create_consistency_issue",
    "resolve_consistency_issue",
    "propose_setting",
    "propose_story_seed",
    "propose_conflict",
    "propose_release_notes",
  ]),
  arguments: z.record(z.string(), z.unknown()),
});

export const agentEventSchema = z.discriminatedUnion("type", [
  baseAgentEventSchema.extend({
    type: z.literal("run.started"),
    payload: z.object({ runId: z.string().min(1) }),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("context.used"),
    payload: z.object({
      contextRef: contextRefSchema.omit({ runId: true }),
      contextItemId: z.string().min(1).optional(),
    }),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("pi.session.started"),
    payload: z.object({ piSessionId: z.string().min(1) }),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("message.delta"),
    payload: z.object({ text: z.string() }),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("tool.requested"),
    payload: z.object({ toolCall: agentPiToolCallSchema }),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("tool.completed"),
    payload: z.object({ toolCallId: z.string().min(1), result: z.record(z.string(), z.unknown()) }),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("suggestion.created"),
    payload: z.object({
      suggestionId: z.string().min(1),
      suggestion: suggestionSchema,
    }),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("run.completed"),
    payload: z.object({ tokenUsage: tokenUsageSchema.optional() }).default({}),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("run.failed"),
    payload: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  }),
  baseAgentEventSchema.extend({
    type: z.literal("run.cancelled"),
    payload: z.object({ reason: z.string().min(1).optional() }).default({}),
  }),
]);

export type AgentSeed = z.infer<typeof agentSeedSchema>;
export type WorldSuggestion = z.infer<typeof suggestionSchema>;
export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;
export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type ContextRef = z.infer<typeof contextRefSchema>;
export type AgentSuggestionRecord = z.infer<typeof agentSuggestionRecordSchema>;
