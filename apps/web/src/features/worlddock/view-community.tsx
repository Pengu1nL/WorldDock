import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicRepository } from "@worlddock/domain";
import { forkRepository, listPublicRepositories, searchPublicRepositories, starRepository, unstarRepository } from "./api";
import { PUBLIC_REPOSITORIES } from "./fixtures";
import { Icon } from "./components";

type ToastInput = {
  kind: "save" | "warn" | "info";
  text: string;
};

type CommunityViewProps = {
  onBack: () => void;
  onFork: (repository: PublicRepository) => void;
  onToast: (toast: ToastInput) => void;
};

export function CommunityView({ onBack, onFork, onToast }: CommunityViewProps) {
  const [query, setQuery] = useState("");
  const [activeRepository, setActiveRepository] = useState<PublicRepository | null>(null);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [repositories, setRepositories] = useState<PublicRepository[]>(PUBLIC_REPOSITORIES);
  const sessionToken = useCallback(() => typeof window === "undefined"
    ? ""
    : window.localStorage.getItem("worlddock.sessionToken") ?? "", []);

  useEffect(() => {
    void listPublicRepositories({ sessionToken: sessionToken() })
      .then((result: any) => {
        if (Array.isArray(result.repositories) && result.repositories.length > 0) {
          setRepositories(result.repositories);
        }
      })
      .catch(() => {
        setRepositories(PUBLIC_REPOSITORIES);
      });
  }, [sessionToken]);

  useEffect(() => {
    if (!query.trim()) return;
    void searchPublicRepositories(query, { sessionToken: sessionToken() })
      .then((result: any) => {
        if (Array.isArray(result.repositories)) {
          setRepositories(result.repositories.length > 0 ? result.repositories : PUBLIC_REPOSITORIES);
        }
      })
      .catch(() => {});
  }, [query, sessionToken]);

  const filtered = useMemo(() => {
    return repositories.filter((repository) => {
      const text = `${repository.name} ${repository.summary} ${repository.tags.join(" ")}`;
      return !query || text.includes(query);
    });
  }, [query, repositories]);

  if (activeRepository) {
    return (
      <RepositoryView
        repository={activeRepository}
        starred={starredIds.includes(activeRepository.id)}
        onBack={() => setActiveRepository(null)}
        onStar={async () => {
          const alreadyStarred = starredIds.includes(activeRepository.id);
          const session = sessionToken();
          try {
            if (session) {
              const result: any = alreadyStarred
                ? await unstarRepository(activeRepository.id, { sessionToken: session })
                : await starRepository(activeRepository.id, { sessionToken: session });
              setActiveRepository(result.repository);
              setRepositories((prev) => prev.map((item) => item.id === result.repository.id ? result.repository : item));
            }
          } catch {
            onToast({ kind: "info", text: "云端 Star 暂不可用，已更新本地状态" });
          }
          setStarredIds((prev) => alreadyStarred
            ? prev.filter((id) => id !== activeRepository.id)
            : [...prev, activeRepository.id]);
          onToast({ kind: "save", text: (alreadyStarred ? "已取消 Star · " : "已 Star · ") + activeRepository.name });
        }}
        onFork={async () => {
          const session = sessionToken();
          if (session) {
            try {
              await forkRepository(activeRepository.id, { sessionToken: session });
            } catch {
              onToast({ kind: "info", text: "云端 Fork 暂不可用，已生成本地演示副本" });
            }
          }
          onFork(activeRepository);
          onToast({ kind: "save", text: "Fork 成功 · 已生成私有世界" });
        }}
        onReport={() => onToast({ kind: "warn", text: "举报已提交 · 管理员会复核" })}
      />
    );
  }

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ 界仓社区</div>
          <h1>Explore</h1>
          <div className="sub">公开世界仓库 · 浏览、Star、Fork</div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回</button>
      </div>
      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)" }}>
        <input
          className="input"
          aria-label="搜索公开世界"
          placeholder="搜索世界、标签、作者..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: "min(100%, 360px)" }}
        />
      </div>
      <div
        style={{
          padding: "20px 32px 40px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {filtered.map((repository) => (
          <button
            key={repository.id}
            className="card hover"
            onClick={() => setActiveRepository(repository)}
            style={{ textAlign: "left", padding: 16, cursor: "pointer" }}
          >
            <div className="row gap-2">
              <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>{repository.name}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>@{repository.owner}</span>
            </div>
            <p className="prose" style={{ fontSize: "var(--t-13)", color: "var(--fg-1)", lineHeight: 1.55 }}>{repository.summary}</p>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {repository.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
            </div>
            <div className="row gap-3 mono" style={{ marginTop: 12, fontSize: 11, color: "var(--fg-3)" }}>
              <span className="row gap-2"><Icon name="star" size={11} /> {repository.stars}</span>
              <span className="row gap-2"><Icon name="fork" size={11} /> {repository.forks}</span>
              <span>{repository.version}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

type RepositoryViewProps = {
  repository: PublicRepository;
  starred: boolean;
  onBack: () => void;
  onStar: () => void;
  onFork: () => void;
  onReport: () => void;
};

function RepositoryView({
  repository,
  starred,
  onBack,
  onStar,
  onFork,
  onReport,
}: RepositoryViewProps) {
  const [tab, setTab] = useState("overview");
  const tabs = ["overview", "archive", "seeds", "conflicts", "releases", "forks"];

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
          <button className="btn primary" onClick={onFork}><Icon name="fork" size={12} /><span>Fork</span></button>
          <button className="btn ghost" onClick={onBack}>返回 Explore</button>
        </div>
      </div>

      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((item) => (
          <button key={item} className={"sb-btn " + (tab === item ? "primary" : "")} onClick={() => setTab(item)}>
            {item === "overview" ? "Overview" : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
        <div className="flex" />
        <button className="sb-btn" onClick={onReport}><Icon name="flag" size={11} /><span>举报</span></button>
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
        <main className="card" style={{ padding: 18 }}>
          {tab === "overview" && (
            <>
              <h2 className="title-font" style={{ marginTop: 0 }}>README</h2>
              <p className="prose">{repository.readme}</p>
              <h3>推荐阅读路径</h3>
              <p className="prose">先读核心规则，再看冲突池，最后进入高潜力故事种子。</p>
            </>
          )}
          {tab === "releases" && (
            <div className="col" style={{ gap: 10 }}>
              {repository.releases.map((release) => (
                <div key={release.version} className="card" style={{ padding: 12 }}>
                  <div className="row gap-2">
                    <span className="badge slate">{release.version}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{release.updated}</span>
                  </div>
                  <p className="prose" style={{ fontSize: 13 }}>{release.note}</p>
                </div>
              ))}
            </div>
          )}
          {tab !== "overview" && tab !== "releases" && (
            <p className="prose">公开 {tab} 内容使用当前仓库快照展示，后端接入后按分页加载。</p>
          )}
        </main>
        <aside className="card" style={{ padding: 14 }}>
          <div className="label">授权</div>
          <div className="badge sage">{repository.license}</div>
          <div className="label" style={{ marginTop: 14 }}>统计</div>
          <div className="mono" style={{ fontSize: 12, color: "var(--fg-2)" }}>
            {repository.stars + (starred ? 1 : 0)} stars · {repository.forks} forks · {repository.version}
          </div>
        </aside>
      </div>
    </div>
  );
}
