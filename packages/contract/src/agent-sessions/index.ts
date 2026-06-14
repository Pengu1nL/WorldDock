import { z } from "zod";

export const agentSessionKindSchema = z.enum([
  "world_exploration",
  "asset_edit",
  "consistency_repair",
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
]);

export const agentSessionContextItemKindSchema = z.enum([
  "asset_index",
  "asset_document",
  "asset_section",
  "source_fragment",
  "potential_asset",
  "consistency_issue",
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
  kind: agentSessionSubjectKindSchema,
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const agentSessionContextItemSchema = z.object({
  kind: agentSessionContextItemKindSchema,
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const agentSessionSchema = z.object({
  id: z.string().min(1),
  worldId: z.string().min(1),
  kind: agentSessionKindSchema,
  title: z.string().min(1),
  status: agentSessionStatusSchema,
  current: z.boolean().default(false),
  subject: agentSessionSubjectSchema.optional(),
  context: z.array(agentSessionContextItemSchema).default([]),
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
  title: z.string().min(1).optional(),
  subject: agentSessionSubjectSchema.optional(),
  context: z.array(agentSessionContextItemSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const createAgentSessionRunInputSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).optional(),
  context: z.array(agentSessionContextItemSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AgentSessionKind = z.infer<typeof agentSessionKindSchema>;
export type AgentSessionStatus = z.infer<typeof agentSessionStatusSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
export type AgentSessionSubject = z.infer<typeof agentSessionSubjectSchema>;
export type AgentSessionContextItem = z.infer<typeof agentSessionContextItemSchema>;
export type AgentSessionMessage = z.infer<typeof agentSessionMessageSchema>;
export type CreateAgentSessionInput = z.infer<typeof createAgentSessionInputSchema>;
export type CreateAgentSessionRunInput = z.infer<
  typeof createAgentSessionRunInputSchema
>;
