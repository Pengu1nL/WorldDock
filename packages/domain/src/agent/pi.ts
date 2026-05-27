import { z } from "zod";
import { suggestionSchema, tokenUsageSchema } from "./index";
import { worldContextAssetKindSchema, worldDisclosureLevelSchema } from "./context";

export const piToolNameSchema = z.enum([
  "get_world_manifest",
  "search_world_assets",
  "get_asset_brief",
  "get_asset_detail",
  "get_asset_source_fragments",
  "list_repository_releases",
  "propose_setting",
  "propose_story_seed",
  "propose_conflict",
  "propose_release_notes",
]);

export const piToolCallSchema = z.object({
  id: z.string().min(1),
  name: piToolNameSchema,
  arguments: z.record(z.string(), z.unknown()),
});

export const piRuntimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.started"), piSessionId: z.string().min(1) }),
  z.object({
    type: z.literal("context.used"),
    level: worldDisclosureLevelSchema,
    kind: worldContextAssetKindSchema,
    title: z.string().min(1),
    excerpt: z.string().min(1),
    targetId: z.string().min(1).optional(),
    source: z.enum(["initial", "tool"]).optional(),
  }),
  z.object({ type: z.literal("message.delta"), text: z.string() }),
  z.object({ type: z.literal("tool.requested"), toolCall: piToolCallSchema }),
  z.object({ type: z.literal("tool.completed"), toolCallId: z.string().min(1), result: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("suggestion.created"), suggestion: suggestionSchema }),
  z.object({ type: z.literal("usage"), tokenUsage: tokenUsageSchema }),
  z.object({ type: z.literal("session.completed") }),
  z.object({ type: z.literal("session.failed"), code: z.string().min(1), message: z.string().min(1) }),
]);

export type PiToolName = z.infer<typeof piToolNameSchema>;
export type PiToolCall = z.infer<typeof piToolCallSchema>;
export type PiRuntimeEvent = z.infer<typeof piRuntimeEventSchema>;
