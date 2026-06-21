import { z } from "zod";

export const agentSessionKindSchema = z.enum([
  "world_exploration",
  "asset_edit",
  "consistency_repair",
  "story_progression",
]);

export const agentSessionStatusSchema = z.enum([
  "active",
  "archived",
  "completed",
  "cancelled",
]);

export const agentSessionSubjectKindSchema = z.enum([
  "world",
  "asset",
  "consistency_issue",
  "potential_asset",
  "narrative",
  "chapter",
]);

export const agentSessionSubjectRoleSchema = z.enum([
  "primary",
  "context",
  "repair_target",
]);

export const agentSessionContextItemKindSchema = z.enum([
  "asset_index",
  "asset_document",
  "asset_section",
  "source_fragment",
  "potential_asset",
  "consistency_issue",
  "chapter",
  "narrative_asset",
]);

export const agentSessionMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
  "tool",
]);

export const agentSessionMessageStatusSchema = z.enum([
  "streaming",
  "complete",
  "failed",
]);

export const agentSessionSubjectSchema = z.object({
  id: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  kind: agentSessionSubjectKindSchema,
  targetId: z.string().min(1),
  role: agentSessionSubjectRoleSchema.default("primary"),
  title: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const agentSessionContextItemSchema = z.object({
  id: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  kind: agentSessionContextItemKindSchema,
  targetId: z.string().min(1),
  title: z.string().min(1).nullable().optional(),
  summary: z.string().min(1).nullable().optional(),
  source: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const agentSessionSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  narrativeId: z.string().min(1).nullable().optional(),
  chapterId: z.string().min(1).nullable().optional(),
  kind: agentSessionKindSchema,
  title: z.string().min(1),
  status: agentSessionStatusSchema,
  current: z.boolean().default(false),
  subjects: z.array(agentSessionSubjectSchema).default([]),
  contextItems: z.array(agentSessionContextItemSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const agentSessionMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: agentSessionMessageRoleSchema,
  content: z.string(),
  status: agentSessionMessageStatusSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export const createAgentSessionInputSchema = z.object({
  worldId: z.string().min(1),
  kind: agentSessionKindSchema,
  narrativeId: z.string().min(1).optional(),
  chapterId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  subjects: z.array(agentSessionSubjectSchema).default([]),
  contextItems: z.array(agentSessionContextItemSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const createAgentSessionRunInputSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).optional(),
  contextItems: z.array(agentSessionContextItemSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AgentSessionKind = z.infer<typeof agentSessionKindSchema>;
export type AgentSessionStatus = z.infer<typeof agentSessionStatusSchema>;
export type AgentSessionSubjectRole = z.infer<
  typeof agentSessionSubjectRoleSchema
>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
export type AgentSessionSubject = z.infer<typeof agentSessionSubjectSchema>;
export type AgentSessionContextItem = z.infer<typeof agentSessionContextItemSchema>;
export type AgentSessionMessage = z.infer<typeof agentSessionMessageSchema>;
export type CreateAgentSessionInput = z.infer<typeof createAgentSessionInputSchema>;
export type CreateAgentSessionRunInput = z.infer<
  typeof createAgentSessionRunInputSchema
>;
