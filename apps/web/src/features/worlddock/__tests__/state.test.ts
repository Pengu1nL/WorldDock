import { describe, expect, it } from "vitest";
import { MOCK } from "../mock-data";
import {
  createInitialWorldDockState,
  worldDockReducer,
} from "../state";

describe("worldDockReducer", () => {
  it("saves a setting suggestion and increments archive count", () => {
    const seed = MOCK.SEEDS.memory;
    const world = MOCK.PREMADE_WORLDS[0];
    const state = createInitialWorldDockState([world]);
    const opened = worldDockReducer(state, { type: "world.opened", worldId: world.id });
    const withSuggestion = {
      ...opened,
      currentWorld: world,
      savedIds: [],
      savedSettings: [],
    };

    const next = worldDockReducer(withSuggestion, {
      type: "suggestion.saved",
      item: seed.suggestions[0],
    });

    expect(next.savedIds).toContain("s1");
    expect(next.savedSettings).toHaveLength(1);
    expect(next.currentWorld?.archive).toBe(world.archive + 1);
  });
});
