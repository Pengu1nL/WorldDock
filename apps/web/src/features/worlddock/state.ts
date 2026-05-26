import type { PublicRepository, World, WorldSuggestion } from "@worlddock/domain";

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
  | { type: "suggestion.saved"; item: WorldSuggestion }
  | { type: "repository.forked"; repository: PublicRepository }
  | { type: "world.published"; worldId: string }
  | { type: "world.push.completed"; worldId: string };

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
    case "repository.forked": {
      const forkedWorld: World = {
        id: `fork_${action.repository.id}`,
        name: `${action.repository.name} · Fork`,
        type: "Forked World",
        tags: action.repository.tags,
        summary: action.repository.summary,
        maturity: action.repository.maturity ?? 20,
        status: "draft",
        visibility: "private",
        archive: 0,
        seeds: action.repository.seeds ?? 0,
        conflicts: 0,
        updated: "刚刚",
        mode: "cloud",
        hasUnsaved: false,
        hasUnpushed: false,
        isNew: true,
      };
      return {
        ...state,
        worlds: [forkedWorld, ...state.worlds],
        currentWorld: forkedWorld,
      };
    }
    case "world.published":
      return {
        ...state,
        worlds: state.worlds.map((world) =>
          world.id === action.worldId
            ? { ...world, status: "published", visibility: "public", hasUnsaved: false }
            : world,
        ),
        currentWorld: state.currentWorld?.id === action.worldId
          ? { ...state.currentWorld, status: "published", visibility: "public", hasUnsaved: false }
          : state.currentWorld,
      };
    case "world.push.completed":
      return {
        ...state,
        worlds: state.worlds.map((world) =>
          world.id === action.worldId
            ? { ...world, hasUnpushed: false, status: "published", visibility: "public" }
            : world,
        ),
        currentWorld: state.currentWorld?.id === action.worldId
          ? { ...state.currentWorld, hasUnpushed: false, status: "published", visibility: "public" }
          : state.currentWorld,
      };
    default:
      return state;
  }
}
