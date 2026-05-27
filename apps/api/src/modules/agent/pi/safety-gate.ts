import type { PiToolCall, PiToolName } from "@worlddock/domain/agent/pi";

const ALLOWED_TOOLS = new Set<PiToolName>([
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

export class SafetyGate {
  assertToolAllowed(toolCall: PiToolCall, disclosedAssetIds = new Set<string>()) {
    if (!ALLOWED_TOOLS.has(toolCall.name)) {
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
