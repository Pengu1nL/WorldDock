"use client";

import { useMemo, useState } from "react";
import { completeOnboarding } from "../account/account-api";
import { readStoredSessionToken } from "../worlddock/api";

export const ONBOARDING_STEPS = [
  { id: "goal", title: "选择创作目标", options: ["小说世界观", "游戏设定", "TRPG 战役", "影视宇宙"] },
  { id: "tone", title: "选择推演风格", options: ["严肃史诗", "悬疑奇想", "轻喜剧", "黑色寓言"] },
  { id: "first-world", title: "创建第一个世界", options: ["从空白世界开始"] },
] as const;

export function OnboardingFlow() {
  const [stepIndex, setStepIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const step = ONBOARDING_STEPS[stepIndex];
  const selected = selections[step.id];
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;
  const progress = useMemo(() => `${stepIndex + 1} / ${ONBOARDING_STEPS.length}`, [stepIndex]);

  async function submit() {
    if (!selected) return;
    if (!isLast) {
      setStepIndex((value) => value + 1);
      return;
    }

    const token = readStoredSessionToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await completeOnboarding(token);
      window.location.href = "/app";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "首次体验保存失败。");
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel onboarding-panel">
        <div className="auth-kicker">WorldDock Alpha · {progress}</div>
        <h1>{step.title}</h1>
        <div className="onboarding-options">
          {step.options.map((option) => (
            <button
              className={selected === option ? "option-button selected" : "option-button"}
              key={option}
              type="button"
              onClick={() => setSelections((current) => ({ ...current, [step.id]: option }))}
            >
              {option}
            </button>
          ))}
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="auth-actions">
          {stepIndex > 0 && (
            <button className="btn ghost" type="button" onClick={() => setStepIndex((value) => value - 1)}>
              上一步
            </button>
          )}
          <button className="btn primary" type="button" disabled={!selected || submitting} onClick={submit}>
            {isLast ? "进入 WorldDock" : "下一步"}
          </button>
        </div>
      </section>
    </main>
  );
}
