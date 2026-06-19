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
  rightSlot?: ReactNode;
};

export function SessionPage({
  session,
  subjects,
  messages,
  contextItems,
  runState,
  onSend,
  onStop,
  rightSlot,
}: SessionPageProps) {
  const aside = rightSlot ?? <SessionContextPanel subjects={subjects} contextItems={contextItems} />;

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 320px)",
        background: "var(--bg)",
      }}
    >
      <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
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
            </div>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <SessionMessageList messages={messages} />
        </div>

        <SessionComposer
          busy={runState.status === "running"}
          tokens={runState.tokens}
          onSend={onSend}
          onStop={onStop}
        />
      </main>

      <aside
        style={{
          minWidth: 0,
          minHeight: 0,
          overflow: "auto",
          borderLeft: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "18px 18px 22px",
        }}
      >
        {aside}
      </aside>
    </div>
  );
}

function kindLabel(kind: AgentSession["kind"]) {
  const labels: Record<AgentSession["kind"], string> = {
    asset_edit: "资产编辑",
    consistency_repair: "一致性修复",
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
