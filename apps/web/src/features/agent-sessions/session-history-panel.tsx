import type { AgentSession } from "@worlddock/contract";
import { useMemo, useState } from "react";

import { Icon } from "../worlddock/components";

type SessionHistoryPanelProps = {
  sessions: AgentSession[];
  activeSessionId?: string | null;
  isLoading?: boolean;
  isCreating?: boolean;
  onCreate?: () => void;
  onOpen: (sessionId: string) => void;
  onArchive: (sessionId: string) => void;
};

export function SessionHistoryPanel({
  sessions,
  activeSessionId,
  isLoading = false,
  isCreating = false,
  onCreate,
  onOpen,
  onArchive,
}: SessionHistoryPanelProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSessions = useMemo(() => {
    if (!normalizedQuery) return sessions;
    return sessions.filter((session) => session.title.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, sessions]);

  return (
    <section className="col gap-3" aria-label="推演历史" style={{ minHeight: 0 }}>
      <header className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div className="row gap-2" style={{ alignItems: "center", minWidth: 0 }}>
          <Icon name="history" size={15} style={{ color: "var(--fg-2)" }} />
          <h2
            className="title-font"
            style={{ margin: 0, color: "var(--fg)", fontSize: "var(--t-14)", fontWeight: 650 }}
          >
            推演历史
          </h2>
        </div>
        <button className="btn sm" type="button" onClick={onCreate} disabled={!onCreate || isCreating}>
          <Icon name="plus" size={12} />
          <span>{isCreating ? "新建中" : "新建推演"}</span>
        </button>
      </header>

      <input
        aria-label="搜索推演历史"
        className="input"
        placeholder="搜索推演"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ height: 32, fontSize: "var(--t-12)" }}
      />

      <div className="col gap-2" role="list" aria-label="推演历史列表" style={{ minHeight: 0 }}>
        {isLoading && visibleSessions.length === 0 ? (
          <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
            载入中
          </span>
        ) : null}
        {!isLoading && visibleSessions.length === 0 ? (
          <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
            暂无推演
          </span>
        ) : null}
        {visibleSessions.map((session) => {
          const selected = session.id === activeSessionId;
          return (
            <div
              className="col gap-2"
              key={session.id}
              role="listitem"
              style={{
                border: selected ? "1px solid var(--slate)" : "1px solid var(--border)",
                background: selected ? "var(--surface-2)" : "transparent",
                borderRadius: 8,
                padding: "10px 10px 9px",
              }}
            >
              <div className="row gap-2" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                <button
                  aria-current={selected ? "true" : undefined}
                  aria-label={`打开 ${session.title}`}
                  className="col"
                  onClick={() => onOpen(session.id)}
                  style={{
                    alignItems: "stretch",
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    flex: 1,
                    gap: 4,
                    minWidth: 0,
                    padding: 0,
                    textAlign: "left",
                  }}
                  type="button"
                >
                  <span
                    style={{
                      color: "var(--fg)",
                      fontSize: "var(--t-13)",
                      fontWeight: selected ? 650 : 560,
                      lineHeight: 1.35,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {session.title}
                  </span>
                  <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
                    {formatUpdatedAt(session.updatedAt)}
                  </span>
                  <span className={session.status === "active" ? "badge sage" : "badge"} style={{ alignSelf: "flex-start" }}>
                    {statusLabel(session.status ?? "active")}
                  </span>
                </button>
                <button
                  aria-label={`归档 ${session.title}`}
                  className="btn ghost sm"
                  onClick={() => onArchive(session.id)}
                  style={{ flex: "none", width: 24, padding: 0 }}
                  type="button"
                >
                  <Icon name="archive" size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return "未更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未更新";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
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
