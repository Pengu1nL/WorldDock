// components.tsx — Shared primitives for WorldDock
// Icons, status bar, rail, drawer, dialog, tags, etc.

import * as Dialog from "@radix-ui/react-dialog";
import * as Lucide from "lucide-react";

const ICONS: Record<string, Lucide.LucideIcon> = {
  worlds: Lucide.Globe2,
  create: Lucide.Plus,
  assets: Lucide.Library,
  consistency: Lucide.TriangleAlert,
  session: Lucide.MessagesSquare,
  explore: Lucide.Search,
  archive: Lucide.Archive,
  seed: Lucide.Sprout,
  conflict: Lucide.TriangleAlert,
  settings: Lucide.Settings,
  chevron: Lucide.ChevronRight,
  chevdown: Lucide.ChevronDown,
  chevup: Lucide.ChevronUp,
  x: Lucide.X,
  check: Lucide.Check,
  plus: Lucide.Plus,
  save: Lucide.Save,
  edit: Lucide.Pencil,
  trash: Lucide.Trash2,
  drawer: Lucide.PanelRight,
  contextpanel: Lucide.PanelTop,
  stop: Lucide.Square,
  refresh: Lucide.RefreshCw,
  send: Lucide.Send,
  spark: Lucide.Sparkles,
  branch: Lucide.GitBranch,
  push: Lucide.Upload,
  star: Lucide.Star,
  fork: Lucide.GitFork,
  book: Lucide.BookOpen,
  flag: Lucide.Flag,
  eye: Lucide.Eye,
  eyeoff: Lucide.EyeOff,
  upload: Lucide.Upload,
  download: Lucide.Download,
  bolt: Lucide.Zap,
  book2: Lucide.BookOpen,
  layers: Lucide.Layers,
  asterisk: Lucide.Asterisk,
  info: Lucide.Info,
  bell: Lucide.Bell,
  history: Lucide.History,
};

// ────────── Icons (lucide adapter, preserves the prototype API) ──────────
export const Icon = ({ name, size = 16, className = "", style = {} }: any) => {
  const Component = ICONS[name] || Lucide.Info;
  return (
    <Component
      size={size}
      className={className}
      style={style}
      strokeWidth={1.6}
      aria-hidden="true"
    />
  );
};

// ────────── Status Bar ──────────
export const StatusBar = ({ world, mode, tokens }: any) => {
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

      <div className="statusbar-section statusbar-technical">
        <span className="dot statusbar-technical-dot"/>
        <span className="sb-mono">{String(mode).toUpperCase()}</span>
      </div>

      <div className="statusbar-section statusbar-technical" title="本地模型连接">
        <span className="sb-mono sb-dim statusbar-technical">model</span>
        <span className="sb-mono">local API</span>
      </div>
      <div className="statusbar-section statusbar-technical">
        <span className="sb-mono sb-dim statusbar-technical">run</span>
        <span className="sb-mono">{tokens} tk</span>
      </div>
    </div>
  );
};

// ────────── Left Rail ──────────
export const Rail = ({ view, onNav, world, pendingCount, items, worldItems }: any) => {
  const railItems = items ?? [
    { id: "worlds", label: "世界", icon: "worlds" },
  ];
  const railWorldItems = world ? (worldItems ?? [
    { id: "exploration", label: "推演", icon: "session", badge: pendingCount },
    { id: "asset-library", label: "资产库", icon: "assets" },
    { id: "consistency", label: "矛盾", icon: "consistency" },
    { id: "publish", label: "发布", icon: "push" },
  ]) : [];
  return (
    <div className="rail">
      <div className="rail-logo title-font">界</div>
      {railItems.map((it: any) => (
        <button key={it.id} className={"rail-item " + (view === it.id ? "active" : "")} onClick={() => onNav(it.id)}>
          <Icon name={it.icon ?? it.ico} size={18}/>
          <span className="lbl">{it.label}</span>
          {it.badge ? <span className="rail-badge">{it.badge}</span> : null}
        </button>
      ))}
      {railWorldItems.length > 0 && <div style={{ height: 1, background: "var(--hairline)", margin: "8px 12px" }}/>}
      {railWorldItems.map((it: any) => (
        <button key={it.id} className={"rail-item " + (view === it.id ? "active" : "")} onClick={() => onNav(it.id)}>
          <Icon name={it.icon ?? it.ico} size={18}/>
          <span className="lbl">{it.label}</span>
          {it.badge ? <span className="rail-badge">{it.badge}</span> : null}
        </button>
      ))}
      <div className="rail-spacer"/>
      <button className={"rail-item " + (view === "settings" ? "active" : "")} onClick={() => onNav("settings")} aria-label="设置">
        <Icon name="settings" size={16}/>
      </button>
    </div>
  );
};

// ────────── Drawer (right side, slides in) ──────────
export const Drawer = ({ open, onClose, title, subtitle, children, width }: any) => {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 20,
          }}
        />
        <Dialog.Content
          aria-describedby={subtitle ? undefined : "worlddock-drawer-description"}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: width || "var(--drawer-w)",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-18px 0 44px rgba(23, 26, 33, 0.14)",
          transform: "translateX(0)",
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
            <Dialog.Title style={{ fontSize: "var(--t-14)", fontWeight: 600, letterSpacing: 0 }}>{title}</Dialog.Title>
            {subtitle ? (
              <Dialog.Description style={{ fontSize: "var(--t-12)", color: "var(--fg-2)" }}>{subtitle}</Dialog.Description>
            ) : (
              <Dialog.Description id="worlddock-drawer-description" style={{ display: "none" }}>
                WorldDock drawer
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close className="btn ghost sm" style={{ width: 24, padding: 0 }}>
            <Icon name="x" size={14}/>
          </Dialog.Close>
        </header>
        <div className="drawer-body" style={{ flex: 1, minHeight: 0, padding: "14px 16px 20px" }}>
          {children}
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

// ────────── Toast ──────────
export const Toasts = ({ toasts }: any) => (
  <div style={{
    position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", gap: 8, zIndex: 1000, pointerEvents: "none",
  }}>
    {toasts.map((t: any) => (
      <div key={t.id} className="toast fade-in" style={{
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
export const Maturity = ({ value, w = 60 }: any) => (
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
