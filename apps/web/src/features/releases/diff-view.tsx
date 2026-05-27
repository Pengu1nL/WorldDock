import { Icon } from "../worlddock/components";

export type ReleaseDiffItem = {
  label: string;
  value: number;
  tone?: "slate" | "sage" | "amber";
};

type DiffViewProps = {
  publicItems: string[];
  privateItems: string[];
  diff: ReleaseDiffItem[];
};

export function DiffView({ publicItems, privateItems, diff }: DiffViewProps) {
  return (
    <>
      <section className="card" style={{ padding: 16 }}>
        <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>将公开</h2>
        <div className="col" style={{ gap: 8 }}>
          {publicItems.map((item) => (
            <div key={item} className="row gap-2" style={{ fontSize: 13 }}>
              <Icon name="check" size={12} style={{ color: "var(--sage)" }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 16, borderColor: "var(--amber-dim)" }}>
        <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>不会公开</h2>
        <div className="col" style={{ gap: 8 }}>
          {privateItems.map((item) => (
            <div key={item} className="row gap-2" style={{ fontSize: 13 }}>
              <Icon name="eyeoff" size={12} style={{ color: "var(--amber)" }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>实体级差异预览</h2>
        <div className="col" style={{ gap: 8 }}>
          {diff.map((item) => (
            <div key={item.label} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span>{item.label}</span>
              <span className={`badge ${item.tone ?? "slate"}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
