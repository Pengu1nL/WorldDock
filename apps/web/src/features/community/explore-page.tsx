import type { CommunityRepository, RepositorySearchOptions } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type ExplorePageProps = {
  repositories: CommunityRepository[];
  query: string;
  sort: RepositorySearchOptions["sort"];
  loading: boolean;
  nextCursor: string | null;
  onBack: () => void;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: RepositorySearchOptions["sort"]) => void;
  onOpenRepository: (repository: CommunityRepository) => void;
  onOpenCreator: (handle: string) => void;
  onOpenCollections: () => void;
  onLoadMore: () => void;
};

const SORT_OPTIONS: Array<{ id: RepositorySearchOptions["sort"]; label: string }> = [
  { id: "updated", label: "最近更新" },
  { id: "stars", label: "Star" },
  { id: "forks", label: "Fork" },
  { id: "relevance", label: "相关" },
];

export function ExplorePage({
  repositories,
  query,
  sort,
  loading,
  nextCursor,
  onBack,
  onQueryChange,
  onSortChange,
  onOpenRepository,
  onOpenCreator,
  onOpenCollections,
  onLoadMore,
}: ExplorePageProps) {
  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ 界仓社区</div>
          <h1>Explore</h1>
          <div className="sub">公开世界仓库 · 浏览、Star、Fork</div>
        </div>
        <div className="row gap-2">
          <button className="btn" onClick={onOpenCollections}><Icon name="book" size={13} /><span>收藏夹</span></button>
          <button className="btn ghost" onClick={onBack}>返回</button>
        </div>
      </div>

      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          aria-label="搜索公开世界"
          placeholder="搜索世界、标签、作者..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          style={{ width: "min(100%, 360px)" }}
        />
        <div className="row gap-2" role="group" aria-label="排序">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={"sb-btn " + (sort === option.id ? "primary" : "")}
              onClick={() => onSortChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {loading ? <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>加载中</span> : null}
      </div>

      <div
        style={{
          padding: "20px 32px 40px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {repositories.map((repository) => (
          <article key={repository.id} className="card hover" style={{ padding: 16 }}>
            <button
              onClick={() => onOpenRepository(repository)}
              style={{ display: "block", width: "100%", textAlign: "left", border: 0, background: "transparent", color: "inherit", padding: 0, cursor: "pointer" }}
            >
              <div className="row gap-2">
                <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>{repository.name}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{repository.version}</span>
              </div>
              <p className="prose" style={{ fontSize: "var(--t-13)", color: "var(--fg-1)", lineHeight: 1.55 }}>{repository.summary}</p>
            </button>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {repository.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
            </div>
            <div className="row gap-3 mono" style={{ marginTop: 12, fontSize: 11, color: "var(--fg-3)" }}>
              <button className="link-btn mono" onClick={() => onOpenCreator(repository.owner)}>@{repository.owner}</button>
              <span className="row gap-2"><Icon name="star" size={11} /> {repository.stars}</span>
              <span className="row gap-2"><Icon name="fork" size={11} /> {repository.forks}</span>
            </div>
          </article>
        ))}
        {!loading && repositories.length === 0 ? (
          <div className="card" style={{ padding: 16 }}>
            <div className="label">没有匹配仓库</div>
            <p className="prose" style={{ marginBottom: 0 }}>调整关键词或标签后再试。</p>
          </div>
        ) : null}
      </div>

      {nextCursor ? (
        <div style={{ padding: "0 32px 36px" }}>
          <button className="btn" onClick={onLoadMore}>加载更多</button>
        </div>
      ) : null}
    </div>
  );
}
