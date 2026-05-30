import type { AgentContextRef } from "../worlddock/api";

const LEVEL_ORDER = ["manifest", "card", "brief", "detail", "source_fragment", "release_delta"];

type ContextInspectorProps = {
  refs: AgentContextRef[];
};

export function ContextInspector({ refs }: ContextInspectorProps) {
  if (refs.length === 0) {
    return (
      <section className="card" style={{ padding: 12 }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>本轮暂无上下文事件</span>
      </section>
    );
  }

  const groups = refs.reduce<Record<string, AgentContextRef[]>>((acc, ref) => {
    acc[ref.level] = [...(acc[ref.level] ?? []), ref];
    return acc;
  }, {});

  return (
    <div className="col gap-3">
      {LEVEL_ORDER.filter((level) => groups[level]?.length).map((level) => (
        <section key={level} className="card" style={{ padding: 12 }}>
          <div className="row gap-2" style={{ marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{level}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: "auto" }}>{groups[level].length}</span>
          </div>
          <div className="col gap-2">
            {groups[level].map((item, index) => (
              <div key={`${item.level}-${item.targetId ?? "world"}-${item.title}-${index}`} className="col gap-1">
                <div className="row gap-2">
                  <strong style={{ fontSize: 13 }}>{item.title}</strong>
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>{item.source}</span>
                </div>
                <span style={{ fontSize: 12, color: "var(--fg-2)" }}>{item.excerpt}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
