import { Icon } from "../worlddock/components";

const PLANS = [
  { id: "creator", name: "Creator", price: "¥39 / 月", points: "轻量创作点包" },
  { id: "studio", name: "Studio", price: "¥99 / 月", points: "团队前的高频创作点包" },
  { id: "team", name: "Team", price: "联系开通", points: "多人协作与治理能力" },
] as const;

type PricingPageProps = {
  waitlistPendingPlan: typeof PLANS[number]["id"] | null;
  onWaitlist: (plan: typeof PLANS[number]["id"]) => void;
};

export function PricingPage({ waitlistPendingPlan, onWaitlist }: PricingPageProps) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="badge amber" style={{ justifyContent: "flex-start", height: 24 }}>
        Beta 即将开放 · Alpha 不处理真实付款
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {PLANS.map((plan) => (
          <section key={plan.id} className="card" style={{ padding: 14 }}>
            <div className="row gap-2" style={{ justifyContent: "space-between" }}>
              <h3 className="title-font" style={{ margin: 0, fontSize: "var(--t-16)" }}>{plan.name}</h3>
              <span className="badge slate">Beta 即将开放</span>
            </div>
            <div className="mono" style={{ marginTop: 10, fontSize: 18 }}>{plan.price}</div>
            <p className="prose" style={{ fontSize: 13 }}>{plan.points}</p>
            <button className="btn primary" disabled style={{ width: "100%" }}>
              <Icon name="bolt" size={12} />
              <span>支付暂未开放</span>
            </button>
            <button
              className="btn ghost"
              disabled={waitlistPendingPlan !== null}
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => onWaitlist(plan.id)}
            >
              <Icon name="bell" size={12} />
              <span>{waitlistPendingPlan === plan.id ? "登记中" : "加入候补"}</span>
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
