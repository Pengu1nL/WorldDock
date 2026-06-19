import type { PiToolName } from "@worlddock/domain/agent/pi";
import { DEFAULT_PI_SESSION_POLICY, isToolAllowedForPolicy, type PiSessionPolicy } from "./safety-gate";

export type WorldToolHandler = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
export type WorldToolDefinition = {
  name: PiToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

export class WorldToolRegistry {
  private readonly handlers = new Map<PiToolName, WorldToolHandler>();

  register(name: PiToolName, handler: WorldToolHandler) {
    this.handlers.set(name, handler);
  }

  async execute(name: PiToolName, input: Record<string, unknown>) {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`World tool is not registered: ${name}`);
    return handler(input);
  }
}

const WORLD_TOOL_DEFINITIONS: WorldToolDefinition[] = [
  { name: "get_world_manifest", description: "Read the World Manifest entry point without full asset bodies.", inputSchema: { type: "object", required: ["worldId"] } },
  { name: "search_world_assets", description: "Search world assets and return Cards only.", inputSchema: { type: "object", required: ["worldId", "query"] } },
  { name: "get_asset_brief", description: "Read one compact asset Brief after a Card is relevant.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
  { name: "get_asset_detail", description: "Read one full canonical asset Detail after Card or Brief disclosure.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
  { name: "get_asset_source_fragments", description: "Read bounded source fragments for citation or conflict checks.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
  { name: "list_local_releases", description: "List local release metadata for a world.", inputSchema: { type: "object", required: ["worldId"] } },
  {
    name: "create_world_asset",
    description: "Create a draft formal world asset only during an asset deposition session. This is not a pending suggestion tool.",
    inputSchema: { type: "object", required: ["worldId", "type", "name"] },
  },
  {
    name: "apply_world_asset_patch",
    description: "Apply a bounded patch to an existing formal world asset during an asset edit session.",
    inputSchema: { type: "object", required: ["worldId", "assetId", "sessionId", "afterMarkdown"] },
  },
  {
    name: "create_consistency_issue",
    description: "Create a tracked consistency issue when exploration identifies contradictory official asset facts.",
    inputSchema: {
      type: "object",
      required: ["worldId", "title", "description", "subjectAssetIds"],
      properties: {
        worldId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        subjectAssetIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "resolve_consistency_issue",
    description: "Resolve a tracked consistency issue after repair work has been applied.",
    inputSchema: { type: "object", required: ["worldId", "issueId", "sessionId", "patches"] },
  },
  {
    name: "propose_setting",
    description: "Return a typed pending setting suggestion only after judging the asset category. category must be one of 世界规则/势力/角色/地点/历史事件/现象/待定设定; categoryReason must explain why the setting's main subject belongs there. Judge by the asset's main subject, not by incidental mentions in the body: 地火运输/成本/窗口/约束 are 世界规则; 红岩联合/companies/consortia/organizations/institutions/governments/factions are 势力.",
    inputSchema: { type: "object", required: ["title", "category", "categoryReason", "body"] },
  },
  { name: "propose_story_seed", description: "Return a typed pending story seed suggestion.", inputSchema: { type: "object", required: ["title", "hook", "conflict"] } },
  { name: "propose_conflict", description: "Return a typed pending conflict suggestion.", inputSchema: { type: "object", required: ["title", "body"] } },
  { name: "propose_release_notes", description: "Return proposed local release notes without publishing.", inputSchema: { type: "object", required: ["worldId"] } },
];

export function describeWorldTools(policy: PiSessionPolicy = DEFAULT_PI_SESSION_POLICY) {
  return WORLD_TOOL_DEFINITIONS.filter((tool) => isToolAllowedForPolicy(tool.name, policy));
}
