import { useState } from "react";
import { PRODUCT_EVENTS, trackProductEvent } from "../analytics/product-events";
import { submitSupportFeedback } from "../worlddock/api";

type SupportFeedbackResult = Awaited<ReturnType<typeof submitSupportFeedback>>;

type SupportEntryProps = {
  sessionToken: string;
  context: Record<string, unknown>;
  onSubmitted?: (result: SupportFeedbackResult) => void;
  onToast: (toast: { kind: "save" | "warn" | "info"; text: string }) => void;
};

export function SupportEntry({ sessionToken, context, onSubmitted, onToast }: SupportEntryProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    if (message.trim().length < 6) return;
    setBusy(true);
    try {
      const trimmedMessage = message.trim();
      const result = await submitSupportFeedback({ message: trimmedMessage, context }, { sessionToken });
      trackProductEvent(PRODUCT_EVENTS.alphaFeedbackSubmitted, {
        ...context,
        source: "support_entry",
        messageLength: trimmedMessage.length,
      });
      setMessage("");
      setSubmitted(true);
      onSubmitted?.(result);
      onToast({ kind: "save", text: "反馈已提交" });
    } catch {
      onToast({ kind: "warn", text: "反馈提交失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ padding: 14 }}>
      <h3 className="title-font" style={{ marginTop: 0, fontSize: "var(--t-16)" }}>Alpha 反馈</h3>
      <textarea
        className="input"
        aria-label="Alpha 反馈"
        value={message}
        onChange={(event) => {
          setMessage(event.target.value);
          setSubmitted(false);
        }}
        rows={4}
        style={{ width: "100%", resize: "vertical" }}
      />
      <button className="btn primary" style={{ marginTop: 10 }} disabled={!sessionToken || message.trim().length < 6 || busy} onClick={submit}>
        提交反馈
      </button>
      {submitted ? <p className="prose" style={{ margin: "8px 0 0" }}>Alpha 团队会人工处理这条反馈。</p> : null}
    </section>
  );
}
