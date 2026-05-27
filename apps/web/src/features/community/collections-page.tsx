import type { CommunityRepository, RepositoryCollection } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type SavedCollection = {
  collection: RepositoryCollection;
  repository: CommunityRepository;
};

type CollectionsPageProps = {
  collections: SavedCollection[];
  onBack: () => void;
  onOpenRepository: (repository: CommunityRepository) => void;
  onRemove: (item: SavedCollection) => void;
};

export function CollectionsPage({ collections, onBack, onOpenRepository, onRemove }: CollectionsPageProps) {
  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ 界仓社区 / 收藏夹</div>
          <h1>Collections</h1>
          <div className="sub">Alpha 收藏的公开世界仓库</div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回 Explore</button>
      </div>

      <div style={{ padding: "20px 32px 40px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {collections.map((item) => (
          <article key={item.collection.id} className="card" style={{ padding: 14 }}>
            <button
              onClick={() => onOpenRepository(item.repository)}
              style={{ border: 0, background: "transparent", color: "inherit", padding: 0, textAlign: "left", cursor: "pointer", width: "100%" }}
            >
              <div className="row gap-2">
                <Icon name="book" size={13} />
                <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>{item.repository.name}</span>
              </div>
              <p className="prose">{item.repository.summary}</p>
            </button>
            <div className="row gap-2">
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>@{item.repository.owner}</span>
              <div className="flex" />
              <button className="sb-btn" onClick={() => onRemove(item)}>移除</button>
            </div>
          </article>
        ))}
        {collections.length === 0 ? (
          <div className="card" style={{ padding: 16 }}>
            <div className="label">暂无收藏</div>
            <p className="prose" style={{ marginBottom: 0 }}>在仓库详情页保存后会出现在这里。</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
