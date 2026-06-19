import type { AgentSessionContextItem, AgentSessionSubject } from "@worlddock/contract";

import { Icon } from "../worlddock/components";

export type SessionSubjectView = AgentSessionSubject | {
  id?: string;
  subjectKind?: AgentSessionSubject["kind"];
  subjectId?: string;
  role?: AgentSessionSubject["role"];
  title?: string | null;
};

type SessionContextPanelProps = {
  subjects: SessionSubjectView[];
  contextItems: AgentSessionContextItem[];
};

type ContextItemWithLegacyExcerpt = AgentSessionContextItem & {
  excerpt?: string | null;
};

export function SessionContextPanel({ subjects, contextItems }: SessionContextPanelProps) {
  return (
    <section className="col" aria-label="会话上下文" style={{ gap: 14, minWidth: 0 }}>
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <Icon name="contextpanel" size={14} style={{ color: "var(--fg-2)" }} />
        <h2 style={{ margin: 0, fontSize: "var(--t-13)", fontWeight: 600 }}>上下文</h2>
        <span className="badge slate">{contextItems.length} 项上下文</span>
      </div>

      {subjects.length > 0 ? (
        <div className="col" style={{ gap: 6 }}>
          <div className="label">主体</div>
          {subjects.map((subject, index) => {
            const view = normalizeSubject(subject);

            return (
              <div
                key={subject.id ?? `${view.kind}-${view.targetId}-${index}`}
                className="row gap-2"
                style={{
                  padding: "7px 0",
                  borderBottom: "1px solid var(--hairline)",
                  alignItems: "baseline",
                }}
              >
                <span className="tag">{view.kind}</span>
                <span style={{ minWidth: 0, color: "var(--fg)", fontSize: "var(--t-13)" }}>
                  {view.title ?? view.targetId}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="col" style={{ gap: 8 }}>
        {contextItems.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-3)", fontSize: "var(--t-12)", lineHeight: 1.6 }}>
            暂无上下文。
          </p>
        ) : (
          contextItems.map((item, index) => <ContextItem key={item.id ?? `${item.targetId}-${index}`} item={item} />)
        )}
      </div>
    </section>
  );
}

function normalizeSubject(subject: SessionSubjectView) {
  const backendSubject = subject as Extract<SessionSubjectView, { subjectKind?: AgentSessionSubject["kind"] }>;
  const contractSubject = subject as AgentSessionSubject;

  return {
    kind: contractSubject.kind ?? backendSubject.subjectKind ?? "world",
    targetId: contractSubject.targetId ?? backendSubject.subjectId ?? "",
    title: subject.title,
  };
}

function ContextItem({ item }: { item: ContextItemWithLegacyExcerpt }) {
  const summary = item.summary ?? item.excerpt;

  return (
    <article
      style={{
        padding: "10px 0",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div className="row gap-2" style={{ alignItems: "baseline", marginBottom: 5 }}>
        {item.kind ? <span className="tag">{item.kind}</span> : null}
        <h3 style={{ margin: 0, minWidth: 0, fontSize: "var(--t-13)", fontWeight: 600, color: "var(--fg)" }}>
          {item.title ?? "未命名上下文"}
        </h3>
      </div>
      {summary ? (
        <p style={{ margin: 0, color: "var(--fg-2)", fontSize: "var(--t-12)", lineHeight: 1.55 }}>{summary}</p>
      ) : null}
    </article>
  );
}
