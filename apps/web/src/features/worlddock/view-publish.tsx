import type { World, WorldMode } from "@worlddock/domain";
import { ReleaseWizard } from "../releases/release-wizard";

type PublishViewProps = {
  mode: WorldMode;
  world: World;
  communityConnected?: boolean;
  onBack: () => void;
  onConfirm: (payload: { releaseNote: string; license: string }) => void;
};

export function PublishView(props: PublishViewProps) {
  return <ReleaseWizard {...props} />;
}
