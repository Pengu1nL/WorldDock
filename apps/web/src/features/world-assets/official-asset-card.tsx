import type { OfficialWorldAsset, ListOfficialAssetsOptions } from "../worlddock/api";
import { Icon } from "../worlddock/components";

export type OfficialAssetType = NonNullable<ListOfficialAssetsOptions["type"]>;
export type OfficialAssetFilter = OfficialAssetType | "all";

type OfficialAssetTypeMeta = {
  id: OfficialAssetFilter;
  label: string;
  icon: string;
};

export const OFFICIAL_ASSET_FILTERS: OfficialAssetTypeMeta[] = [
  { id: "all", label: "全部", icon: "assets" },
  { id: "character", label: "角色", icon: "star" },
  { id: "organization", label: "组织", icon: "layers" },
  { id: "location", label: "地点", icon: "flag" },
  { id: "event", label: "事件", icon: "bolt" },
  { id: "rule", label: "规则", icon: "book" },
];

const OFFICIAL_ASSET_TYPE_META: Record<OfficialAssetType, OfficialAssetTypeMeta> = {
  character: { id: "character", label: "角色", icon: "star" },
  organization: { id: "organization", label: "组织", icon: "layers" },
  location: { id: "location", label: "地点", icon: "flag" },
  event: { id: "event", label: "事件", icon: "bolt" },
  rule: { id: "rule", label: "规则", icon: "book" },
};

type OfficialAssetCardProps = {
  asset: OfficialWorldAsset;
  issueCount?: number;
  onOpenAsset?: (assetId: string) => void;
};

export function OfficialAssetCard({
  asset,
  issueCount = 0,
  onOpenAsset,
}: OfficialAssetCardProps) {
  const meta = OFFICIAL_ASSET_TYPE_META[asset.type];
  const tags = Array.isArray(asset.tags) ? asset.tags : [];

  return (
    <button
      aria-label={`打开资产 ${asset.name}`}
      className="card hover"
      onClick={() => onOpenAsset?.(asset.id)}
      style={{
        textAlign: "left",
        padding: 14,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 146,
      }}
      type="button"
    >
      <div className="row gap-2" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        <span
          aria-label={meta.label}
          className="tag plain"
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          title={meta.label}
        >
          <Icon name={meta.icon} size={11} />
        </span>
        <div className="flex" />
        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
          v{asset.version ?? 1}
        </span>
      </div>

      <div className="title-font" style={{ fontSize: "var(--t-15)", fontWeight: 600, color: "var(--fg)" }}>
        {asset.name}
      </div>
      <p
        className="prose"
        style={{
          fontSize: "var(--t-12)",
          color: "var(--fg-1)",
          lineHeight: 1.55,
          flex: 1,
          margin: 0,
        }}
      >
        {asset.summary || "暂无摘要。"}
      </p>

      {tags.length > 0 && (
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag plain" style={{ fontSize: 10 }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div
        className="row gap-2 mono"
        style={{
          paddingTop: 6,
          borderTop: "1px solid var(--hairline)",
          fontSize: 11,
          color: "var(--fg-3)",
        }}
      >
        <span>{issueCount} 项问题</span>
        <div className="flex" />
        <Icon name="chevron" size={11} />
      </div>
    </button>
  );
}

export function getOfficialAssetTypeLabel(type: OfficialAssetType) {
  return OFFICIAL_ASSET_TYPE_META[type].label;
}
