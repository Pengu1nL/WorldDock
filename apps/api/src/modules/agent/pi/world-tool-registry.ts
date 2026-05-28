import type { PiToolName } from "@worlddock/domain/agent/pi";

export type WorldToolHandler = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

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

export function describeWorldTools() {
  return [
    { name: "get_world_manifest", description: "Read the World Manifest entry point without full asset bodies.", inputSchema: { type: "object", required: ["worldId"] } },
    { name: "search_world_assets", description: "Search world assets and return Cards only.", inputSchema: { type: "object", required: ["worldId", "query"] } },
    { name: "get_asset_brief", description: "Read one compact asset Brief after a Card is relevant.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
    { name: "get_asset_detail", description: "Read one full canonical asset Detail after Card or Brief disclosure.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
    { name: "get_asset_source_fragments", description: "Read bounded source fragments for citation or conflict checks.", inputSchema: { type: "object", required: ["worldId", "assetId"] } },
    { name: "list_repository_releases", description: "List public release metadata for a repository.", inputSchema: { type: "object", required: ["repositoryId"] } },
    { name: "propose_setting", description: "Return a typed pending setting suggestion.", inputSchema: { type: "object", required: ["title", "body"] } },
    { name: "propose_story_seed", description: "Return a typed pending story seed suggestion.", inputSchema: { type: "object", required: ["title", "hook", "conflict"] } },
    { name: "propose_conflict", description: "Return a typed pending conflict suggestion.", inputSchema: { type: "object", required: ["title", "body"] } },
    { name: "propose_release_notes", description: "Return proposed release notes without publishing.", inputSchema: { type: "object", required: ["repositoryId"] } },
  ] as const;
}
