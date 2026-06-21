import { Rail } from "../components";

export type WorldDockView =
  | "worlds"
  | "create"
  | "exploration"
  | "asset-library"
  | "consistency"
  | "settings";

export type LegacyWorldDockView =
  | WorldDockView
  | "workbench"
  | "publish";

export type WorldNavigationItem = {
  id: WorldDockView;
  label: string;
  icon: string;
  badge?: number | string;
};

const LEGACY_VIEW_MAP: Record<Exclude<LegacyWorldDockView, WorldDockView>, WorldDockView> = {
  workbench: "exploration",
  publish: "exploration",
};

const WORLD_VIEWS = new Set<WorldDockView>([
  "worlds",
  "create",
  "exploration",
  "asset-library",
  "consistency",
  "settings",
]);

export function normalizeWorldDockView(view: LegacyWorldDockView | string): WorldDockView {
  if (view in LEGACY_VIEW_MAP) return LEGACY_VIEW_MAP[view as keyof typeof LEGACY_VIEW_MAP];
  if (WORLD_VIEWS.has(view as WorldDockView)) return view as WorldDockView;
  return "worlds";
}

export function getWorldNavigationItems({
  hasWorld,
  pendingCount,
  consistencyIssueBadge,
}: {
  hasWorld: boolean;
  pendingCount?: number;
  consistencyIssueBadge?: number | string;
}): WorldNavigationItem[] {
  if (!hasWorld) return [];
  return [
    { id: "exploration", label: "推演", icon: "session", badge: pendingCount },
    { id: "asset-library", label: "资产库", icon: "assets" },
    { id: "consistency", label: "矛盾", icon: "consistency", badge: consistencyIssueBadge },
  ];
}

export function WorldNavigationRail({
  view,
  onNav,
  world,
  pendingCount,
  consistencyIssueBadge,
}: {
  view: LegacyWorldDockView | string;
  onNav: (view: WorldDockView) => void;
  world: any;
  pendingCount?: number;
  consistencyIssueBadge?: number | string;
}) {
  const normalizedView = normalizeWorldDockView(view);
  return (
    <Rail
      view={normalizedView}
      onNav={(nextView: LegacyWorldDockView | string) => onNav(normalizeWorldDockView(nextView))}
      world={world}
      pendingCount={pendingCount}
      worldItems={getWorldNavigationItems({ hasWorld: Boolean(world), pendingCount, consistencyIssueBadge })}
    />
  );
}
