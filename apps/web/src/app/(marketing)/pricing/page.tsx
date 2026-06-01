"use client";

import Link from "next/link";
import { PRODUCT_EVENTS, trackProductEvent } from "@/features/analytics/product-events";

const PLANS = [
  {
    id: "creator",
    name: "Creator Alpha",
    price: "免费试用",
    description: "包含云端工作台、公开仓库和 Alpha 免费额度。",
  },
  {
    id: "studio",
    name: "Studio Beta",
    price: "Beta 后开放",
    description: "团队协作、模板库和高级治理会在 Beta 进入计划。",
  },
  {
    id: "team",
    name: "Team Beta",
    price: "Beta 后开放",
    description: "团队协作、模板库和高级治理会在 Beta 进入计划。",
  },
] as const;

export default function PricingPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", padding: "56px min(8vw, 72px)" }}>
      <div style={{ maxWidth: 760 }}>
        <p className="mono" style={{ color: "var(--slate)" }}>Pricing</p>
        <h1 className="title-font" style={{ fontSize: 44, margin: "0 0 12px", letterSpacing: 0 }}>Alpha 免费试用 / Beta 后开放付费</h1>
        <p className="prose" style={{ fontSize: 17 }}>Alpha 阶段不提供 Stripe 结账、客户门户或付费套餐映射。Beta 会在稳定后开放付费计划。</p>
      </div>
      <section style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {PLANS.map((plan) => (
          <article key={plan.id} className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0, fontSize: "var(--t-18)" }}>{plan.name}</h2>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{plan.price}</div>
            <p className="prose">{plan.description}</p>
            <button className="btn primary" onClick={() => trackProductEvent(PRODUCT_EVENTS.billingPlaceholderClicked, { plan: plan.id, source: "marketing_pricing" })}>加入候补</button>
          </article>
        ))}
      </section>
      <div style={{ marginTop: 24 }}>
        <Link className="btn ghost" href="/">返回首页</Link>
      </div>
    </main>
  );
}
