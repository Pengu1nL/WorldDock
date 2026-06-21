import { StatusBar } from "../components";

export function WorldStatusBar({
  world,
}: {
  world: any;
}) {
  return <StatusBar world={world} />;
}
