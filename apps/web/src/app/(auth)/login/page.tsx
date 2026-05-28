"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitting(false);
      setError("邮箱或密码不正确。");
      return;
    }
    const token = payload.token ?? payload.session?.token;
    if (typeof token === "string") {
      window.localStorage.setItem("worlddock.sessionToken", token);
    }
    window.location.href = "/onboarding";
  }

  return (
    <main className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="auth-kicker">WorldDock Alpha</div>
        <h1>登录 WorldDock</h1>
        <label>
          <span>邮箱</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
        </label>
        <label>
          <span>密码</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn primary auth-submit" type="submit" disabled={submitting}>登录</button>
        <Link className="auth-link" href="/register">注册 Alpha 账户</Link>
      </form>
    </main>
  );
}
