import type {
  WorldAssetIndex,
} from "@worlddock/contract";
import type {
  OfficialWorldAsset,
  WorldAssetDetail,
  WorldAssetPatch,
} from "../worlddock/api";
import { Icon } from "../worlddock/components";
import { AssetMarkdownView } from "./asset-markdown-view";
import { AssetPatchList } from "./asset-patch-list";
import { getOfficialAssetTypeLabel, type OfficialAssetType } from "./official-asset-card";

type OfficialAssetDetailPageProps = {
  detail?: WorldAssetDetail | null;
  patches?: WorldAssetPatch[];
  patchesLoading?: boolean;
  patchesError?: unknown;
  loading?: boolean;
  error?: unknown;
  onBack: () => void;
  onStartEdit?: (assetId: string) => void;
  creatingEditSession?: boolean;
  onRevertPatch?: (patchId: string) => void;
  revertingPatchId?: string | null;
  onRefresh?: () => void;
};

export function OfficialAssetDetailPage({
  detail,
  patches = [],
  patchesLoading = false,
  patchesError,
  loading = false,
  error,
  onBack,
  onStartEdit,
  creatingEditSession = false,
  onRevertPatch,
  revertingPatchId = null,
  onRefresh,
}: OfficialAssetDetailPageProps) {
  const asset = detail?.asset;

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="page-head">
        <div className="col" style={{ minWidth: 0 }}>
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
            disabled={!asset || !onStartEdit || creatingEditSession}
            onClick={() => asset && onStartEdit?.(asset.id)}
            type="button"
          >
            <Icon name="edit" size={12} />
            <span>{creatingEditSession ? "创建中" : "编辑"}</span>
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
        <article
          aria-label="资产文档"
          style={{
            minHeight: 360,
            minWidth: 0,
            overflow: "visible",
            padding: "0 8px 56px 0",
          }}
        >
          {error && !detail ? (
            <DetailError error={error} />
          ) : loading && !detail ? (
            <DetailLoading />
          ) : detail ? (
            <>
              {error ? <DetailRefreshWarning error={error} /> : null}
              <AssetMarkdownView markdown={detail.markdown} skipFirstHeadingText={detail.asset.name} />
            </>
          ) : (
            <div className="prose" style={{ color: "var(--fg-3)", fontSize: "var(--t-13)" }}>
              请选择一个官方资产。
            </div>
          )}
        </article>

        <aside className="col gap-3" style={{ minWidth: 0 }}>
          <AssetMetadataCard asset={asset} />
          <AssetIndexCard indexes={detail?.indexes ?? []} />
          <AssetPatchList
            error={patchesError}
            loading={patchesLoading}
            onRevert={onRevertPatch}
            patches={patches}
            revertingPatchId={revertingPatchId}
          />
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

function DetailRefreshWarning({ error }: { error: unknown }) {
  return (
    <div
      className="prose"
      style={{
        background: "var(--amber-bg)",
        border: "1px solid var(--amber-dim)",
        borderRadius: 6,
        color: "var(--amber)",
        fontSize: "var(--t-12)",
        lineHeight: 1.55,
        marginBottom: 16,
        padding: "9px 10px",
      }}
    >
      刷新失败，仍显示上次内容。{getErrorMessage(error)}
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
          元数据
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

function AssetIndexCard({ indexes }: { indexes: WorldAssetIndex[] }) {
  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
        <Icon name="layers" size={13} style={{ color: "var(--fg-2)" }} />
        <span style={{ color: "var(--fg)", fontSize: "var(--t-13)", fontWeight: 650 }}>
          索引
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "资产详情暂不可用。";
}
