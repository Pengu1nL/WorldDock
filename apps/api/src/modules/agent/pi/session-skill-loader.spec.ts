import { describe, expect, it } from "vitest";
import { loadSessionPiSkills } from "./session-skill-loader";

describe("loadSessionPiSkills", () => {
  it("loads the world exploration skill for world exploration sessions", () => {
    expect(loadSessionPiSkills({ kind: "world_exploration" }).name).toBe("world-exploration");
  });

  it("loads the asset deposition skill for world exploration deposition intent", () => {
    expect(
      loadSessionPiSkills({
        kind: "world_exploration",
        intent: "asset_deposition",
      }).name,
    ).toBe("asset-deposition");
  });

  it("loads the asset edit skill for asset edit sessions", () => {
    expect(loadSessionPiSkills({ kind: "asset_edit" }).name).toBe("asset-edit");
  });

  it("loads the consistency repair skill for consistency repair sessions", () => {
    expect(loadSessionPiSkills({ kind: "consistency_repair" }).name).toBe("consistency-repair");
  });
});
