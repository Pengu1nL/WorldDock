import type { AgentProviderChunk } from "../agent.provider";
import type { PiRuntimeEvent } from "@worlddock/domain/agent/pi";

export function piEventToAgentChunk(event: PiRuntimeEvent): AgentProviderChunk | null {
  if (event.type === "session.started") return { type: "pi-session-started", piSessionId: event.piSessionId };
  if (event.type === "context.used") {
    return {
      type: "context",
      contextRef: {
        kind: event.kind === "setting" ? "archive" : event.kind,
        title: event.title,
        excerpt: event.excerpt,
        targetId: event.targetId,
        level: event.level,
        source: event.source ?? "initial",
      },
    };
  }
  if (event.type === "message.delta") return { type: "delta", text: event.text };
  if (event.type === "suggestion.created") return { type: "suggestion", suggestion: event.suggestion };
  if (event.type === "usage") return { type: "usage", tokenUsage: event.tokenUsage };
  if (event.type === "tool.requested") return { type: "tool-requested", toolCall: event.toolCall };
  if (event.type === "tool.completed") return { type: "tool-completed", toolCallId: event.toolCallId, result: event.result };
  if (event.type === "asset.patch.applied") {
    return {
      type: "asset-patch-applied",
      sessionId: event.sessionId,
      assetId: event.assetId,
      patchId: event.patchId,
    };
  }
  if (event.type === "consistency.issue.created") {
    return {
      type: "consistency-issue-created",
      issueId: event.issueId,
      worldId: event.worldId,
    };
  }
  if (event.type === "session.failed") return { type: "failed", code: event.code, message: event.message };
  return null;
}
