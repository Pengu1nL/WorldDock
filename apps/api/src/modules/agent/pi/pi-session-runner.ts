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
      const item = card as { kind: "setting" | "seed" | "conflict" | "repository"; title: string; excerpt: string; targetId: string };
      return { type: "context.used", level: "card", kind: item.kind, title: item.title, excerpt: item.excerpt, targetId: item.targetId, source: "tool" };
    });
  }
  if (toolName === "get_asset_brief" && result.brief && typeof result.brief === "object") {
    const brief = result.brief as { kind: "setting" | "seed" | "conflict" | "repository"; title: string; summary: string; targetId: string };
    return [{ type: "context.used", level: "brief", kind: brief.kind, title: brief.title, excerpt: brief.summary, targetId: brief.targetId, source: "tool" }];
  }
  if (toolName === "get_asset_detail" && result.detail && typeof result.detail === "object") {
    const detail = result.detail as { kind: "setting" | "seed" | "conflict" | "repository"; title: string; body: string; targetId: string };
    return [{ type: "context.used", level: "detail", kind: detail.kind, title: detail.title, excerpt: detail.body.slice(0, 500), targetId: detail.targetId, source: "tool" }];
  }
  if (toolName === "get_asset_source_fragments" && Array.isArray(result.fragments)) {
    return result.fragments.map((fragment): PiRuntimeEvent => {
      const item = fragment as { kind: "setting" | "seed" | "conflict" | "repository"; text: string; targetId: string };
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

    for await (const event of this.runtime.runSession(input)) {
      if (event.type === "tool.requested") {
        this.safetyGate.assertToolAllowed(event.toolCall, disclosedAssetIds);
        const result = await this.tools.execute(event.toolCall.name, event.toolCall.arguments);
        yield event;
        yield { type: "tool.completed", toolCallId: event.toolCall.id, result };
        for (const contextEvent of contextEventsFromToolResult(event.toolCall.name, result)) {
          if (contextEvent.type === "context.used" && contextEvent.targetId) disclosedAssetIds.add(contextEvent.targetId);
          yield contextEvent;
        }
        continue;
      }

      yield event;
    }
  }
}
