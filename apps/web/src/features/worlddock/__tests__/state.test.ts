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

  it("forks a public repository into a private draft world", () => {
    const state = createInitialWorldDockState([]);
    const next = worldDockReducer(state, {
      type: "repository.forked",
      repository: {
        id: "repo_tide",
        owner: "ren",
        slug: "tide-book",
        name: "潮汐之书",
        summary: "潮汐每 13 年一次反向。",
        tags: ["海洋"],
        stars: 184,
        forks: 23,
        seeds: 12,
        maturity: 72,
        updated: "3 小时前",
        version: "v1.2.0",
        visibility: "public",
        license: "free-fork-attribution",
        releases: [],
      },
    });

    expect(next.worlds[0].name).toBe("潮汐之书 · Fork");
    expect(next.worlds[0].visibility).toBe("private");
    expect(next.worlds[0].status).toBe("draft");
  });
});
