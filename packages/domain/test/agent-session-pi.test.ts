import { describe, expect, it } from "vitest";
import { piRuntimeEventSchema, piToolNameSchema } from "../src/agent/pi";

describe("session-aware Pi contracts", () => {
  it("accepts session message and asset patch events", () => {
    expect(piRuntimeEventSchema.parse({
      type: "session.message.created",
      sessionId: "session_1",
      messageId: "msg_1",
      role: "assistant",
    }).type).toBe("session.message.created");

    expect(piRuntimeEventSchema.parse({
      type: "asset.patch.applied",
      sessionId: "session_2",
      assetId: "asset_1",
      patchId: "patch_1",
    }).type).toBe("asset.patch.applied");
  });

  it("accepts controlled write tool names", () => {
    expect(piToolNameSchema.parse("create_world_asset")).toBe("create_world_asset");
    expect(piToolNameSchema.parse("apply_world_asset_patch")).toBe("apply_world_asset_patch");
    expect(piToolNameSchema.parse("resolve_consistency_issue")).toBe("resolve_consistency_issue");
  });
});
