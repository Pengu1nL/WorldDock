import type { PiToolCall, PiToolName } from "@worlddock/domain/agent/pi";

export type PiSessionPolicy =
  | { kind: "world_exploration"; intent?: "asset_deposition" }
  | { kind: "asset_edit" }
  | { kind: "consistency_repair" };

export const DEFAULT_PI_SESSION_POLICY: PiSessionPolicy = { kind: "world_exploration" };

const READ_TOOLS = new Set<PiToolName>([
  "get_world_manifest",
  "search_world_assets",
  "get_asset_brief",
  "get_asset_detail",
  "get_asset_source_fragments",
  "list_local_releases",
]);

const PENDING_SUGGESTION_TOOLS = new Set<PiToolName>([
  "propose_setting",
  "propose_story_seed",
  "propose_conflict",
  "propose_release_notes",
]);

export class SafetyGate {
  assertToolAllowed(
    toolCall: PiToolCall,
    disclosedAssetIds = new Set<string>(),
    policy: PiSessionPolicy = DEFAULT_PI_SESSION_POLICY,
  ) {
    if (!isToolAllowedForPolicy(toolCall.name, policy)) {
      throw new Error(`Blocked unsafe pi tool: ${toolCall.name}`);
    }

    if (toolCall.name === "get_asset_detail" || toolCall.name === "get_asset_source_fragments") {
      const assetId = String(toolCall.arguments.assetId ?? "");
      if (!disclosedAssetIds.has(assetId)) {
        throw new Error(`Blocked premature asset expansion: ${toolCall.name} requires prior Card or Brief disclosure for ${assetId}`);
      }
    }
  }
}

export function isToolAllowedForPolicy(
  toolName: PiToolName,
  policy: PiSessionPolicy = DEFAULT_PI_SESSION_POLICY,
) {
  if (READ_TOOLS.has(toolName)) return true;
  if (PENDING_SUGGESTION_TOOLS.has(toolName)) return policy.kind === "world_exploration";
  if (toolName === "create_world_asset") return policy.kind === "world_exploration" && policy.intent === "asset_deposition";
  if (toolName === "apply_world_asset_patch") return policy.kind === "asset_edit" || policy.kind === "consistency_repair";
  if (toolName === "resolve_consistency_issue") return policy.kind === "consistency_repair";
  return false;
}
