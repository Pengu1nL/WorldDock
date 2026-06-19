import type { ReactNode } from "react";

import type { AgentSessionMessage } from "@worlddock/contract";

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
        <MarkdownLite text={message.content} />
      </div>
    </article>
  );
}

function MarkdownLite({ text }: { text: string }) {
  if (!text.trim()) return <p style={{ margin: 0, color: "var(--fg-3)" }}>…</p>;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let codeLines: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    nodes.push(
      <p key={`p-${nodes.length}`} style={{ margin: "0 0 10px" }}>
        {paragraph.join(" ")}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    const ListTag = listKind === "ol" ? "ol" : "ul";
    nodes.push(
      <ListTag key={`list-${nodes.length}`} style={{ margin: "4px 0 12px", paddingLeft: 20 }}>
        {listItems.map((item, index) => (
          <li key={`${index}-${item}`} style={{ marginBottom: 4 }}>
            {item}
          </li>
        ))}
      </ListTag>,
    );
    listItems = [];
    listKind = null;
  };

  const flushCode = () => {
    nodes.push(
      <pre
        key={`code-${nodes.length}`}
        style={{
          margin: "8px 0 12px",
          padding: "10px 12px",
          border: "1px solid var(--hairline)",
          borderRadius: 4,
          background: "var(--bg-1)",
          overflowX: "auto",
        }}
      >
        <code className="mono" style={{ fontSize: 12, color: "var(--fg-1)" }}>
          {codeLines.join("\n")}
        </code>
      </pre>,
    );
    codeLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listKind === "ol") flushList();
      listKind = "ul";
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listKind === "ul") flushList();
      listKind = "ol";
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();

  return nodes;
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
