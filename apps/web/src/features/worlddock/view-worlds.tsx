// view-worlds.tsx — Worlds list page + Create flow

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Maturity } from "./components";

// ────────── World card ──────────
const WorldCard = ({ world, onOpen, onDelete, onDuplicate }: any) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: any) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);
  const statusBadge = (() => {
    if (world.status === "published") return { cls: "sage", label: "已公开" };
    if (world.status === "unpublished") return { cls: "amber", label: "未公开" };
    return { cls: "", label: "草稿" };
  })();
  return (
    <div className="card hover" onClick={(e: any) => { if (e.target.closest('[data-menu]')) return; onOpen(world.id); }}
      style={{
        textAlign: "left", padding: 0, border: "1px solid var(--border)",
        background: "var(--surface)", display: "flex", flexDirection: "column",
        cursor: "pointer", minHeight: 184, position: "relative",
      }}>
      <div style={{ padding: "14px 16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="col" style={{ gap: 3, minWidth: 0 }}>
            <div className="row gap-2">
              <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>{world.name}</span>
              {world.hasUnsaved && <span className="dot amber" title="有未保存建议"/>}
              {world.hasUnpushed && <span className="dot slate" title="本地有未 Push 更改"/>}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{world.type}</div>
          </div>
          <div className="row gap-2" data-menu>
            <span className={"badge " + statusBadge.cls}>{statusBadge.label}</span>
            <div style={{ position: "relative" }} ref={menuRef}>
              <button onClick={(e: any) => { e.stopPropagation(); setMenuOpen(o => !o); }}
                className="btn ghost sm" style={{ padding: "2px 6px", minWidth: 0, height: 22 }} title="更多">
                <span style={{ letterSpacing: 1, fontSize: 13, lineHeight: 1 }}>···</span>
              </button>
              {menuOpen && (
                <div onClick={(e: any) => e.stopPropagation()} style={{
                  position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 10,
                  background: "var(--surface)", border: "1px solid var(--border-2)",
                  borderRadius: 6, padding: 4, minWidth: 140,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
                }}>
                  <button className="menu-item" onClick={() => { setMenuOpen(false); if (onDuplicate) onDuplicate(world.id); }}>
                    <Icon name="layers" size={11}/><span>复制为新世界</span>
                  </button>
                  <button className="menu-item" onClick={() => { setMenuOpen(false); navigator.clipboard?.writeText(world.id); }}>
                    <Icon name="check" size={11}/><span>复制 ID</span>
                  </button>
                  <div style={{ height: 1, background: "var(--hairline)", margin: "4px 2px" }}/>
                  <button className="menu-item danger" onClick={() => {
                    setMenuOpen(false);
                    if (confirm(`确定删除「${world.name}」？此操作不可撤销。`) && onDelete) onDelete(world.id);
                  }}>
                    <Icon name="trash" size={11}/><span>删除世界</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="prose" style={{ fontSize: "var(--t-13)", color: "var(--fg-1)", lineHeight: 1.55, flex: 1 }}>
          {world.summary}
        </p>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          {world.tags.map((t: any) => <span key={t} className="tag">{t}</span>)}
        </div>
      </div>
      <div style={{
        padding: "8px 16px", borderTop: "1px solid var(--hairline)",
        display: "flex", gap: 16, fontSize: 11,
      }} className="mono">
        <span className="row gap-2"><Icon name="archive" size={11} style={{ color: "var(--fg-3)" }}/><span>{world.archive}</span></span>
        <span className="row gap-2"><Icon name="seed" size={11} style={{ color: "var(--fg-3)" }}/><span>{world.seeds}</span></span>
        <span className="row gap-2"><Icon name="conflict" size={11} style={{ color: "var(--fg-3)" }}/><span>{world.conflicts}</span></span>
        <div className="flex"/>
        <Maturity value={world.maturity} w={42}/>
        <span style={{ color: "var(--fg-3)", whiteSpace: "nowrap" }}>{world.updated}</span>
      </div>
    </div>
  );
};

// ────────── Empty state card ──────────
const EmptyWorldCard = ({ inspirations, onPick }: any) => (
  <div className="card" style={{
    padding: "20px 20px 16px", minHeight: 184,
    border: "1px dashed var(--border-2)", background: "transparent",
    display: "flex", flexDirection: "column", gap: 12,
  }}>
    <div className="title-font" style={{ fontSize: "var(--t-15)", color: "var(--fg-1)" }}>
      从一句灵感开始
    </div>
    <p style={{ fontSize: "var(--t-12)", color: "var(--fg-2)", lineHeight: 1.55 }}>
      不需要写完整的设定文档。一句话就够。
    </p>
    <div className="col gap-2" style={{ marginTop: "auto", gap: 6 }}>
      {inspirations.map((s: any, i: number) => (
        <button key={i} onClick={() => onPick(s)} className="row gap-2"
          style={{
            background: "transparent", border: "1px solid var(--hairline)",
            borderRadius: 4, padding: "8px 10px", textAlign: "left",
            fontSize: "var(--t-12)", color: "var(--fg-1)", cursor: "pointer",
          }}>
          <Icon name="spark" size={11} style={{ color: "var(--amber)", flex: "none" }}/>
          <span style={{ flex: 1 }}>{s}</span>
          <Icon name="chevron" size={11} style={{ color: "var(--fg-3)" }}/>
        </button>
      ))}
    </div>
  </div>
);

// ────────── Worlds list view ──────────
export const WorldsView = ({ worlds, onOpen, onCreate, savedDraft, onContinueDraft, onDelete, onDuplicate, hideDraftFromList }: any) => {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    return worlds.filter((w: any) => {
      if (hideDraftFromList && w.id === hideDraftFromList) return false;
      if (filter === "published" && w.status !== "published") return false;
      if (filter === "draft" && w.status === "published") return false;
      if (filter === "local" && w.mode !== "local") return false;
      if (q && !w.name.includes(q) && !w.summary.includes(q) && !w.tags.some((t: any) => t.includes(q))) return false;
      return true;
    });
  }, [worlds, q, filter, hideDraftFromList]);

  const inspirations = [
    "一个世界里，记忆可以被买卖。",
    "如果一座城市本身是有意识的。",
    "审判必须由被告自己说出。",
  ];

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ ren / worlds</div>
          <h1>我的世界</h1>
          <div className="sub">{worlds.length} 个世界 · {worlds.filter((w: any) => w.status === "published").length} 个已公开 · {worlds.filter((w: any) => w.hasUnsaved || w.hasUnpushed).length} 个有未处理改动</div>
        </div>
        <div className="row gap-2">
          <div style={{ position: "relative" }}>
            <Icon name="explore" size={13} style={{ position: "absolute", left: 9, top: 9, color: "var(--fg-3)" }}/>
            <input className="input" placeholder="搜索世界、标签、设定…"
              value={q} onChange={(e: any) => setQ(e.target.value)}
              style={{ paddingLeft: 28, width: "min(100%, 360px)", height: 30 }}/>
          </div>
          <button className="btn primary" onClick={() => onCreate()}>
            <Icon name="plus" size={13}/>
            <span>新建世界</span>
            <span className="kbd" style={{ marginLeft: 4 }}>⌘N</span>
          </button>
        </div>
      </div>

      <div style={{
        padding: "12px 32px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid var(--hairline)",
      }}>
        {[
          { id: "all", label: "全部", n: worlds.length },
          { id: "published", label: "已公开", n: worlds.filter((w: any) => w.status === "published").length },
          { id: "draft", label: "草稿 / 未公开", n: worlds.filter((w: any) => w.status !== "published").length },
          { id: "local", label: "Local", n: worlds.filter((w: any) => w.mode === "local").length },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={"sb-btn " + (filter === f.id ? "primary" : "")}
            style={{ height: 26, fontSize: 12 }}>
            {f.label} <span className="mono sb-dim">{f.n}</span>
          </button>
        ))}
        <div className="flex"/>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>updated</span>
        <Icon name="chevdown" size={11} style={{ color: "var(--fg-3)" }}/>
      </div>

      <div style={{
        padding: "20px 32px 40px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 14,
      }}>
        {savedDraft && (
          <button className="card hover" onClick={onContinueDraft}
            style={{
              textAlign: "left", padding: 0, cursor: "pointer", minHeight: 184,
              borderColor: "var(--sage-dim)", background: "linear-gradient(to bottom, var(--sage-bg), var(--surface))",
              display: "flex", flexDirection: "column",
            }}>
            <div style={{ padding: "14px 16px", flex: 1 }}>
              <div className="row gap-2" style={{ marginBottom: 8 }}>
                <span className="badge sage">刚刚创建</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>just now</span>
              </div>
              <div className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600, marginBottom: 6 }}>
                {savedDraft.name}
              </div>
              <p className="prose" style={{ fontSize: "var(--t-13)", color: "var(--fg-1)" }}>
                {savedDraft.coreSetting}
              </p>
            </div>
            <div style={{
              padding: "10px 16px", borderTop: "1px solid var(--sage-dim)",
              fontSize: 12, color: "var(--sage)", display: "flex", alignItems: "center", gap: 6,
            }}>
              <Icon name="spark" size={12}/>
              <span>进入工作台继续推演</span>
              <Icon name="chevron" size={12} style={{ marginLeft: "auto" }}/>
            </div>
          </button>
        )}
        {filtered.map((w: any) => <WorldCard key={w.id} world={w} onOpen={onOpen} onDelete={onDelete} onDuplicate={onDuplicate}/>)}
        {!savedDraft && filtered.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center", color: "var(--fg-2)" }}>
            没有匹配的世界。<a onClick={() => onCreate()} style={{ color: "var(--sage)", cursor: "pointer" }}>新建一个 →</a>
          </div>
        )}
        {!savedDraft && filtered.length > 0 && filter === "all" && <EmptyWorldCard inspirations={inspirations} onPick={(s: any) => onCreate(s)}/>}
      </div>
    </div>
  );
};

export const CreateView = ({ initialInspiration, onConfirm, onCancel }: any) => {
  const [inspiration, setInspiration] = useState(initialInspiration || "");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [styleKw, setStyleKw] = useState("");
  const [avoid, setAvoid] = useState("");

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ ren / worlds / <span style={{ color: "var(--fg-1)" }}>new</span></div>
          <h1>创建世界</h1>
          <div className="sub">用一句灵感启动。创建后会直接进入真实 Agent 推演。</div>
        </div>
        <button className="btn ghost" onClick={onCancel}>取消</button>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 32px 60px" }}>
        <div className="col gap-6" style={{ gap: 20 }}>
          <div>
            <label className="label" htmlFor="initial-inspiration">初始灵感 <span className="opt">必填</span></label>
            <textarea id="initial-inspiration" className="textarea" placeholder="一句话就够。例如：一个世界里，记忆可以被买卖。"
              value={inspiration} onChange={(e: any) => setInspiration(e.target.value)} rows={3}
              style={{ fontSize: "var(--t-15)", lineHeight: 1.6 }} autoFocus/>
          </div>
          <div className="row gap-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div>
              <label className="label" htmlFor="world-name">世界名称 <span className="opt">可选</span></label>
              <input id="world-name" className="input" placeholder="留空使用灵感摘要"
                value={name} onChange={(e: any) => setName(e.target.value)}/>
            </div>
            <div>
              <label className="label" htmlFor="world-type">类型 <span className="opt">可选</span></label>
              <input id="world-type" className="input" placeholder="近未来 / 奇幻 / 蒸汽朋克…"
                value={type} onChange={(e: any) => setType(e.target.value)}/>
            </div>
          </div>
          <div className="row gap-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div>
              <label className="label" htmlFor="world-style">风格关键词 <span className="opt">可选</span></label>
              <input id="world-style" className="input" placeholder="冷静观察 · 制度细节 · 道德灰度"
                value={styleKw} onChange={(e: any) => setStyleKw(e.target.value)}/>
            </div>
            <div>
              <label className="label" htmlFor="world-avoid">不想要的方向 <span className="opt">可选</span></label>
              <input id="world-avoid" className="input" placeholder="例如：爽文 / 单线主角 / 一键拯救世界"
                value={avoid} onChange={(e: any) => setAvoid(e.target.value)}/>
            </div>
          </div>

          <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <button
              className="btn primary lg"
              onClick={() => onConfirm({ name, type, inspiration, styleKw, avoid })}
              disabled={!inspiration.trim()}
            >
              <Icon name="spark" size={14}/>
              <span>创建并进入工作台</span>
              <span className="kbd">↵</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
