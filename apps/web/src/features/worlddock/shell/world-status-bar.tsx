import { StatusBar } from "../components";

export function WorldStatusBar({
  world,
  mode,
  tokens,
}: {
  world: any;
  mode: string;
  tokens: number;
}) {
  return <StatusBar world={world} mode={mode} tokens={tokens} />;
}
