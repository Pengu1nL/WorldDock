import Image from "next/image";
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

const OFFICIAL_ASSET_CARD_SUMMARY_MAX_CHARS = 72;
const OFFICIAL_ASSET_CARD_SENTENCE_RE = /^(.{1,120}?[。！？!?])/;
const OFFICIAL_ASSET_CARD_COVER_SRC = "/assets/worlddock-asset-cover-placeholder.png";

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
  const rawSummary = String(asset.summary ?? "").trim();
  const summary = getOfficialAssetCardSummary(asset.summary);

  return (
    <button
      aria-label={`打开资产 ${asset.name}`}
      className="card hover"
      onClick={() => onOpenAsset?.(asset.id)}
      style={{
        textAlign: "left",
        padding: 0,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        aspectRatio: "3 / 4",
        minHeight: 0,
        overflow: "hidden",
        width: "100%",
      }}
      type="button"
    >
      <div
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--hairline)",
          flex: "0 0 56%",
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Image
          alt=""
          aria-hidden="true"
          draggable={false}
          fill
          sizes="(max-width: 640px) 75vw, 320px"
          src={OFFICIAL_ASSET_CARD_COVER_SRC}
          style={{
            objectFit: "cover",
          }}
        />
        <div
          className="row gap-2"
          style={{
            alignItems: "flex-start",
            inset: 10,
            position: "absolute",
          }}
        >
          <span
            aria-label={meta.label}
            className="tag plain"
            style={{
              alignItems: "center",
              background: "color-mix(in srgb, var(--surface) 88%, transparent)",
              display: "inline-flex",
              gap: 5,
            }}
            title={meta.label}
          >
            <Icon name={meta.icon} size={11} />
          </span>
          <div className="flex" />
          <span
            className="mono"
            style={{
              background: "color-mix(in srgb, var(--surface) 88%, transparent)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-3)",
              color: "var(--fg-3)",
              fontSize: 10.5,
              padding: "2px 5px",
            }}
          >
            v{asset.version ?? 1}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: 8,
          minHeight: 0,
          padding: 14,
        }}
      >
        <div
          className="title-font"
          style={{
            fontSize: "var(--t-15)",
            fontWeight: 600,
            color: "var(--fg)",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            overflowWrap: "anywhere",
          }}
          title={asset.name}
        >
          {asset.name}
        </div>

        <p
          className="prose"
          title={rawSummary || undefined}
          style={{
            color: "var(--fg-1)",
            display: "-webkit-box",
            flex: 1,
            fontSize: "var(--t-12)",
            fontWeight: 400,
            lineHeight: 1.55,
            margin: 0,
            overflow: "hidden",
            overflowWrap: "anywhere",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            wordBreak: "break-word",
          }}
        >
          {summary}
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
      </div>
    </button>
  );
}

export function getOfficialAssetTypeLabel(type: OfficialAssetType) {
  return OFFICIAL_ASSET_TYPE_META[type].label;
}

export function getOfficialAssetCardSummary(summary: unknown) {
  const cleaned = firstMeaningfulSummaryLine(summary);
  if (!cleaned) return "暂无摘要。";

  const sentence = cleaned.match(OFFICIAL_ASSET_CARD_SENTENCE_RE)?.[1] ?? cleaned;
  return truncateSummary(sentence, OFFICIAL_ASSET_CARD_SUMMARY_MAX_CHARS);
}

function firstMeaningfulSummaryLine(value: unknown) {
  return (
    String(value ?? "")
      .replace(/\r/g, "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find(Boolean) ?? ""
  );
}

function truncateSummary(value: string, maxChars: number) {
  const chars = Array.from(value.trim());
  if (chars.length <= maxChars) return value.trim();

  return `${chars
    .slice(0, maxChars - 1)
    .join("")
    .replace(/[，,、；;：:\s]+$/, "")}…`;
}
