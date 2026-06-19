import type {
  OfficialWorldAsset,
  WorldAssetDetail,
  WorldAssetIndex,
  WorldAssetPatch,
  WorldAssetRevision,
} from "../worlddock/api";
import { Icon } from "../worlddock/components";
import { AssetMarkdownView } from "./asset-markdown-view";
import { AssetPatchList } from "./asset-patch-list";
import { getOfficialAssetTypeLabel, type OfficialAssetType } from "./official-asset-card";

type OfficialAssetDetailPageProps = {
  detail?: WorldAssetDetail | null;
  patches?: WorldAssetPatch[];
  loading?: boolean;
  error?: unknown;
  onBack: () => void;
  onStartEdit?: (assetId: string) => void;
  onRefresh?: () => void;
};

export function OfficialAssetDetailPage({
  detail,
  patches = [],
  loading = false,
  error,
  onBack,
  onStartEdit,
  onRefresh,
}: OfficialAssetDetailPageProps) {
  const asset = detail?.asset;

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="page-head">
        <div className="col" style={{ minWidth: 0 }}>
          <div className="crumb">
            / ren / official-assets / <span style={{ color: "var(--fg-1)" }}>{asset?.name ?? "detail"}</span>
          </div>
          <h1>{asset?.name ?? "官方资产"}</h1>
          <div className="sub">
            {loading && !asset ? "正在载入资产详情" : asset ? `${getAssetTypeLabel(asset.type)} · 当前版本 ${asset.version ?? 1}` : "查看官方 Markdown 文档"}
          </div>
        </div>
        <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn" onClick={onBack} type="button">
            <Icon name="chevron" size={12} style={{ transform: "rotate(180deg)" }} />
            <span>返回</span>
          </button>
          <button
            className="btn"
            disabled={!asset || !onStartEdit}
            onClick={() => asset && onStartEdit?.(asset.id)}
            type="button"
          >
            <Icon name="edit" size={12} />
            <span>编辑</span>
          </button>
          <button
            className="btn"
            disabled={!onRefresh || loading}
            onClick={onRefresh}
            type="button"
          >
            <Icon name="refresh" size={12} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          flex: 1,
          gap: 14,
          gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
          minHeight: 0,
          padding: "20px 32px 40px",
        }}
      >
        <main
          className="card"
          style={{
            minHeight: 360,
            padding: "22px 24px",
          }}
        >
          {error ? (
            <DetailError error={error} />
          ) : loading && !detail ? (
            <DetailLoading />
          ) : detail ? (
            <AssetMarkdownView markdown={detail.markdown} skipFirstHeadingText={detail.asset.name} />
          ) : (
            <div className="prose" style={{ color: "var(--fg-3)", fontSize: "var(--t-13)" }}>
              请选择一个官方资产。
            </div>
          )}
        </main>

        <aside className="col gap-3" style={{ minWidth: 0 }}>
          <AssetMetadataCard asset={asset} />
          <AssetRevisionCard revisions={detail?.revisions ?? []} currentVersion={asset?.version} />
          <AssetIndexCard indexes={detail?.indexes ?? []} />
          <AssetPatchList patches={patches} />
        </aside>
      </div>
    </div>
  );
}

function DetailLoading() {
  return (
    <div className="row gap-2" style={{ alignItems: "center", justifyContent: "center", minHeight: 220 }}>
      <span className="dot amber pulse" />
      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
        正在载入资产详情
      </span>
    </div>
  );
}

function DetailError({ error }: { error: unknown }) {
  return (
    <div className="prose" style={{ color: "var(--brick)", fontSize: "var(--t-13)", lineHeight: 1.6 }}>
      {getErrorMessage(error)}
    </div>
  );
}

function AssetMetadataCard({ asset }: { asset?: OfficialWorldAsset }) {
  const tags = Array.isArray(asset?.tags) ? asset.tags : [];

  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
        <Icon name="book" size={13} style={{ color: "var(--fg-2)" }} />
        <span style={{ color: "var(--fg)", fontSize: "var(--t-13)", fontWeight: 650 }}>
          Metadata
        </span>
      </div>

      {asset ? (
        <div className="col gap-2">
          <MetadataRow label="类型" value={getAssetTypeLabel(asset.type)} />
          <MetadataRow label="版本" value={`v${asset.version ?? 1}`} strong />
          <MetadataRow label="状态" value={getStatusLabel(asset.status)} />
          {tags.length > 0 ? (
            <div className="row gap-2" style={{ flexWrap: "wrap", paddingTop: 4 }}>
              {tags.map((tag) => (
                <span className="tag plain" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <div className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
              暂无标签
            </div>
          )}
        </div>
      ) : (
        <div className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
          等待资产详情
        </div>
      )}
    </section>
  );
}

function AssetRevisionCard({
  revisions,
  currentVersion,
}: {
  revisions: WorldAssetRevision[];
  currentVersion?: number;
}) {
  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
        <Icon name="branch" size={13} style={{ color: "var(--fg-2)" }} />
        <span style={{ color: "var(--fg)", fontSize: "var(--t-13)", fontWeight: 650 }}>
          版本
        </span>
        <div className="flex" />
        {currentVersion ? (
          <span className="mono" style={{ color: "var(--fg)", fontSize: 11 }}>
            当前 v{currentVersion}
          </span>
        ) : null}
      </div>

      {revisions.length === 0 ? (
        <div className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
          暂无修订记录
        </div>
      ) : (
        <div className="col gap-2">
          {revisions.map((revision) => (
            <div
              className="row gap-2"
              key={revision.id}
              style={{
                alignItems: "center",
                borderTop: "1px solid var(--hairline)",
                paddingTop: 8,
              }}
            >
              <span className="mono" style={{ color: "var(--fg)", fontSize: 11 }}>
                版本 {revision.version}
              </span>
              <span style={{ color: "var(--fg-3)", fontSize: 11 }}>
                {formatCompactDate(revision.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AssetIndexCard({ indexes }: { indexes: WorldAssetIndex[] }) {
  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
        <Icon name="layers" size={13} style={{ color: "var(--fg-2)" }} />
        <span style={{ color: "var(--fg)", fontSize: "var(--t-13)", fontWeight: 650 }}>
          索引
        </span>
        <div className="flex" />
        <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
          {indexes.length}
        </span>
      </div>

      {indexes.length === 0 ? (
        <div className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
          暂无索引
        </div>
      ) : (
        <div className="col gap-2">
          {indexes.map((index, itemIndex) => (
            <div
              key={getIndexKey(index, itemIndex)}
              style={{
                borderTop: "1px solid var(--hairline)",
                paddingTop: 8,
              }}
            >
              <div style={{ color: "var(--fg)", fontSize: "var(--t-12)", fontWeight: 600 }}>
                {getIndexTitle(index)}
              </div>
              {index.summary ? (
                <div className="prose" style={{ color: "var(--fg-3)", fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>
                  {index.summary}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MetadataRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11, width: 42 }}>
        {label}
      </span>
      <span
        className={strong ? "mono" : undefined}
        style={{
          color: strong ? "var(--fg)" : "var(--fg-1)",
          fontSize: strong ? 11 : "var(--t-12)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function getAssetTypeLabel(type: OfficialWorldAsset["type"]) {
  return getOfficialAssetTypeLabel(type as OfficialAssetType);
}

function getStatusLabel(status?: OfficialWorldAsset["status"]) {
  if (status === "archived") return "已归档";
  return "活跃";
}

function getIndexTitle(index: WorldAssetIndex) {
  const candidate = index.title ?? (index as any).heading;
  return typeof candidate === "string" && candidate.trim() ? candidate : "未命名索引";
}

function getIndexKey(index: WorldAssetIndex, itemIndex: number) {
  return index.id ?? `${getIndexTitle(index)}-${itemIndex}`;
}

function formatCompactDate(value?: string | null) {
  if (!value) return "未记录时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "资产详情暂不可用。";
}
