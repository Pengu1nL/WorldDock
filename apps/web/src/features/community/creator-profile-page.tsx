import { useEffect, useState } from "react";
import type { CommunityCreator, CommunityRepository } from "../worlddock/api";
import { getCommunityCreator, listCommunityCreatorRepositories, reportCreatorProfile } from "../worlddock/api";
import { Icon } from "../worlddock/components";
import { ReportDialog } from "./report-dialog";

type CreatorProfilePageProps = {
  handle: string;
  sessionToken: string;
  onBack: () => void;
  onOpenRepository: (repository: CommunityRepository) => void;
};

export function CreatorProfilePage({ handle, sessionToken, onBack, onOpenRepository }: CreatorProfilePageProps) {
  const [creator, setCreator] = useState<CommunityCreator | null>(null);
  const [repositories, setRepositories] = useState<CommunityRepository[]>([]);

  useEffect(() => {
    void getCommunityCreator(handle, { sessionToken })
      .then((result) => setCreator(result.creator))
      .catch(() => setCreator(null));
    void listCommunityCreatorRepositories(handle, { sessionToken, sort: "updated" })
      .then((result) => setRepositories(result.repositories))
      .catch(() => setRepositories([]));
  }, [handle, sessionToken]);

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ 创作者 / {handle}</div>
          <h1>{creator?.displayName ?? handle}</h1>
          <div className="sub">{creator?.bio ?? "公开创作者主页"}</div>
        </div>
        <div className="row gap-2">
          <ReportDialog
            targetLabel={`@${handle}`}
            onSubmit={async (input) => {
              await reportCreatorProfile(handle, input, { sessionToken });
            }}
            trigger={<button className="btn" type="button"><Icon name="flag" size={12} /><span>举报</span></button>}
          />
          <button className="btn ghost" onClick={onBack}>返回 Explore</button>
        </div>
      </div>

      <div style={{ padding: "20px 32px 40px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 280px)", gap: 18 }} className="community-detail-grid">
        <main className="col" style={{ gap: 12 }}>
          {repositories.map((repository) => (
            <article key={repository.id} className="card hover" style={{ padding: 14 }}>
              <button
                onClick={() => onOpenRepository(repository)}
                style={{ border: 0, background: "transparent", color: "inherit", padding: 0, textAlign: "left", cursor: "pointer", width: "100%" }}
              >
                <div className="row gap-2">
                  <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>{repository.name}</span>
                  <span className="badge slate">{repository.version}</span>
                </div>
                <p className="prose" style={{ marginBottom: 0 }}>{repository.summary}</p>
              </button>
            </article>
          ))}
          {repositories.length === 0 ? <p className="prose">暂无公开仓库。</p> : null}
        </main>
        <aside className="card" style={{ padding: 14, alignSelf: "start" }}>
          <div className="label">统计</div>
          <div className="mono" style={{ fontSize: 12, lineHeight: 1.8, color: "var(--fg-2)" }}>
            {creator?.stats.repositories ?? 0} repositories<br />
            {creator?.stats.stars ?? 0} stars<br />
            {creator?.stats.forks ?? 0} forks
          </div>
          <div className="label" style={{ marginTop: 14 }}>标签</div>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {(creator?.tags ?? []).map((tag) => <span key={tag} className="tag">{tag}</span>)}
          </div>
          <div className="label" style={{ marginTop: 14 }}>主页</div>
          <div className="row gap-2 mono" style={{ fontSize: 12, color: "var(--fg-2)" }}>
            <Icon name="community" size={12} /> @{handle}
          </div>
        </aside>
      </div>
    </div>
  );
}
