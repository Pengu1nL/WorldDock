import type { PotentialAsset } from "@worlddock/contract";

import { Drawer } from "../worlddock/components";

export type PotentialAssetDrawerProps = {
  open: boolean;
  potentialAssets: PotentialAsset[];
  pendingAction?: {
    assetId: string;
    action: "dismiss" | "promote";
  } | null;
  disabled?: boolean;
  error?: string | null;
  onClose: () => void;
  onPromote: (potentialAssetId: string) => void;
  onDismiss: (potentialAssetId: string) => void;
};

export function PotentialAssetDrawer({
  open,
  potentialAssets,
  pendingAction,
  disabled = false,
  error,
  onClose,
  onPromote,
  onDismiss,
}: PotentialAssetDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="潜在资产"
      subtitle={potentialAssets.length ? `${potentialAssets.length} 项本轮发现` : "暂无发现"}
      width={420}
    >
      {error ? (
        <div
          role="alert"
          style={{
            border: "1px solid var(--brick-dim)",
            borderRadius: 8,
            color: "var(--brick)",
            fontSize: "var(--t-13)",
            marginBottom: 10,
            padding: "8px 10px",
          }}
        >
          {error}
        </div>
      ) : null}
      {potentialAssets.length === 0 ? (
        <div style={{ color: "var(--fg-3)", fontSize: "var(--t-13)" }}>暂无潜在资产</div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {potentialAssets.map((asset) => {
            const dismissPending = pendingAction?.assetId === asset.id && pendingAction.action === "dismiss";
            const promotePending = pendingAction?.assetId === asset.id && pendingAction.action === "promote";

            return (
              <article
                key={asset.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  background: "var(--surface-2)",
                }}
              >
                <div className="row gap-2" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div className="col" style={{ gap: 6, minWidth: 0 }}>
                    <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                      <span className="badge slate">{typeLabel(asset.type)}</span>
                      {asset.status === "promoted" ? <span className="badge sage">已沉淀</span> : null}
                      {asset.status === "dismissed" ? <span className="badge">已忽略</span> : null}
                    </div>
                    <h2
                      className="title-font"
                      style={{
                        margin: 0,
                        color: "var(--fg)",
                        fontSize: "var(--t-15)",
                        fontWeight: 650,
                      }}
                    >
                      {asset.title}
                    </h2>
                  </div>
                </div>

                <p style={{ margin: "10px 0 0", color: "var(--fg-2)", fontSize: "var(--t-13)", lineHeight: 1.6 }}>
                  {asset.summary}
                </p>

                {asset.status === "active" ? (
                  <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    <button
                      className="btn ghost sm"
                      disabled={disabled || dismissPending}
                      type="button"
                      onClick={() => onDismiss(asset.id)}
                    >
                      忽略
                    </button>
                    <button
                      className="btn primary sm"
                      disabled={disabled || promotePending}
                      type="button"
                      onClick={() => onPromote(asset.id)}
                    >
                      沉淀
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

function typeLabel(type: PotentialAsset["type"]) {
  const labels: Record<PotentialAsset["type"], string> = {
    character: "角色",
    event: "事件",
    location: "地点",
    organization: "组织",
    rule: "规则",
  };
  return labels[type];
}
