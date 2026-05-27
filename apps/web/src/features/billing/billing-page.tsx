import type { BillingUsage } from "../worlddock/api";
import { Icon } from "../worlddock/components";
import { PricingPage } from "./pricing-page";

type BillingPageProps = {
  balanceCents: number;
  usage: BillingUsage | null;
  busy: boolean;
  onRefresh: () => void;
  onWaitlist: (plan: "creator" | "studio" | "team") => void;
};

export function BillingPage({ balanceCents, usage, busy, onRefresh, onWaitlist }: BillingPageProps) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="card" style={{ padding: 18 }}>
        <h2 className="title-font" style={{ marginTop: 0 }}>用量与余额</h2>
        <Metric label="当前 Alpha 余额" value={formatCents(usage?.balance.balanceCents ?? balanceCents)} />
        <Metric label="最近一次 Agent Run" value={formatLastAgentRun(usage)} />
        <Metric label="最近账本条目" value={usage ? `${usage.entries.length} 条` : "未同步"} />
        <div className="badge amber" style={{ justifyContent: "flex-start", height: 24 }}>
          余额低于 ¥5.00 时会拦截新的 Agent Run
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn ghost" disabled={busy} onClick={onRefresh}>
            <Icon name="refresh" size={12} /><span>{busy ? "同步中" : "刷新用量"}</span>
          </button>
        </div>
        {usage && usage.entries.length > 0 && (
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {usage.entries.slice(0, 8).map((entry) => (
              <div key={entry.id} className="row gap-2" style={{ justifyContent: "space-between", borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
                <span className="mono">{entry.type}</span>
                <span style={{ color: "var(--fg-2)" }}>{entry.reason ?? "账本记录"}</span>
                <span className="mono">{formatSignedCents(entry.amountCents)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <PricingPage onWaitlist={onWaitlist} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="row gap-2" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function formatCents(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatSignedCents(cents: number) {
  const prefix = cents > 0 ? "+" : "";
  return `${prefix}${formatCents(cents)}`;
}

function formatLastAgentRun(usage: BillingUsage | null) {
  if (!usage?.lastAgentRun) return "暂无真实记录";
  return `${usage.lastAgentRun.tokenUsage.totalTokens} tokens / ${formatCents(usage.lastAgentRun.costCents)}`;
}
