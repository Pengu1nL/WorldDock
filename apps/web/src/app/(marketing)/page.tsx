"use client";

import Link from "next/link";
import { PRODUCT_EVENTS, trackProductEvent } from "@/features/analytics/product-events";

export default function MarketingHomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)" }}>
      <section
        style={{
          minHeight: "82vh",
          display: "grid",
          alignItems: "end",
          padding: "min(8vw, 72px)",
          backgroundImage: "linear-gradient(180deg, rgba(17,24,39,0.18), rgba(17,24,39,0.74)), url('https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1800&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div style={{ maxWidth: 760, color: "white" }}>
          <p className="mono" style={{ fontSize: 13, margin: "0 0 12px" }}>WorldDock Cloud Alpha</p>
          <h1 className="title-font" style={{ fontSize: 56, lineHeight: 1.02, margin: 0, letterSpacing: 0 }}>WorldDock Cloud Alpha</h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, maxWidth: 620 }}>
            为世界观创作者提供云端资产库、AI 推演、公开仓库、版本发布和世界包导入导出。
          </p>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <Link className="btn primary" href="/register" onClick={() => trackProductEvent(PRODUCT_EVENTS.signedUp, { source: "marketing_home", intent: "apply_alpha" })}>申请 Alpha</Link>
            <Link className="btn" href="/register?intent=feedback" onClick={() => trackProductEvent(PRODUCT_EVENTS.signedUp, { source: "marketing_home", intent: "feedback" })}>反馈 Alpha 方向</Link>
            <Link className="btn" href="/app">进入工作台</Link>
            <Link className="btn ghost" href="/pricing">查看定价</Link>
          </div>
        </div>
      </section>
      <section style={{ padding: "36px min(8vw, 72px)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {[
          ["云端世界资产", "统一管理设定、故事种子、冲突和发布快照。"],
          ["AI 推演闭环", "Agent 使用上下文引用生成建议，并把高价值内容保存回世界。"],
          ["创作者仓库", "发布、fork、收藏、举报和同步公开世界。"],
        ].map(([title, body]) => (
          <article key={title} className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0, fontSize: "var(--t-18)" }}>{title}</h2>
            <p className="prose" style={{ marginBottom: 0 }}>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
