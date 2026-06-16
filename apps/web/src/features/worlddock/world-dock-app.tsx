"use client";

import { WorldDockShell } from "./shell/world-dock-shell";

export { buildCreateWorldInput } from "./shell/world-dock-runtime";

export function WorldDockApp() {
  return <WorldDockShell />;
}
