import { z } from "zod";
import { suggestionSchema, tokenUsageSchema } from "./index";
import { worldContextAssetKindSchema, worldDisclosureLevelSchema } from "./context";

export const piToolNameSchema = z.enum([
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
  "list_characters",
  "get_asset",
  "get_previous_chapter_snapshot",
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
    type: z.literal("session.message.created"),
    sessionId: z.string().min(1),
    messageId: z.string().min(1),
    role: z.enum(["user", "assistant", "system", "tool"]),
  }),
  z.object({
    type: z.literal("context.used"),
    level: worldDisclosureLevelSchema,
    kind: worldContextAssetKindSchema,
    title: z.string().min(1),
    excerpt: z.string().min(1),
    targetId: z.string().min(1).optional(),
    source: z.enum(["initial", "tool"]).optional(),
  }),
  z.object({
    type: z.literal("potential_asset.detected"),
    potentialAssetId: z.string().min(1),
    sessionId: z.string().min(1),
  }),
  z.object({ type: z.literal("message.delta"), text: z.string() }),
  z.object({ type: z.literal("tool.requested"), toolCall: piToolCallSchema }),
  z.object({ type: z.literal("tool.completed"), toolCallId: z.string().min(1), result: z.record(z.string(), z.unknown()) }),
  z.object({
    type: z.literal("asset.patch.applied"),
    sessionId: z.string().min(1),
    assetId: z.string().min(1),
    patchId: z.string().min(1),
  }),
  z.object({
    type: z.literal("consistency.issue.created"),
    issueId: z.string().min(1),
    worldId: z.string().min(1),
  }),
  z.object({ type: z.literal("suggestion.created"), suggestion: suggestionSchema }),
  z.object({ type: z.literal("usage"), tokenUsage: tokenUsageSchema }),
  z.object({ type: z.literal("session.completed") }),
  z.object({ type: z.literal("session.failed"), code: z.string().min(1), message: z.string().min(1) }),
]);

export type PiToolName = z.infer<typeof piToolNameSchema>;
export type PiToolCall = z.infer<typeof piToolCallSchema>;
export type PiRuntimeEvent = z.infer<typeof piRuntimeEventSchema>;
