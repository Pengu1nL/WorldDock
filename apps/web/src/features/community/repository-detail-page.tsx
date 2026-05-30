import { useCallback, useEffect, useMemo, useState } from "react";
import type { CommunityRepository, CommunityRepositoryAsset, ReportRepositoryInput, RepositoryCollection } from "../worlddock/api";
import { getCommunityRepository, listCommunityRepositoryAssets } from "../worlddock/api";
import { Icon } from "../worlddock/components";
import { ForkSyncPanel } from "../releases/fork-sync-panel";
import { ReportDialog } from "./report-dialog";

type RepositoryDetailPageProps = {
  repository: CommunityRepository;
  sessionToken: string;
  starred: boolean;
  collection?: RepositoryCollection;
  onBack: () => void;
  onStar: () => void;
  onFork: () => void;
  onReport: (input: ReportRepositoryInput) => Promise<void> | void;
  onOpenCreator: (handle: string) => void;
  onToggleCollection: (repository: CommunityRepository) => void;
};

type TabId = "overview" | "archive" | "seeds" | "conflicts" | "releases" | "forks";
type AssetKind = "archive" | "seed" | "conflict";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "archive", label: "Archive" },
  { id: "seeds", label: "Seeds" },
  { id: "conflicts", label: "Conflicts" },
  { id: "releases", label: "Releases" },
  { id: "forks", label: "Forks" },
];

export function RepositoryDetailPage({
  repository: initialRepository,
  sessionToken,
  starred,
  collection,
  onBack,
  onStar,
  onFork,
  onReport,
  onOpenCreator,
  onToggleCollection,
}: RepositoryDetailPageProps) {
  const [repository, setRepository] = useState(initialRepository);
  const [tab, setTab] = useState<TabId>("overview");
  const [assets, setAssets] = useState<Record<AssetKind, CommunityRepositoryAsset[]>>({ archive: [], seed: [], conflict: [] });
  const [assetCursor, setAssetCursor] = useState<Record<AssetKind, string | null>>({ archive: null, seed: null, conflict: null });
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [detachedForkIds, setDetachedForkIds] = useState<string[]>([]);

  useEffect(() => {
    setRepository(initialRepository);
    void getCommunityRepository(initialRepository.owner, initialRepository.slug, { sessionToken })
      .then((result) => setRepository(result.repository))
      .catch(() => {});
  }, [initialRepository, sessionToken]);

  const activeKind = useMemo<AssetKind | null>(() => {
    if (tab === "archive") return "archive";
    if (tab === "seeds") return "seed";
    if (tab === "conflicts") return "conflict";
    return null;
  }, [tab]);

  const loadAssets = useCallback(async (kind: AssetKind, cursor: string | null) => {
    setLoadingAssets(true);
    try {
      const result = await listCommunityRepositoryAssets(repository.id, { sessionToken, kind, cursor: cursor ?? undefined });
      setAssets((prev) => ({ ...prev, [kind]: cursor ? [...prev[kind], ...result.assets] : result.assets }));
      setAssetCursor((prev) => ({ ...prev, [kind]: result.nextCursor }));
    } finally {
      setLoadingAssets(false);
    }
  }, [repository.id, sessionToken]);

  const activeAssetsLoaded = activeKind ? assets[activeKind].length > 0 : false;

  useEffect(() => {
    if (!activeKind || activeAssetsLoaded) return;
    void loadAssets(activeKind, null);
  }, [activeAssetsLoaded, activeKind, loadAssets]);

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ {repository.owner} / <span style={{ color: "var(--fg-1)" }}>{repository.slug}</span></div>
          <h1>{repository.name}</h1>
          <div className="sub">{repository.summary}</div>
        </div>
        <div className="row gap-2">
          <button className="btn" onClick={onStar}><Icon name="star" size={12} /><span>{starred ? "已 Star" : "Star"}</span></button>
          <button className="btn" onClick={() => onToggleCollection(repository)}><Icon name="book" size={12} /><span>{collection ? "已收藏" : "收藏"}</span></button>
          <button className="btn primary" onClick={onFork}><Icon name="fork" size={12} /><span>Fork</span></button>
          <button className="btn ghost" onClick={onBack}>返回 Explore</button>
        </div>
      </div>

      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((item) => (
          <button key={item.id} className={"sb-btn " + (tab === item.id ? "primary" : "")} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
        <div className="flex" />
        <button className="sb-btn" onClick={() => onOpenCreator(repository.owner)}><Icon name="community" size={11} /><span>创作者</span></button>
        <ReportDialog
          targetLabel={`${repository.owner}/${repository.slug}`}
          onSubmit={onReport}
          trigger={<button className="sb-btn" type="button"><Icon name="flag" size={11} /><span>举报</span></button>}
        />
      </div>

      <div
        style={{
          padding: "20px 32px 40px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 280px)",
          gap: 18,
        }}
        className="community-detail-grid"
      >
        <main>
          {tab === "overview" ? <OverviewPanel repository={repository} /> : null}
          {activeKind ? (
            <AssetPanel
              kind={activeKind}
              assets={assets[activeKind]}
              nextCursor={assetCursor[activeKind]}
              loading={loadingAssets}
              onLoadMore={() => loadAssets(activeKind, assetCursor[activeKind])}
            />
          ) : null}
          {tab === "releases" ? <ReleaseHistory repository={repository} /> : null}
          {tab === "forks" ? (
            <ForkGraph
              repository={repository}
              sessionToken={sessionToken}
              detachedForkIds={detachedForkIds}
              onDetached={(forkId) => setDetachedForkIds((prev) => [...prev, forkId])}
            />
          ) : null}
        </main>
        <aside className="card" style={{ padding: 14, alignSelf: "start" }}>
          <div className="label">授权</div>
          <div className="badge sage">{repository.license}</div>
          <div className="label" style={{ marginTop: 14 }}>统计</div>
          <div className="mono" style={{ fontSize: 12, color: "var(--fg-2)" }}>
            {repository.stars + (starred ? 1 : 0)} stars · {repository.forks} forks · {repository.version}
          </div>
          <div className="label" style={{ marginTop: 14 }}>公开资产</div>
          <div className="mono" style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.8 }}>
            Archive {repository.assetCounts?.archive ?? 0}<br />
            Seeds {repository.assetCounts?.seeds ?? 0}<br />
            Conflicts {repository.assetCounts?.conflicts ?? 0}
          </div>
        </aside>
      </div>
    </div>
  );
}

function OverviewPanel({ repository }: { repository: CommunityRepository }) {
  return (
    <section className="col" style={{ gap: 14 }}>
      <div>
        <h2 className="title-font" style={{ marginTop: 0, fontSize: "var(--t-18)" }}>README</h2>
        <p className="prose">{repository.readme ?? repository.summary}</p>
      </div>
      <div className="card" style={{ padding: 14 }}>
        <div className="row gap-2">
          <span className="badge slate">{repository.latestRelease?.version ?? repository.version}</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{repository.latestRelease?.createdAt ?? repository.updated}</span>
        </div>
        <p className="prose" style={{ marginBottom: 0 }}>{repository.latestRelease?.note ?? "暂无发布说明"}</p>
      </div>
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        {repository.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
      </div>
    </section>
  );
}

function AssetPanel({
  kind,
  assets,
  nextCursor,
  loading,
  onLoadMore,
}: {
  kind: AssetKind;
  assets: CommunityRepositoryAsset[];
  nextCursor: string | null;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const title = kind === "archive" ? "Archive" : kind === "seed" ? "Seeds" : "Conflicts";
  return (
    <section className="col" style={{ gap: 10 }}>
      <h2 className="title-font" style={{ margin: 0, fontSize: "var(--t-18)" }}>{title}</h2>
      {assets.map((asset) => (
        <article key={asset.assetId} className="card" style={{ padding: 14 }}>
          <div className="row gap-2">
            <span className="badge slate">{asset.category}</span>
            <span className="title-font" style={{ fontSize: "var(--t-15)", fontWeight: 600 }}>{asset.title}</span>
          </div>
          <p className="prose" style={{ marginBottom: 0 }}>{asset.summary}</p>
        </article>
      ))}
      {!loading && assets.length === 0 ? <p className="prose">当前公开快照没有这个分类的内容。</p> : null}
      {nextCursor ? <button className="btn" onClick={onLoadMore}>加载更多</button> : null}
      {loading ? <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>加载中</span> : null}
    </section>
  );
}

function ReleaseHistory({ repository }: { repository: CommunityRepository }) {
  const releases = repository.releaseHistory ?? repository.releases ?? [];
  return (
    <section className="col" style={{ gap: 10 }}>
      <h2 className="title-font" style={{ margin: 0, fontSize: "var(--t-18)" }}>Releases</h2>
      {releases.map((release: any) => (
        <article key={release.id ?? release.version} className="card" style={{ padding: 14 }}>
          <div className="row gap-2">
            <span className="badge slate">{release.version}</span>
            <span className="badge">{release.status}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{release.createdAt ?? release.updated}</span>
          </div>
          <p className="prose" style={{ marginBottom: 0 }}>{release.note}</p>
        </article>
      ))}
    </section>
  );
}

function ForkGraph({
  repository,
  sessionToken,
  detachedForkIds,
  onDetached,
}: {
  repository: CommunityRepository;
  sessionToken: string;
  detachedForkIds: string[];
  onDetached: (forkId: string) => void;
}) {
  const forks = (repository.forkGraph?.forks ?? []).filter((fork) => !detachedForkIds.includes(fork.id));
  return (
    <section className="col" style={{ gap: 10 }}>
      <h2 className="title-font" style={{ margin: 0, fontSize: "var(--t-18)" }}>Forks</h2>
      {forks.map((fork) => (
        <article key={fork.id} className="card" style={{ padding: 14 }}>
          <div className="row gap-2">
            <Icon name="fork" size={13} />
            <span className="mono" style={{ fontSize: 12 }}>{fork.id}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{fork.createdAt}</span>
          </div>
          <p className="prose">源版本 {fork.sourceReleaseId} · 私有世界 {fork.targetWorldId}</p>
          <ForkSyncPanel forkId={fork.id} sessionToken={sessionToken} onDetached={onDetached} />
        </article>
      ))}
      {forks.length === 0 ? <p className="prose">还没有公开 fork 记录。</p> : null}
    </section>
  );
}
