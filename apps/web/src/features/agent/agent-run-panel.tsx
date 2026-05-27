import type { ReactNode } from "react";

type AgentRunPanelProps = {
  status: "idle" | "running" | "completed" | "failed";
  tokens?: number;
  children?: ReactNode;
};

export function AgentRunPanel({ status, tokens = 0, children }: AgentRunPanelProps) {
  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2">
        <span className={`dot ${status === "running" ? "sage pulse" : status === "failed" ? "amber" : "slate"}`} />
        <span className="mono" style={{ fontSize: 12 }}>agent.{status}</span>
        <span className="mono" style={{ marginLeft: "auto", color: "var(--fg-3)", fontSize: 11 }}>{tokens} tk</span>
      </div>
      {children}
    </section>
  );
}
