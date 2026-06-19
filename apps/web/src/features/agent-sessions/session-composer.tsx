import { useState } from "react";

import { Icon } from "../worlddock/components";

type SessionComposerProps = {
  busy: boolean;
  tokens: number;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function SessionComposer({ busy, tokens, onSend, onStop }: SessionComposerProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const canSend = text.trim().length > 0 && !busy;

  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        flex: "none",
        padding: "18px 24px",
        background: "linear-gradient(to bottom, transparent, var(--bg) 28%)",
      }}
    >
      <div style={{ maxWidth: "var(--max-chat)", margin: "0 auto" }}>
        <div
          style={{
            border: `1px solid ${focused ? "var(--border-3)" : "var(--border-2)"}`,
            borderRadius: 8,
            background: "var(--surface)",
            boxShadow: focused ? "0 0 0 3px color-mix(in srgb, var(--amber) 18%, transparent)" : "none",
            padding: "10px 12px 8px",
          }}
        >
          <textarea
            aria-label="继续推演"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                send();
              }
            }}
            placeholder={busy ? "Agent 正在推演 …" : "继续推演"}
            disabled={busy}
            rows={2}
            style={{
              width: "100%",
              minHeight: 44,
              resize: "none",
              border: 0,
              outline: "none",
              background: "transparent",
              color: "var(--fg)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--t-14)",
              lineHeight: 1.55,
            }}
          />
          <div className="row gap-2" style={{ marginTop: 4, alignItems: "center" }}>
            <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
              {tokens} tk
            </span>
            <div style={{ flex: 1 }} />
            {busy ? (
              <button className="btn sm" type="button" onClick={onStop} style={{ color: "var(--brick)" }}>
                <Icon name="stop" size={11} />
                <span>停止</span>
              </button>
            ) : (
              <button className="btn primary sm" type="button" onClick={send} disabled={!canSend}>
                <Icon name="send" size={11} />
                <span>发送</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
