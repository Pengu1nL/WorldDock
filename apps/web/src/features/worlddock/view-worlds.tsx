// view-worlds.tsx — Worlds list page + Create flow

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Maturity } from "./components";

const CREATION_SEEDS = {
  memory: {
    tools: [
      { id: "ctx", label: "分析灵感主题", detail: "提取核心概念：记忆 / 交易 / 财产权 / 身份" },
      { id: "rules", label: "检索相关规则模板", detail: "近未来法律体系 · 经济制度 · 神经科技伦理" },
      { id: "shape", label: "生成世界雏形", detail: "收束名称、类型、核心设定与第一轮问题" },
    ],
    suggestedName: "回忆所",
    suggestedType: "近未来 / 软科幻 / 社会派",
    styles: ["冷静观察", "制度细节", "道德灰度"],
    coreSetting: "在一个允许记忆作为资产交易的近未来社会，个人最私密的体验成为了可估值、可转让、可继承的财产。",
    coreConflict: "记忆是不可让渡的人格延伸，还是可以定价的私有财产？",
    directions: [
      "深入《记忆交易法》的制度细节与监管漏洞",
      "聚焦黑市与「完整人生」打包交易",
      "探讨记忆植入后宿主的身份连续性",
    ],
    firstQuestion: "你倾向于让记忆交易是成熟合法市场，还是刚被立法承认、仍在制造伦理震荡的新行业？",
  },
  city: {
    tools: [
      { id: "ctx", label: "分析灵感主题", detail: "提取核心概念：意识 / 城市 / 居民" },
      { id: "rules", label: "检索相关规则模板", detail: "都市奇幻 · 集体意识 · 拟人化制度" },
      { id: "shape", label: "生成世界雏形", detail: "收束名称、类型、核心设定与第一轮问题" },
    ],
    suggestedName: "市声",
    suggestedType: "都市奇幻 / 思辨",
    styles: ["拟人化制度", "建筑学诗意", "缓慢张力"],
    coreSetting: "城市拥有集体意识，居民同时是它的细胞、它的语言、它的食物。",
    coreConflict: "城市的福祉与个体居民的福祉何时一致，何时撕裂？",
    directions: [
      "城市的「神经系统」如何通过交通、电力和广播表达",
      "失语城市与流亡居民的关系",
      "两座有意识城市之间的外交",
    ],
    firstQuestion: "城市的意识是单一的「她」，还是由街区议会争吵出来的「我们」？",
  },
};

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
export const WorldsView = ({ worlds, onOpen, onCreate, savedDraft, onContinueDraft, onDelete, onDuplicate, hideDraftFromList, cloudState = "fixture", cloudOnly = false }: any) => {
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
  const showCloudState = cloudState === "loading" || cloudState === "error" || (cloudState === "ready" && worlds.length === 0);

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
          ...(!cloudOnly ? [{ id: "local", label: "Local", n: worlds.filter((w: any) => w.mode === "local").length }] : []),
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
        {cloudState === "loading" && (
          <div role="status" style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center", color: "var(--fg-2)" }}>
            正在同步云端世界...
          </div>
        )}
        {cloudState === "error" && (
          <div role="status" style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center", color: "var(--fg-2)" }}>
            云端世界暂不可用，请稍后重试。
          </div>
        )}
        {cloudState === "ready" && worlds.length === 0 && (
          <div role="status" style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center", color: "var(--fg-2)" }}>
            还没有云端世界。<a onClick={() => onCreate()} style={{ color: "var(--sage)", cursor: "pointer" }}>新建一个</a>
          </div>
        )}
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
        {!savedDraft && filtered.length === 0 && !showCloudState && (
          <div style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center", color: "var(--fg-2)" }}>
            没有匹配的世界。<a onClick={() => onCreate()} style={{ color: "var(--sage)", cursor: "pointer" }}>新建一个 →</a>
          </div>
        )}
        {!savedDraft && filtered.length > 0 && filter === "all" && <EmptyWorldCard inspirations={inspirations} onPick={(s: any) => onCreate(s)}/>}
      </div>
    </div>
  );
};

// ────────── Create World view ──────────
export const CreateView = ({ initialInspiration, seedKey, onConfirm, onCancel }: any) => {
  const [step, setStep] = useState("input");   // 'input' | 'generating' | 'confirm'
  const [inspiration, setInspiration] = useState(initialInspiration || "");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [styleKw, setStyleKw] = useState("");
  const [avoid, setAvoid] = useState("");
  const [seedData, setSeedData] = useState<any>(null);
  const [progressIdx, setProgressIdx] = useState(0);

  const seed = (CREATION_SEEDS as Record<string, typeof CREATION_SEEDS.memory>)[seedKey] ?? CREATION_SEEDS.memory;

  useEffect(() => {
    if (step !== "generating") return;
    const data = seed;
    let i = 0;
    const adv = () => {
      if (i < data.tools.length) {
        setProgressIdx(i + 1);
        i++;
        setTimeout(adv, 700);
      } else {
        setTimeout(() => {
          setSeedData(data);
          setStep("confirm");
        }, 400);
      }
    };
    adv();
  }, [step, seedKey, seed]);

  const startGen = () => {
    if (!inspiration.trim()) return;
    setProgressIdx(0);
    setStep("generating");
  };

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ ren / worlds / <span style={{ color: "var(--fg-1)" }}>new</span></div>
          <h1>创建世界</h1>
          <div className="sub">用一句灵感启动。其余的，让 Agent 先帮你推演出第一个雏形。</div>
        </div>
        <button className="btn ghost" onClick={onCancel}>取消</button>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 32px 60px" }}>
        {step === "input" && (
          <div className="col gap-6" style={{ gap: 20 }}>
            <div>
              <label className="label" htmlFor="initial-inspiration">初始灵感 <span className="opt">必填</span></label>
              <textarea id="initial-inspiration" className="textarea" placeholder="一句话就够。例如：一个世界里，记忆可以被买卖。"
                value={inspiration} onChange={(e: any) => setInspiration(e.target.value)} rows={3}
                style={{ fontSize: "var(--t-15)", lineHeight: 1.6 }} autoFocus/>
            </div>
            <div className="row gap-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <div>
                <label className="label" htmlFor="world-name">世界名称 <span className="opt">可选 — Agent 会建议</span></label>
                <input id="world-name" className="input" placeholder="留空让 Agent 起名"
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

            <div className="row gap-2" style={{ justifyContent: "space-between", marginTop: 10 }}>
              <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
                Agent 会先生成一个可推演的雏形，让你确认再创建世界。
              </span>
              <button className="btn primary lg" onClick={startGen} disabled={!inspiration.trim()}>
                <Icon name="spark" size={14}/>
                <span>开始推演</span>
                <span className="kbd">↵</span>
              </button>
            </div>
          </div>
        )}

        {step === "generating" && (
          <div className="col gap-4" style={{ padding: "20px 0", gap: 14 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="row gap-2" style={{ marginBottom: 10 }}>
                <span className="dot sage pulse"/>
                <span className="mono" style={{ fontSize: 12, color: "var(--sage)" }}>agent.run.started</span>
                <span style={{ flex: 1 }}/>
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{progressIdx}/{seed.tools.length}</span>
              </div>
              <div className="col" style={{ gap: 6 }}>
                {seed.tools.map((t: any, i: number) => {
                  const state = i < progressIdx ? "done" : i === progressIdx ? "running" : "queued";
                  return (
                    <div key={t.id} className="row gap-2" style={{
                      padding: "8px 10px", borderRadius: 4,
                      background: state === "running" ? "var(--surface-2)" : "transparent",
                      opacity: state === "queued" ? 0.5 : 1,
                    }}>
                      {state === "done" && <Icon name="check" size={12} style={{ color: "var(--sage)" }}/>}
                      {state === "running" && <span className="dot sage pulse" style={{ width: 6, height: 6, boxShadow: "none" }}/>}
                      {state === "queued" && <span className="dot muted" style={{ width: 6, height: 6, boxShadow: "none" }}/>}
                      <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)", minWidth: 110 }}>{t.label}</span>
                      <span style={{ fontSize: 12, color: "var(--fg-1)", flex: 1 }}>{t.detail}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ textAlign: "center", color: "var(--fg-3)", fontSize: 12 }}>
              正在生成世界雏形，请稍候 …
            </div>
          </div>
        )}

        {step === "confirm" && seedData && (
          <ConfirmCard
            seed={seedData}
            overrideName={name}
            overrideType={type}
            onRegenerate={() => { setSeedData(null); setStep("generating"); }}
            onConfirm={(finalName: any) => onConfirm({
              name: finalName || seedData.suggestedName,
              type: type || seedData.suggestedType,
              inspiration,
              styleKw,
              avoid,
              seedKey,
            })}
          />
        )}
      </div>
    </div>
  );
};

// ────────── World seed confirmation card ──────────
const ConfirmCard = ({ seed, overrideName, overrideType, onRegenerate, onConfirm }: any) => {
  const [name, setName] = useState(overrideName || seed.suggestedName);
  const [editing, setEditing] = useState(false);

  return (
    <div className="col gap-4" style={{ gap: 14 }}>
      <div className="row gap-2">
        <span className="badge sage"><Icon name="check" size={10}/>&nbsp;雏形已生成</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
          agent.run.completed · 4.2s · 1,283 tokens
        </span>
      </div>

      <div className="card" style={{ padding: 20, borderColor: "var(--border-2)" }}>
        <div className="col gap-3" style={{ gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 4 }} className="mono">建议名称</div>
            {editing ? (
              <input className="input" value={name} onChange={(e: any) => setName(e.target.value)} autoFocus
                onBlur={() => setEditing(false)}
                style={{ fontSize: "var(--t-22)", fontWeight: 600, fontFamily: "var(--font-serif)" }}/>
            ) : (
              <div className="row gap-2">
                <h2 className="title-font">{name}</h2>
                <button className="btn ghost sm" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={11}/><span>改</span>
                </button>
              </div>
            )}
            <div className="row gap-2" style={{ marginTop: 6 }}>
              <span className="tag plain">{overrideType || seed.suggestedType}</span>
              {seed.styles.map((s: any) => <span key={s} className="tag">{s}</span>)}
            </div>
          </div>

          <div className="divider"/>

          <div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 6 }} className="mono">核心设定</div>
            <p className="prose" style={{ fontSize: "var(--t-15)", color: "var(--fg)", lineHeight: 1.65 }}>
              {seed.coreSetting}
            </p>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 6 }} className="mono">核心矛盾</div>
            <p className="prose" style={{ fontSize: "var(--t-14)", color: "var(--fg-1)", lineHeight: 1.6 }}>
              {seed.coreConflict}
            </p>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 6 }} className="mono">可推演方向</div>
            <div className="col" style={{ gap: 4 }}>
              {seed.directions.map((d: any, i: number) => (
                <div key={i} className="row gap-2" style={{ fontSize: "var(--t-13)", color: "var(--fg-1)" }}>
                  <span className="mono" style={{ color: "var(--amber)", minWidth: 16 }}>0{i + 1}</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="divider"/>

          <div className="card" style={{
            padding: 12, background: "var(--slate-bg)", borderColor: "var(--slate-dim)",
          }}>
            <div className="row gap-2" style={{ marginBottom: 6 }}>
              <Icon name="spark" size={12} style={{ color: "var(--slate)" }}/>
              <span className="mono" style={{ fontSize: 11, color: "var(--slate)" }}>第一轮追问</span>
            </div>
            <p style={{ fontSize: "var(--t-14)", color: "var(--fg)", lineHeight: 1.55 }}>
              {seed.firstQuestion}
            </p>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--fg-3)", padding: "0 4px" }}>
        这只是一个起点。创建后可以在工作台继续推演、收束、保存为档案。
      </div>

      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <button className="btn ghost" onClick={onRegenerate}>
          <Icon name="refresh" size={12}/>
          <span>重新生成</span>
        </button>
        <div className="row gap-2">
          <button className="btn">编辑后创建</button>
          <button className="btn primary lg" onClick={() => onConfirm(name)}>
            <span>确认并进入工作台</span>
            <Icon name="chevron" size={13}/>
          </button>
        </div>
      </div>
    </div>
  );
};
