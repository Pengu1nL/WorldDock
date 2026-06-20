import type { AgentSessionMessage } from "@worlddock/contract";

import { MarkdownLite } from "../worlddock/markdown-lite";
import { Icon } from "../worlddock/components";

type SessionMessageListProps = {
  messages: AgentSessionMessage[];
};

export function SessionMessageList({ messages }: SessionMessageListProps) {
  if (messages.length === 0) {
    return (
      <div style={{ maxWidth: "var(--max-chat)", margin: "0 auto", padding: "42px 24px", color: "var(--fg-3)" }}>
        <div className="row gap-2" style={{ justifyContent: "center", fontSize: "var(--t-13)" }}>
          <Icon name="spark" size={14} />
          <span>还没有消息</span>
        </div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 18, padding: "18px 0 28px" }}>
      {messages.map((message, index) => (
        <SessionMessage key={message.id ?? `${message.role}-${index}`} message={message} />
      ))}
    </div>
  );
}

function SessionMessage({ message }: { message: AgentSessionMessage }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const toolStatus = getToolStatus(message.metadata);
  const failureMessage = getFailureMessage(message);

  if (isUser) {
    return (
      <article style={{ maxWidth: "var(--max-chat)", width: "100%", margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{
              maxWidth: "76%",
              padding: "10px 14px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--surface-2)",
              color: "var(--fg)",
              fontSize: "var(--t-14)",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {message.content}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article style={{ maxWidth: "var(--max-chat)", width: "100%", margin: "0 auto", padding: "0 24px" }}>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            flex: "none",
            background: "var(--surface-2)",
            border: "1px solid var(--border-2)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-serif)",
            fontSize: 13,
            color: "var(--fg)",
          }}
        >
          {isAssistant ? "界" : "i"}
        </span>
        <span style={{ fontSize: "var(--t-12)", color: "var(--fg-1)" }}>
          {isAssistant ? "Agent" : roleLabel(message.role)}
        </span>
        {message.status === "streaming" ? (
          <span className="row gap-2" style={{ color: "var(--amber)", fontSize: 11 }}>
            <span className="dot amber pulse" style={{ width: 5, height: 5, boxShadow: "none" }} />
            <span className="mono">streaming</span>
          </span>
        ) : null}
        {message.status === "failed" ? (
          <span className="row gap-2" style={{ color: "var(--brick)", fontSize: 11 }}>
            <Icon name="consistency" size={12} />
            <span className="mono">failed</span>
          </span>
        ) : null}
      </div>
      <div
        className="prose"
        style={{
          color: "var(--fg)",
          fontSize: "var(--t-14)",
          lineHeight: 1.7,
          overflowWrap: "anywhere",
        }}
      >
        <MarkdownLite text={message.content} emptyFallback="…" />
      </div>
      {toolStatus ? <ToolStatusNotice status={toolStatus} /> : null}
      {failureMessage ? <FailureNotice message={failureMessage} /> : null}
    </article>
  );
}

function ToolStatusNotice({ status }: { status: ToolStatus }) {
  const isRunning = status.state === "running";
  const isFailed = status.state === "failed";
  return (
    <div
      className="row gap-2"
      style={{
        marginTop: 12,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        color: isFailed ? "var(--brick)" : isRunning ? "var(--amber)" : "var(--sage)",
        fontSize: "var(--t-12)",
        width: "fit-content",
      }}
    >
      {isRunning ? (
        <span className="dot amber pulse" style={{ width: 5, height: 5, boxShadow: "none" }} />
      ) : isFailed ? (
        <Icon name="consistency" size={13} />
      ) : (
        <Icon name="check" size={13} />
      )}
      <span>{isRunning ? `正在${status.label}` : isFailed ? `${status.label}失败` : `${status.label}完成`}</span>
    </div>
  );
}

function FailureNotice({ message }: { message: string }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "9px 10px",
        borderRadius: 6,
        border: "1px solid color-mix(in srgb, var(--brick) 42%, var(--border))",
        background: "color-mix(in srgb, var(--brick) 8%, var(--surface))",
        color: "var(--brick)",
        fontSize: "var(--t-12)",
        lineHeight: 1.5,
      }}
    >
      运行失败：{message}
    </div>
  );
}

type ToolStatus = {
  state: "running" | "complete" | "failed";
  label: string;
};

function getToolStatus(metadata: AgentSessionMessage["metadata"]): ToolStatus | null {
  if (!metadata || typeof metadata !== "object") return null;
  const state = metadata.toolStatus;
  if (state !== "running" && state !== "complete" && state !== "failed") return null;
  const label = typeof metadata.toolLabel === "string" && metadata.toolLabel.trim()
    ? metadata.toolLabel.trim()
    : "后台工具";
  return { state, label };
}

function getFailureMessage(message: AgentSessionMessage) {
  if (message.status !== "failed") return null;
  const metadata = message.metadata;
  if (metadata && typeof metadata === "object" && typeof metadata.message === "string" && metadata.message.trim()) {
    return metadata.message.trim();
  }
  return "Agent 调用失败，请稍后重试。";
}

function roleLabel(role: AgentSessionMessage["role"]) {
  const labels: Record<AgentSessionMessage["role"], string> = {
    assistant: "Agent",
    system: "系统",
    tool: "工具",
    user: "用户",
  };
  return labels[role];
}
