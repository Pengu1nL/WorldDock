import type {
  AgentSession,
  AgentSessionContextItem,
  AgentSessionMessage,
} from "@worlddock/contract";
import type { ReactNode } from "react";

import { Icon } from "../worlddock/components";
import { SessionComposer } from "./session-composer";
import { SessionContextPanel, type SessionSubjectView } from "./session-context-panel";
import { SessionMessageList } from "./session-message-list";

type SessionRunState = {
  status: "idle" | "running" | "completed" | "failed";
  tokens: number;
};

export type SessionPageProps = {
  session: AgentSession;
  subjects: SessionSubjectView[];
  messages: AgentSessionMessage[];
  contextItems: AgentSessionContextItem[];
  runState: SessionRunState;
  onSend: (text: string) => void;
  onStop: () => void;
  onBack?: () => void;
  backLabel?: string;
  rightSlot?: ReactNode | null;
  floatingSlot?: ReactNode;
  potentialAssetCount?: number;
  activePotentialAssetCount?: number;
  onOpenPotentialAssets?: () => void;
};

export function SessionPage({
  session,
  subjects,
  messages,
  contextItems,
  runState,
  onSend,
  onStop,
  onBack,
  backLabel = "返回",
  rightSlot,
  floatingSlot,
  potentialAssetCount = 0,
  activePotentialAssetCount,
  onOpenPotentialAssets,
}: SessionPageProps) {
  const hasAside = rightSlot !== null;
  const aside = rightSlot === undefined ? <SessionContextPanel subjects={subjects} contextItems={contextItems} /> : rightSlot;
  const potentialAssetBadgeText = typeof activePotentialAssetCount === "number" && activePotentialAssetCount !== potentialAssetCount
    ? `${activePotentialAssetCount}/${potentialAssetCount}`
    : String(potentialAssetCount);

  return (
    <div className={`session-layout${hasAside ? "" : " without-aside"}`}>
      <main className="session-main">
        <header
          style={{
            flex: "none",
            padding: "18px 24px 14px",
            borderBottom: "1px solid var(--hairline)",
            background: "var(--surface)",
          }}
        >
          <div style={{ maxWidth: "var(--max-chat)", margin: "0 auto" }}>
            <div className="row gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
              {onBack ? (
                <button className="btn sm" onClick={onBack} type="button">
                  <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
                  <span>{backLabel}</span>
                </button>
              ) : null}
              <Icon name="session" size={18} style={{ color: "var(--fg-2)" }} />
              <h1
                className="title-font"
                style={{
                  margin: 0,
                  minWidth: 0,
                  color: "var(--fg)",
                  fontSize: "var(--t-18)",
                  fontWeight: 650,
                }}
              >
                {session.title}
              </h1>
              <span className="badge slate">{kindLabel(session.kind)}</span>
              <span className={session.status === "active" ? "badge sage" : "badge"}>{statusLabel(session.status)}</span>
              {potentialAssetCount > 0 ? (
                <button
                  aria-label={`潜在资产 ${potentialAssetCount} 项`}
                  className="badge amber"
                  onClick={onOpenPotentialAssets}
                  style={{ cursor: onOpenPotentialAssets ? "pointer" : "default" }}
                  type="button"
                >
                  潜在资产 {potentialAssetBadgeText}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <SessionMessageList messages={messages} onStarterPrompt={onSend} />
        </div>

        <SessionComposer
          busy={runState.status === "running"}
          onSend={onSend}
          onStop={onStop}
        />
      </main>

      {floatingSlot ? (
        <div className="session-floating-layer">
          {floatingSlot}
        </div>
      ) : null}

      {hasAside ? (
        <aside aria-label="推演信息面板" className="session-aside">
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

function kindLabel(kind: AgentSession["kind"]) {
  const labels: Record<AgentSession["kind"], string> = {
    asset_edit: "资产编辑",
    consistency_repair: "一致性修复",
    story_progression: "故事推演",
    world_exploration: "世界推演",
  };
  return labels[kind];
}

function statusLabel(status: AgentSession["status"]) {
  const labels: Record<AgentSession["status"], string> = {
    active: "进行中",
    archived: "已归档",
    cancelled: "已取消",
    completed: "已完成",
  };
  return labels[status];
}
