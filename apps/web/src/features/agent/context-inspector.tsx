import type { WorldContextRef } from "@worlddock/domain/agent/context";

type ContextInspectorProps = {
  refs: WorldContextRef[];
};

export function ContextInspector({ refs }: ContextInspectorProps) {
  const groups = refs.reduce<Record<string, WorldContextRef[]>>((acc, ref) => {
    acc[ref.level] = [...(acc[ref.level] ?? []), ref];
    return acc;
  }, {});

  return (
    <div className="col gap-3">
      {Object.entries(groups).map(([level, items]) => (
        <section key={level} className="card" style={{ padding: 12 }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 8 }}>{level}</div>
          <div className="col gap-2">
            {items.map((item) => (
              <div key={`${item.level}-${item.targetId}-${item.title}`} className="col gap-1">
                <strong style={{ fontSize: 13 }}>{item.title}</strong>
                <span style={{ fontSize: 12, color: "var(--fg-2)" }}>{item.excerpt}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
