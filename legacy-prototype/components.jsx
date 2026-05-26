// components.jsx — Shared primitives for WorldDock
// Icons, status bar, rail, drawer, dialog, tags, etc.

// ────────── Icons (stroke-based, 16/18/20 px, minimal) ──────────
const Icon = ({ name, size = 16, className = "", style = {} }) => {
  const paths = {
    // Rail icons
    worlds:   "M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18",
    create:   "M12 5v14M5 12h14",
    explore:  "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
    archive:  "M3 7h18M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M9 11h6M3 4h18v3H3z",
    seed:     "M12 2c0 4-3 6-3 10a3 3 0 0 0 6 0c0-4-3-6-3-10zM12 14v8M8 22h8",
    conflict: "M12 4 4 18h16zM12 10v4M12 17v.5",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19.4 13a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V18a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H5a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V5a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H19a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6z",
    community:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    // UI
    chevron:  "M9 6l6 6-6 6",
    chevdown: "M6 9l6 6 6-6",
    chevup:   "M6 15l6-6 6 6",
    x:        "M6 6l12 12M18 6L6 18",
    check:    "M5 12l5 5L20 7",
    plus:     "M12 5v14M5 12h14",
    save:     "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
    edit:     "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    trash:    "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6",
    drawer:   "M3 3h18v18H3zM15 3v18",
    contextpanel: "M3 3h18v18H3zM3 9h18",
    stop:     "M6 6h12v12H6z",
    refresh:  "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
    send:     "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
    spark:    "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8",
    branch:   "M6 3v12M18 9a3 3 0 1 0-6 0c0 4 6 4 6 8a3 3 0 1 1-6 0M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    push:     "M12 19V5M5 12l7-7 7 7",
    star:     "M12 2l3.1 6.3 7 1-5 4.9 1.2 6.9L12 17.8 5.7 21l1.2-6.9-5-4.9 7-1L12 2z",
    fork:     "M6 3v12M18 9a3 3 0 1 0-6 0c0 4 6 4 6 8a3 3 0 1 1-6 0",
    book:     "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
    flag:     "M4 22V4a1 1 0 0 1 1-1h12l-3 5 3 5H5",
    eye:      "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    eyeoff:   "M17.94 17.94A10.5 10.5 0 0 1 12 19c-7 0-10-7-10-7a18 18 0 0 1 5-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 10 7 10 7a18 18 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20",
    upload:   "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    bolt:     "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    book2:    "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5V4.5zM20 16H6.5A2.5 2.5 0 0 0 4 18.5",
    layers:   "M12 2l10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    asterisk: "M12 2v20M2 12h20M5 5l14 14M19 5L5 19",
    info:     "M12 8v.01M12 12v4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    bell:     "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
    history:  "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  };
  const d = paths[name] || paths.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
};

// ────────── Status Bar ──────────
const StatusBar = ({ world, mode, balance, tokens, onMode, onOpenPublish, onOpenCommunity }) => {
  const isCloud = mode === "cloud";
  return (
    <div className="statusbar">
      <div className="statusbar-section" style={{ paddingLeft: 4 }}>
        <span className="title-font" style={{
          fontFamily: "var(--font-serif)", fontSize: 15, color: "var(--fg)", letterSpacing: 0
        }}>界坞</span>
        <span className="sb-mono sb-dim" style={{ marginLeft: 2 }}>WorldDock</span>
      </div>

      {world && (
        <>
          <div className="statusbar-section">
            <Icon name="layers" size={13} style={{ color: "var(--fg-3)" }}/>
            <span style={{ color: "var(--fg)" }}>{world.name}</span>
            <span className="sb-mono sb-dim">@ren</span>
          </div>
          <div className="statusbar-section">
            <span className="sb-mono sb-dim">maturity</span>
            <span className="sb-mono" style={{ color: world.maturity > 60 ? "var(--sage)" : world.maturity > 35 ? "var(--amber)" : "var(--fg-2)" }}>
              {world.maturity}%
            </span>
            <div style={{ width: 36, height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: world.maturity + "%", height: "100%",
                background: world.maturity > 60 ? "var(--sage)" : world.maturity > 35 ? "var(--amber)" : "var(--fg-3)"
              }}/>
            </div>
          </div>
          <div className="statusbar-section">
            {world.status === "published" && <span className="badge sage"><span className="dot sage" style={{width:5,height:5,boxShadow:"none"}}/>已公开</span>}
            {world.status === "unpublished" && <span className="badge amber">未公开</span>}
            {world.status === "draft" && <span className="badge"><span style={{color:"var(--fg-3)"}}>草稿</span></span>}
            {world.hasUnsaved && <span className="badge amber">未保存</span>}
            {world.hasUnpushed && <span className="badge slate">本地有改动</span>}
          </div>
        </>
      )}

      <div className="statusbar-section flex"/>

      <div className="statusbar-section">
        <button className="sb-btn" onClick={() => onMode && onMode(isCloud ? "local" : "cloud")} title="切换模式 ⌘L">
          <span className={"dot " + (isCloud ? "slate" : "sage")}/>
          <span className="sb-mono" style={{ color: isCloud ? "var(--slate)" : "var(--sage)" }}>
            {isCloud ? "CLOUD" : "LOCAL"}
          </span>
        </button>
      </div>

      {isCloud ? (
        <>
          <div className="statusbar-section">
            <span className="sb-mono sb-dim">balance</span>
            <span className="sb-mono">¥<span className="num">{balance.toFixed(2)}</span></span>
          </div>
          <div className="statusbar-section">
            <span className="sb-mono sb-dim">run</span>
            <span className="sb-mono" style={{ color: "var(--amber)" }}>{tokens} tk</span>
          </div>
        </>
      ) : (
        <>
          <div className="statusbar-section" title="本地模型连接">
            <span className="dot sage"/>
            <span className="sb-mono sb-dim">model</span>
            <span className="sb-mono">qwen3-32b</span>
          </div>
          <div className="statusbar-section">
            <span className="sb-mono sb-dim">ctx</span>
            <span className="sb-mono">{tokens} / 32k</span>
          </div>
        </>
      )}

      <div className="statusbar-section">
        <button className="sb-btn" onClick={onOpenCommunity} title="界仓社区">
          <Icon name="community" size={12}/>
          <span>界仓</span>
        </button>
        <button className="sb-btn primary" onClick={onOpenPublish}>
          <Icon name={mode === "local" ? "push" : "upload"} size={12}/>
          <span>{mode === "local" ? "Push" : "发布"}</span>
        </button>
      </div>
    </div>
  );
};

// ────────── Left Rail ──────────
const Rail = ({ view, onNav, world, pendingCount }) => {
  const items = [
    { id: "worlds",   label: "世界",  ico: "worlds" },
    { id: "explore",  label: "界仓",  ico: "community" },
  ];
  const worldItems = world ? [
    { id: "workbench", label: "推演", ico: "spark", badge: pendingCount },
    { id: "archive",   label: "档案", ico: "archive" },
    { id: "seeds",     label: "种子", ico: "seed" },
    { id: "conflicts", label: "冲突", ico: "conflict" },
  ] : [];
  return (
    <div className="rail">
      <div className="rail-logo title-font">界</div>
      {items.map(it => (
        <button key={it.id} className={"rail-item " + (view === it.id ? "active" : "")} onClick={() => onNav(it.id)}>
          <Icon name={it.ico} size={18}/>
          <span className="lbl">{it.label}</span>
        </button>
      ))}
      {worldItems.length > 0 && <div style={{ height: 1, background: "var(--hairline)", margin: "8px 12px" }}/>}
      {worldItems.map(it => (
        <button key={it.id} className={"rail-item " + (view === it.id ? "active" : "")} onClick={() => onNav(it.id)}>
          <Icon name={it.ico} size={18}/>
          <span className="lbl">{it.label}</span>
          {it.badge ? <span className="rail-badge">{it.badge}</span> : null}
        </button>
      ))}
      <div className="rail-spacer"/>
      <button className="rail-item" onClick={() => onNav("settings")}>
        <Icon name="settings" size={16}/>
      </button>
    </div>
  );
};

// ────────── Drawer (right side, slides in) ──────────
const Drawer = ({ open, onClose, title, subtitle, children, width }) => {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: open ? "rgba(0,0,0,0.25)" : "transparent",
          pointerEvents: open ? "auto" : "none",
          opacity: open ? 1 : 0,
          transition: "opacity .18s var(--ease-out)",
          zIndex: 20,
        }}
      />
      <aside
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: width || "var(--drawer-w)",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: open ? "-20px 0 40px rgba(0,0,0,0.3)" : "none",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform .22s var(--ease-out)",
          display: "flex", flexDirection: "column",
          zIndex: 21,
        }}
      >
        <header style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "14px 16px 12px", borderBottom: "1px solid var(--hairline)",
          gap: 12, flex: "none",
        }}>
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: "var(--t-14)", fontWeight: 600, letterSpacing: "-0.005em" }}>{title}</div>
            {subtitle && <div style={{ fontSize: "var(--t-12)", color: "var(--fg-2)" }}>{subtitle}</div>}
          </div>
          <button className="btn ghost sm" onClick={onClose} style={{ width: 24, padding: 0 }}>
            <Icon name="x" size={14}/>
          </button>
        </header>
        <div className="drawer-body" style={{ flex: 1, minHeight: 0, padding: "14px 16px 20px" }}>
          {children}
        </div>
      </aside>
    </>
  );
};

// ────────── Toast ──────────
const Toasts = ({ toasts, onDismiss }) => (
  <div style={{
    position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", gap: 8, zIndex: 1000, pointerEvents: "none",
  }}>
    {toasts.map(t => (
      <div key={t.id} className="fade-in" style={{
        background: "var(--surface-2)", border: "1px solid var(--border-2)",
        borderLeft: "2px solid " + (t.kind === "save" ? "var(--sage)" : t.kind === "warn" ? "var(--amber)" : "var(--slate)"),
        borderRadius: 4, padding: "8px 12px",
        fontSize: "var(--t-13)", color: "var(--fg)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        pointerEvents: "auto",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Icon name={t.kind === "save" ? "check" : t.kind === "warn" ? "info" : "info"} size={14}
          style={{ color: t.kind === "save" ? "var(--sage)" : t.kind === "warn" ? "var(--amber)" : "var(--slate)" }}/>
        <span>{t.text}</span>
        {t.action && <a onClick={t.action.onClick} style={{ color: "var(--slate)", cursor: "pointer", marginLeft: 8 }}>{t.action.label}</a>}
      </div>
    ))}
  </div>
);

// ────────── Maturity bar ──────────
const Maturity = ({ value, w = 60 }) => (
  <div className="row gap-2">
    <div style={{ width: w, height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        width: value + "%", height: "100%",
        background: value > 60 ? "var(--sage)" : value > 35 ? "var(--amber)" : "var(--fg-3)",
      }}/>
    </div>
    <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>{value}%</span>
  </div>
);

// Expose
Object.assign(window, { Icon, StatusBar, Rail, Drawer, Toasts, Maturity });
