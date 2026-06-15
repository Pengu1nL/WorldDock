import type { PiRuntimeEvent, PiToolName } from "@worlddock/domain/agent/pi";
import type { PiRuntimeClient, PiSessionInput } from "./pi-runtime.client";
import type { SafetyGate } from "./safety-gate";
import type { WorldToolRegistry } from "./world-tool-registry";

function contextEventsFromToolResult(toolName: PiToolName, result: Record<string, unknown>): PiRuntimeEvent[] {
  if (toolName === "get_world_manifest" && result.manifest && typeof result.manifest === "object") {
    const manifest = result.manifest as { worldId: string; name: string; summary: string };
    return [{ type: "context.used", level: "manifest", kind: "world", title: manifest.name, excerpt: manifest.summary, targetId: manifest.worldId, source: "tool" }];
  }
  if (toolName === "search_world_assets" && Array.isArray(result.cards)) {
    return result.cards.map((card): PiRuntimeEvent => {
      const item = card as { kind: "setting" | "seed" | "conflict"; title: string; excerpt: string; targetId: string };
      return { type: "context.used", level: "card", kind: item.kind, title: item.title, excerpt: item.excerpt, targetId: item.targetId, source: "tool" };
    });
  }
  if (toolName === "get_asset_brief" && result.brief && typeof result.brief === "object") {
    const brief = result.brief as { kind: "setting" | "seed" | "conflict"; title: string; summary: string; targetId: string };
    return [{ type: "context.used", level: "brief", kind: brief.kind, title: brief.title, excerpt: brief.summary, targetId: brief.targetId, source: "tool" }];
  }
  if (toolName === "get_asset_detail" && result.detail && typeof result.detail === "object") {
    const detail = result.detail as { kind: "setting" | "seed" | "conflict"; title: string; body: string; targetId: string };
    return [{ type: "context.used", level: "detail", kind: detail.kind, title: detail.title, excerpt: detail.body.slice(0, 500), targetId: detail.targetId, source: "tool" }];
  }
  if (toolName === "get_asset_source_fragments" && Array.isArray(result.fragments)) {
    return result.fragments.map((fragment): PiRuntimeEvent => {
      const item = fragment as { kind: "setting" | "seed" | "conflict"; text: string; targetId: string };
      return { type: "context.used", level: "source_fragment", kind: item.kind, title: `${item.kind}:${item.targetId}`, excerpt: item.text, targetId: item.targetId, source: "tool" };
    });
  }
  return [];
}

export class PiSessionRunner {
  constructor(
    private readonly runtime: PiRuntimeClient,
    private readonly tools: WorldToolRegistry,
    private readonly safetyGate: SafetyGate,
  ) {}

  async *run(input: PiSessionInput): AsyncIterable<PiRuntimeEvent> {
    const disclosedAssetIds = new Set(input.context.map((ref) => ref.targetId).filter((id): id is string => Boolean(id)));

    const executeTool = async (toolCall: { id: string; name: PiToolName; arguments: Record<string, unknown> }) => {
      this.safetyGate.assertToolAllowed(toolCall, disclosedAssetIds, input.policy);
      const result = await this.tools.execute(toolCall.name, toolCall.arguments);
      const contextEvents = contextEventsFromToolResult(toolCall.name, result);
      for (const assetId of disclosedAssetIdsFromToolResult(toolCall.name, result)) {
        disclosedAssetIds.add(assetId);
      }
      for (const contextEvent of contextEvents) {
        if (contextEvent.type === "context.used" && contextEvent.targetId) disclosedAssetIds.add(contextEvent.targetId);
      }
      return { result, contextEvents };
    };

    for await (const event of this.runtime.runSession(input, executeTool)) {
      yield event;
    }
  }
}

function disclosedAssetIdsFromToolResult(toolName: PiToolName, result: Record<string, unknown>) {
  if (toolName !== "get_world_manifest" || !isRecord(result.manifest)) return [];
  const index = result.manifest.index;
  if (!Array.isArray(index)) return [];

  return index
    .map((item) => isRecord(item) && typeof item.targetId === "string" ? item.targetId.trim() : "")
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
