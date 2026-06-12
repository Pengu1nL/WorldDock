import type { World, WorldSuggestion } from "@worlddock/domain";

export type WorldDockState = {
  worlds: World[];
  currentWorld: World | null;
  savedIds: string[];
  savedSettings: WorldSuggestion[];
  savedSeeds: WorldSuggestion[];
  savedConflicts: WorldSuggestion[];
};

export type WorldDockAction =
  | { type: "world.opened"; worldId: string }
  | { type: "suggestion.saved"; item: WorldSuggestion };

export function createInitialWorldDockState(worlds: World[]): WorldDockState {
  return {
    worlds,
    currentWorld: null,
    savedIds: [],
    savedSettings: [],
    savedSeeds: [],
    savedConflicts: [],
  };
}

export function worldDockReducer(
  state: WorldDockState,
  action: WorldDockAction,
): WorldDockState {
  switch (action.type) {
    case "world.opened": {
      const currentWorld = state.worlds.find((world) => world.id === action.worldId) ?? null;
      return { ...state, currentWorld };
    }
    case "suggestion.saved": {
      if (state.savedIds.includes(action.item.id)) return state;

      const currentWorld = state.currentWorld
        ? {
            ...state.currentWorld,
            archive: action.item.kind === "setting"
              ? state.currentWorld.archive + 1
              : state.currentWorld.archive,
            seeds: action.item.kind === "seed"
              ? state.currentWorld.seeds + 1
              : state.currentWorld.seeds,
            conflicts: action.item.kind === "conflict"
              ? state.currentWorld.conflicts + 1
              : state.currentWorld.conflicts,
            maturity: Math.min(
              100,
              state.currentWorld.maturity + (action.item.kind === "setting" ? 6 : 3),
            ),
            hasUnsaved: false,
          }
        : null;

      return {
        ...state,
        currentWorld,
        savedIds: [...state.savedIds, action.item.id],
        savedSettings: action.item.kind === "setting"
          ? [...state.savedSettings, action.item]
          : state.savedSettings,
        savedSeeds: action.item.kind === "seed"
          ? [...state.savedSeeds, action.item]
          : state.savedSeeds,
        savedConflicts: action.item.kind === "conflict"
          ? [...state.savedConflicts, action.item]
          : state.savedConflicts,
        worlds: currentWorld
          ? state.worlds.map((world) => world.id === currentWorld.id ? currentWorld : world)
          : state.worlds,
      };
    }
    default:
      return state;
  }
}
