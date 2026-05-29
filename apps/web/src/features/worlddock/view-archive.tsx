// view-archive.tsx — World archive + Story seeds pool + Conflicts pool

import { useMemo as useMemoA, useState as useStateA } from "react";
import { Icon } from "./components";

const ARCHIVE_CATEGORIES = [
  { id: "all",       label: "全部" },
  { id: "世界规则",   label: "世界规则" },
  { id: "势力",       label: "势力" },
  { id: "角色",       label: "角色" },
  { id: "地点",       label: "地点" },
  { id: "历史事件",   label: "历史事件" },
  { id: "现象",       label: "现象" },
  { id: "待定设定",   label: "待定设定" },
];

// Category strings in mock data may have a sub-label appended after " · "
// (e.g. "势力 · 机构", "现象 · 副作用", "戏剧张力 · 核心矛盾"). Filter on the prefix
// so chips like "势力" still match those items, while the card still shows
// the full string in its tag.
const baseCat = (s: any) => {
  const cat = (s && s.category) || "";
  // Conflicts are routed to the dedicated 冲突池 — never appear in Archive
  if (s && s.kind === "conflict") return "冲突";
  return cat.split("·")[0].trim();
};

const moveAsset = (assets: any[], asset: any, direction: number, onReorderAssets?: (assetIds: string[]) => void) => {
  if (!asset?.id || !onReorderAssets) return;
  const index = assets.findIndex((item: any) => item.id === asset.id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= assets.length) return;
  const next = [...assets];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  onReorderAssets(next.map((item: any) => item.id).filter(Boolean));
};

const openCardFromKeyboard = (event: any, item: any, onOpenDetail: (item: any) => void) => {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onOpenDetail(item);
};

const AssetCardActions = ({
  asset,
  assets,
  onEditAsset,
  onDeleteAsset,
  onReorderAssets,
  onRelateAssets,
}: any) => {
  const index = assets.findIndex((item: any) => item.id === asset.id);
  const canMoveUp = index > 0;
  const canMoveDown = index >= 0 && index < assets.length - 1;

  return (
    <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
      {onReorderAssets && (
        <>
          <button
            aria-label={`上移 ${asset.title ?? "资产"}`}
            className="btn ghost sm"
            type="button"
            title="上移"
            onClick={(event: any) => {
              event.stopPropagation();
              moveAsset(assets, asset, -1, onReorderAssets);
            }}
            disabled={!canMoveUp}
            style={{ width: 24, padding: 0 }}
          >
            <Icon name="chevup" size={11}/>
          </button>
          <button
            aria-label={`下移 ${asset.title ?? "资产"}`}
            className="btn ghost sm"
            type="button"
            title="下移"
            onClick={(event: any) => {
              event.stopPropagation();
              moveAsset(assets, asset, 1, onReorderAssets);
            }}
            disabled={!canMoveDown}
            style={{ width: 24, padding: 0 }}
          >
            <Icon name="chevdown" size={11}/>
          </button>
        </>
      )}
      {onRelateAssets && asset.id && (
        <button
          aria-label={`关联 ${asset.title ?? "资产"}`}
          className="btn ghost sm"
          type="button"
          title="关联资产"
          onClick={(event: any) => {
            event.stopPropagation();
            onRelateAssets(asset);
          }}
        >
          <Icon name="branch" size={11}/>
        </button>
      )}
      <button
        aria-label={`编辑 ${asset.title ?? "资产"}`}
        className="btn ghost sm"
        type="button"
        title="编辑资产"
        onClick={(event: any) => {
          event.stopPropagation();
          onEditAsset?.(asset);
        }}
      >
        <Icon name="eye" size={11}/>
      </button>
      {onDeleteAsset && asset.id && (
        <button
          aria-label={`删除 ${asset.title ?? "资产"}`}
          className="btn ghost danger sm"
          type="button"
          title="删除资产"
          onClick={(event: any) => {
            event.stopPropagation();
            onDeleteAsset(asset);
          }}
          style={{ width: 24, padding: 0 }}
        >
          <Icon name="trash" size={11}/>
        </button>
      )}
    </div>
  );
};

export const ArchiveView = ({
  world,
  savedSettings,
  savedIssues = [],
  onOpenDetail,
  onOpenIssues,
  onBackToWorkbench,
  onCreateAsset,
  onEditAsset,
  onDeleteAsset,
  onReorderAssets,
  onRelateAssets,
}: any) => {
  const [cat, setCat] = useStateA("all");
  const [q, setQ] = useStateA("");

  // Map: setting id → number of unresolved issues touching it
  const issueCountById = useMemoA(() => {
    const m: Record<string, number> = {};
    for (const issue of savedIssues) {
      for (const id of (issue.involves || [])) {
        m[id] = (m[id] || 0) + 1;
      }
    }
    return m;
  }, [savedIssues]);

  const filtered = useMemoA(() => {
    return savedSettings.filter((s: any) => {
      if (cat !== "all" && baseCat(s) !== cat) return false;
      if (q && !s.title.includes(q) && !(s.summary || "").includes(q)) return false;
      return true;
    });
  }, [savedSettings, cat, q]);

  const counts = useMemoA(() => {
    const c: Record<string, number> = { all: savedSettings.length };
    for (const s of savedSettings) {
      const k = baseCat(s);
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [savedSettings]);

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">
            / ren / {world.name} / <span style={{ color: "var(--fg-1)" }}>archive</span>
          </div>
          <h1>世界档案</h1>
          <div className="sub">{savedSettings.length} 项已确认设定 · 推演沉淀下来的结构化资产</div>
        </div>
        <div className="row gap-2">
          <button className="btn ghost" onClick={onBackToWorkbench}>
            <Icon name="spark" size={12}/><span>返回工作台</span>
          </button>
          <button className="btn" onClick={() => onCreateAsset?.("setting")}>
            <Icon name="plus" size={12}/><span>新建设定</span>
          </button>
        </div>
      </div>

      <div style={{
        padding: "12px 32px", borderBottom: "1px solid var(--hairline)",
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      }}>
        {ARCHIVE_CATEGORIES.map(c => (
          <button key={c.id} className={"sb-btn " + (cat === c.id ? "primary" : "")}
            onClick={() => setCat(c.id)} style={{ height: 26, fontSize: 12 }}>
            {c.label} <span className="mono sb-dim">{counts[c.id] || 0}</span>
          </button>
        ))}
        <div className="flex"/>
        <input className="input" placeholder="搜索档案…" value={q} onChange={(e: any) => setQ(e.target.value)}
          style={{ width: "min(100%, 360px)", height: 26, fontSize: 12 }}/>
      </div>

      {/* Consistency issues banner */}
      {savedIssues.length > 0 && (
        <div style={{
          margin: "12px 32px 0", padding: "10px 14px",
          background: "var(--amber-bg)", border: "1px solid var(--amber-dim)",
          borderRadius: 6, display: "flex", alignItems: "center", gap: 10,
        }}>
          <Icon name="asterisk" size={14} style={{ color: "var(--amber)" }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--t-13)", color: "var(--fg)", fontWeight: 500 }}>
              本世界有 {savedIssues.length} 项一致性问题待处理
            </div>
            <div style={{ fontSize: 11.5, color: "var(--fg-2)", marginTop: 2 }}>
              Agent 在「挑刺」模式下发现的矛盾——每条可选：修 / 留为冲突 / 弃
            </div>
          </div>
          <button className="btn sm" onClick={() => onOpenIssues && onOpenIssues(null)}
            style={{ borderColor: "var(--amber-dim)", color: "var(--amber)", background: "var(--surface)" }}>
            <span>查看 · 处理</span>
            <Icon name="chevron" size={11}/>
          </button>
        </div>
      )}

      <div style={{ padding: "20px 32px 40px", flex: 1 }}>
        {filtered.length === 0 ? (
          <ArchiveEmpty hasAny={savedSettings.length > 0} onBackToWorkbench={onBackToWorkbench}/>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}>
            {filtered.map((s: any) => {
              const issueCount = issueCountById[s.id] || 0;
              return (
                <div key={s.id} className="card hover" onClick={() => onOpenDetail(s)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event: any) => openCardFromKeyboard(event, s, onOpenDetail)}
                  style={{
                    textAlign: "left", padding: 14, cursor: "pointer",
                    display: "flex", flexDirection: "column", gap: 8, minHeight: 140,
                    borderColor: issueCount > 0 ? "var(--amber-dim)" : undefined,
                    position: "relative",
                  }}>
                  <div className="row gap-2" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                    <span className={"tag " + (s.kind === "setting" ? "sage" : "brick")}>{s.category}</span>
                    <div className="flex"/>
                    {issueCount > 0 && (
                      <span onClick={(e: any) => { e.stopPropagation(); if (onOpenIssues) onOpenIssues(s.id); }}
                        className="row gap-2" title={`涉及 ${issueCount} 项一致性问题 · 点击处理`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "1px 6px", height: 16, fontSize: 10,
                          background: "var(--amber-bg)", border: "1px solid var(--amber-dim)",
                          borderRadius: 8, color: "var(--amber)", cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                        }}>
                        <Icon name="asterisk" size={9}/>
                        <span>{issueCount} 项问题</span>
                      </span>
                    )}
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>v1</span>
                    <AssetCardActions
                      asset={s}
                      assets={savedSettings}
                      onEditAsset={onEditAsset}
                      onDeleteAsset={onDeleteAsset}
                      onReorderAssets={onReorderAssets}
                      onRelateAssets={onRelateAssets}
                    />
                  </div>
                  <div className="title-font" style={{ fontSize: "var(--t-15)", fontWeight: 600 }}>{s.title}</div>
                  <p className="prose" style={{ fontSize: "var(--t-12)", color: "var(--fg-1)", lineHeight: 1.55, flex: 1 }}>
                    {s.summary}
                  </p>
                  {s.relations && (
                    <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                      {s.relations.slice(0, 3).map((r: any) => <span key={r} className="tag plain" style={{ fontSize: 10 }}>↳ {r}</span>)}
                    </div>
                  )}
                  <div className="row gap-2 mono" style={{
                    paddingTop: 6, borderTop: "1px solid var(--hairline)",
                    fontSize: 11, color: "var(--fg-3)",
                  }}>
                    <span>来自推演 · 刚刚</span>
                    <div className="flex"/>
                    <Icon name="chevron" size={11}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const ArchiveEmpty = ({ hasAny, onBackToWorkbench }: any) => (
  <div style={{
    padding: 60, textAlign: "center", color: "var(--fg-2)",
    border: "1px dashed var(--border)", borderRadius: 8, margin: "0 auto", maxWidth: 540,
  }}>
    <Icon name="archive" size={28} style={{ color: "var(--fg-3)" }}/>
    <h3 style={{ marginTop: 12, color: "var(--fg-1)" }}>
      {hasAny ? "此分类下还没有设定" : "档案是对话的沉淀"}
    </h3>
    <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
      回到工作台继续推演，Agent 会持续提出可保存的设定。点击「保存到档案」，它们会出现在这里。
    </p>
    <button className="btn primary" onClick={onBackToWorkbench} style={{ marginTop: 16 }}>
      <Icon name="spark" size={12}/><span>回到推演</span>
    </button>
  </div>
);

// ────────── Story Seeds Pool ──────────
export const SeedsView = ({
  world,
  savedSeeds,
  savedConflicts = [],
  onOpenDetail,
  onBackToWorkbench,
  onJumpToConflict,
  onCreateAsset,
  onEditAsset,
  onDeleteAsset,
  onReorderAssets,
  onRelateAssets,
}: any) => {
  const [filter, setFilter] = useStateA("all");
  const [q, setQ] = useStateA("");

  // "high potential" heuristic: 3+ open questions = more dramatic surface
  const filtered = useMemoA(() => {
    return savedSeeds.filter((s: any) => {
      const qLen = s.questions ? s.questions.length : 0;
      if (filter === "high" && qLen < 3) return false;
      if (filter === "draft" && qLen >= 3) return false;
      if (q && !s.title.includes(q) && !(s.hook || "").includes(q)) return false;
      return true;
    });
  }, [savedSeeds, filter, q]);

  const counts = useMemoA<Record<string, number>>(() => ({
    all: savedSeeds.length,
    high: savedSeeds.filter((s: any) => (s.questions?.length || 0) >= 3).length,
    draft: savedSeeds.filter((s: any) => (s.questions?.length || 0) < 3).length,
  }), [savedSeeds]);

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">
            / ren / {world.name} / <span style={{ color: "var(--fg-1)" }}>seeds</span>
          </div>
          <h1>故事种子池</h1>
          <div className="sub">{savedSeeds.length} 个种子 · 从世界内部矛盾自然生长出的叙事入口</div>
        </div>
        <div className="row gap-2">
          <button className="btn ghost" onClick={onBackToWorkbench}>
            <Icon name="spark" size={12}/><span>返回工作台</span>
          </button>
          <button className="btn" onClick={() => onCreateAsset?.("seed")}>
            <Icon name="plus" size={12}/><span>新建种子</span>
          </button>
        </div>
      </div>

      <div style={{
        padding: "12px 32px", borderBottom: "1px solid var(--hairline)",
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      }}>
        {[
          { id: "all",   label: "全部" },
          { id: "high",  label: "高潜力" },
          { id: "draft", label: "草稿" },
        ].map(f => (
          <button key={f.id} className={"sb-btn " + (filter === f.id ? "primary" : "")}
            onClick={() => setFilter(f.id)} style={{ height: 26, fontSize: 12 }}>
            {f.label} <span className="mono sb-dim">{counts[f.id] || 0}</span>
          </button>
        ))}
        <div className="flex"/>
        <input className="input" placeholder="搜索种子…" value={q} onChange={(e: any) => setQ(e.target.value)}
          style={{ width: "min(100%, 360px)", height: 26, fontSize: 12 }}/>
      </div>

      <div style={{ padding: "20px 32px 40px" }}>
        {savedSeeds.length === 0 ? (
          <SeedsEmpty onBackToWorkbench={onBackToWorkbench}/>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center", color: "var(--fg-2)",
            border: "1px dashed var(--border)", borderRadius: 8, margin: "0 auto", maxWidth: 480,
          }}>
            <p style={{ fontSize: 13 }}>没有匹配的种子。<a onClick={() => { setFilter("all"); setQ(""); }} style={{ color: "var(--sage)", cursor: "pointer" }}>清除筛选 →</a></p>
          </div>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            {filtered.map((s: any) => {
              const parent = s.parentConflict ? savedConflicts.find((c: any) => c.id === s.parentConflict) : null;
              return (
                <div key={s.id} className="card hover" onClick={() => onOpenDetail(s)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event: any) => openCardFromKeyboard(event, s, onOpenDetail)}
                  style={{
                    textAlign: "left", padding: 0, cursor: "pointer",
                    display: "flex", flexWrap: "wrap", borderLeft: "2px solid var(--violet)",
                  }}>
                  <div style={{ flex: "1 1 280px", padding: "14px 18px" }}>
                    <div className="row gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--violet)" }}>SEED-{String(savedSeeds.indexOf(s) + 1).padStart(3, "0")}</span>
                      <span className="badge violet">{s.questions ? s.questions.length : 0} 未解问题</span>
                      {parent && (
                        <span onClick={(e: any) => { e.stopPropagation(); if (onJumpToConflict) onJumpToConflict(parent); }}
                          className="row gap-2" title="来自冲突池 · 点击查看"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "1px 8px", height: 16, fontSize: 10.5,
                            background: "var(--brick-bg)", border: "1px solid var(--brick-dim)",
                            borderRadius: 9, color: "var(--brick)", cursor: "pointer",
                            fontFamily: "var(--font-mono)",
                          }}>
                          <Icon name="conflict" size={9}/>
                          <span>来自冲突 · {parent.title}</span>
                        </span>
                      )}
                      <div className="flex"/>
                      <AssetCardActions
                        asset={s}
                        assets={savedSeeds}
                        onEditAsset={onEditAsset}
                        onDeleteAsset={onDeleteAsset}
                        onReorderAssets={onReorderAssets}
                        onRelateAssets={onRelateAssets}
                      />
                    </div>
                    <div className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600, marginBottom: 6 }}>
                      {s.title}
                    </div>
                    <p className="prose" style={{ fontSize: "var(--t-14)", color: "var(--fg-1)", lineHeight: 1.6, fontStyle: "italic" }}>
                      " {s.hook} "
                    </p>
                    <div className="row gap-3" style={{ marginTop: 10, gap: 18 }}>
                      <div className="col" style={{ gap: 2, flex: 1 }}>
                        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>触发</span>
                        <span style={{ fontSize: 12, color: "var(--fg-1)" }}>{s.trigger}</span>
                      </div>
                      <div className="col" style={{ gap: 2, flex: 1 }}>
                        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>具体冲突</span>
                        <span style={{ fontSize: 12, color: "var(--fg-1)" }}>{s.conflict}</span>
                      </div>
                    </div>
                    {s.relations && (
                      <div className="row gap-2" style={{ flexWrap: "wrap", marginTop: 10 }}>
                        {s.relations.slice(0, 3).map((r: any) => <span key={r} className="tag plain" style={{ fontSize: 10 }}>↳ {r}</span>)}
                      </div>
                    )}
                  </div>
                  <div style={{
                    flex: "0 1 200px", minWidth: 180, padding: "14px 18px",
                    borderLeft: "1px solid var(--hairline)",
                    background: "var(--bg-1)",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>潜在主角</span>
                    <span style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.5 }}>{s.protagonists}</span>
                    <div className="flex"/>
                    <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                      <span className="badge sage" style={{ height: 16 }}>已归档</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const SeedsEmpty = ({ onBackToWorkbench }: any) => (
  <div style={{
    padding: 60, textAlign: "center", color: "var(--fg-2)",
    border: "1px dashed var(--border)", borderRadius: 8, margin: "0 auto", maxWidth: 540,
  }}>
    <Icon name="seed" size={28} style={{ color: "var(--violet)", opacity: 0.5 }}/>
    <h3 style={{ marginTop: 12, color: "var(--fg-1)" }}>故事种子来自世界内部的矛盾</h3>
    <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
      在工作台用「生成种子」模式，或者从冲突池里挑一个冲突推演——
      种子会从矛盾里自然长出，沉淀到这里。
    </p>
    <button className="btn primary" onClick={onBackToWorkbench} style={{ marginTop: 16 }}>
      <Icon name="seed" size={12}/><span>去生成种子</span>
    </button>
  </div>
);

// ────────── Conflicts pool (slimmer) ──────────
export const ConflictsView = ({
  world,
  savedConflicts,
  savedSeeds = [],
  onOpenDetail,
  onBackToWorkbench,
  onCreateAsset,
  onEditAsset,
  onDeleteAsset,
  onReorderAssets,
  onRelateAssets,
}: any) => {
  const [cat, setCat] = useStateA("all");
  const [q, setQ] = useStateA("");

  // Categories derived from saved data so chips reflect what's actually present.
  // Conflict categories in mock data use the form "一致性 · 风险" — we split on " · ".
  const rawCat = (c: any) => (c.category || "未分类").split("·")[0].trim();

  const categories = useMemoA(() => {
    const set = new Set<string>();
    for (const c of savedConflicts) set.add(rawCat(c));
    return [{ id: "all", label: "全部" }, ...[...set].map(x => ({ id: x, label: x }))];
  }, [savedConflicts]);

  const filtered = useMemoA(() => {
    return savedConflicts.filter((c: any) => {
      if (cat !== "all" && rawCat(c) !== cat) return false;
      if (q && !c.title.includes(q) && !(c.summary || "").includes(q)) return false;
      return true;
    });
  }, [savedConflicts, cat, q]);

  const counts = useMemoA(() => {
    const c: Record<string, number> = { all: savedConflicts.length };
    for (const x of savedConflicts) {
      const k = rawCat(x);
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [savedConflicts]);

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">
            / ren / {world.name} / <span style={{ color: "var(--fg-1)" }}>conflicts</span>
          </div>
          <h1>冲突池</h1>
          <div className="sub">{savedConflicts.length} 个戏剧张力 · 世界的戏剧引擎，作者主动留下的核心矛盾</div>
        </div>
        <div className="row gap-2">
          <button className="btn ghost" onClick={onBackToWorkbench}>
            <Icon name="spark" size={12}/><span>返回工作台</span>
          </button>
          <button className="btn" onClick={() => onCreateAsset?.("conflict")}>
            <Icon name="plus" size={12}/><span>新建冲突</span>
          </button>
        </div>
      </div>

      {savedConflicts.length > 0 && (
        <div style={{
          padding: "12px 32px", borderBottom: "1px solid var(--hairline)",
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        }}>
          {categories.map(c => (
            <button key={c.id} className={"sb-btn " + (cat === c.id ? "primary" : "")}
              onClick={() => setCat(c.id)} style={{ height: 26, fontSize: 12 }}>
              {c.label} <span className="mono sb-dim">{counts[c.id] || 0}</span>
            </button>
          ))}
          <div className="flex"/>
          <input className="input" placeholder="搜索冲突…" value={q} onChange={(e: any) => setQ(e.target.value)}
            style={{ width: "min(100%, 360px)", height: 26, fontSize: 12 }}/>
        </div>
      )}

      <div style={{ padding: "20px 32px 40px" }}>
        {savedConflicts.length === 0 ? (
          <div style={{
            padding: 60, textAlign: "center", color: "var(--fg-2)",
            border: "1px dashed var(--border)", borderRadius: 8, margin: "0 auto", maxWidth: 540,
          }}>
            <Icon name="conflict" size={28} style={{ color: "var(--brick)", opacity: 0.5 }}/>
            <h3 style={{ marginTop: 12, color: "var(--fg-1)" }}>世界还没有戏剧张力</h3>
            <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
              在工作台用「<strong style={{ color: "var(--fg-1)" }}>找张力</strong>」模式让 Agent 找出值得保留的戏剧矛盾。<br/>
              注意：这里的"冲突"不是 bug——是世界的发电机。
            </p>
            <button className="btn primary" onClick={onBackToWorkbench} style={{ marginTop: 16 }}>
              <Icon name="conflict" size={12}/><span>去找张力</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center", color: "var(--fg-2)",
            border: "1px dashed var(--border)", borderRadius: 8, margin: "0 auto", maxWidth: 480,
          }}>
            <p style={{ fontSize: 13 }}>没有匹配的冲突。<a onClick={() => { setCat("all"); setQ(""); }} style={{ color: "var(--sage)", cursor: "pointer" }}>清除筛选 →</a></p>
          </div>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            {filtered.map((c: any) => {
              const derivedCount = savedSeeds.filter((s: any) => s.parentConflict === c.id).length;
              const totalDerivable = (c.derivedSeeds || []).length;
              return (
                <div key={c.id} className="card hover" onClick={() => onOpenDetail(c)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event: any) => openCardFromKeyboard(event, c, onOpenDetail)}
                  style={{
                    textAlign: "left", padding: 0, cursor: "pointer",
                    display: "flex", flexDirection: "column",
                    borderLeft: "2px solid var(--brick)",
                  }}>
                  <div style={{ padding: "16px 18px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                      <span className="tag brick">{c.category}</span>
                      <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>戏剧引擎</span>
                      <div className="flex"/>
                      <AssetCardActions
                        asset={c}
                        assets={savedConflicts}
                        onEditAsset={onEditAsset}
                        onDeleteAsset={onDeleteAsset}
                        onReorderAssets={onReorderAssets}
                        onRelateAssets={onRelateAssets}
                      />
                    </div>
                    <div className="title-font" style={{ fontSize: "var(--t-15)", fontWeight: 600 }}>{c.title}</div>
                    <p className="prose" style={{ fontSize: "var(--t-13)", color: "var(--fg-1)", lineHeight: 1.6 }}>
                      {c.summary}
                    </p>
                    {c.related && (
                      <div className="row gap-2" style={{ flexWrap: "wrap", marginTop: 4 }}>
                        {c.related.map((r: any) => <span key={r} className="tag">↳ {r}</span>)}
                      </div>
                    )}
                  </div>
                  <div style={{
                    padding: "8px 18px", borderTop: "1px solid var(--hairline)",
                    fontSize: 11, color: "var(--fg-2)", display: "flex", alignItems: "center", gap: 8,
                    background: "var(--bg-1)",
                  }} className="mono">
                    <Icon name="seed" size={11} style={{ color: derivedCount > 0 ? "var(--violet)" : "var(--fg-3)" }}/>
                    {derivedCount === 0 ? (
                      <span style={{ color: "var(--fg-3)" }}>尚未衍生种子{totalDerivable > 0 ? ` · 上限 ${totalDerivable}` : ""}</span>
                    ) : (
                      <span style={{ color: "var(--violet)" }}>
                        已沉淀 {derivedCount} 个种子{totalDerivable > 0 && totalDerivable > derivedCount ? ` · 上限 ${totalDerivable}` : ""}
                      </span>
                    )}
                    <div className="flex"/>
                    <span>查看详情</span>
                    <Icon name="chevron" size={11} style={{ color: "var(--fg-3)" }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
