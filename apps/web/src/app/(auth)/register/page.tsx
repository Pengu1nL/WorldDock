"use client";

import Link from "next/link";
import { useState } from "react";
import { writeStoredSessionToken } from "@/features/worlddock/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const response = await fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitting(false);
      setError(typeof payload.message === "string" ? payload.message : "注册失败。");
      return;
    }
    const token = payload.token ?? payload.session?.token;
    if (typeof token === "string") {
      writeStoredSessionToken(token);
    }
    window.location.href = "/onboarding";
  }

  return (
    <main className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="auth-kicker">WorldDock Alpha</div>
        <h1>注册 WorldDock</h1>
        <label>
          <span>邮箱</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
        </label>
        <label>
          <span>密码</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          <span>显示名称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} type="text" autoComplete="name" required />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn primary auth-submit" type="submit" disabled={submitting}>注册</button>
        <Link className="auth-link" href="/login">已有账户，去登录</Link>
      </form>
    </main>
  );
}
