// view-workbench.tsx — The main conversation-first workbench
// Streaming agent, context drawer, right drawer (collapsed by default)

import React, { useState as useStateWB } from "react";
import { Icon } from "./components";

// ────────── Single message bubble ──────────
export const Message = ({ msg, onOpenContext }: any) => {
  if (msg.role === "user") {
    return (
      <div style={{ maxWidth: "var(--max-chat)", margin: "0 auto", padding: "0 24px", marginTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{
            padding: "10px 14px", borderRadius: 6,
            background: "var(--surface-2)", border: "1px solid var(--border)",
            fontSize: "var(--t-14)", color: "var(--fg)", lineHeight: 1.55,
            maxWidth: "75%",
          }}>
            {msg.text}
          </div>
        </div>
      </div>
    );
  }

  // Agent message
  const isStreaming = msg.streaming;
  const showContextLink = !isStreaming && Boolean(msg.contextRefs);

  return (
    <div style={{ maxWidth: "var(--max-chat)", margin: "0 auto", padding: "0 24px", marginTop: 24 }}>
      <div className="row gap-2" style={{ marginBottom: 8, alignItems: "center", flexWrap: "nowrap" }}>
        <span style={{
          width: 22, height: 22, borderRadius: 4, flex: "none",
          background: "var(--surface-2)", border: "1px solid var(--border-2)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-serif)", fontSize: 13, color: "var(--fg)",
        }}>界</span>
        <span style={{ fontSize: "var(--t-12)", color: "var(--fg-1)", whiteSpace: "nowrap" }}>Agent</span>
        {msg.tools && (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)", whiteSpace: "nowrap" }}>
            · {msg.tools.length} tool calls
          </span>
        )}
        <div style={{ flex: 1 }}/>
        {isStreaming && (
          <span className="row gap-2" style={{ fontSize: 11, color: "var(--amber)" }}>
            <span className="dot amber pulse" style={{ width: 5, height: 5, boxShadow: "none" }}/>
            <span className="mono">streaming…</span>
          </span>
        )}
      </div>

      {/* Tool calls — shown above text when present */}
      {msg.tools && (
        <div className="col" style={{ gap: 4, marginBottom: 10 }}>
          {msg.tools.map((t: any) => (
            <div key={t.id} className="row gap-2 mono" style={{
              padding: "4px 8px", border: "1px solid var(--hairline)",
              borderRadius: 3, background: "var(--bg-1)", fontSize: 11,
            }}>
              <Icon name="check" size={10} style={{ color: "var(--sage)" }}/>
              <span style={{ color: "var(--fg-2)" }}>{t.label}</span>
              <span style={{ color: "var(--fg-3)" }}>·</span>
              <span style={{ color: "var(--fg-1)" }}>{t.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="prose" style={{
        fontSize: "var(--t-14)", color: "var(--fg)", lineHeight: 1.7,
        whiteSpace: "normal",
      }}>
        {renderMarkdownish(msg.text)}
        {isStreaming && <span className="caret"/>}
      </div>

      {showContextLink && (
        <button onClick={() => onOpenContext(msg.contextSnapshot)} className="row gap-2" style={{
          marginTop: 12, background: "transparent", border: 0, color: "var(--fg-3)",
          fontSize: "var(--t-12)", cursor: "pointer", padding: 0,
        }}>
          <Icon name="layers" size={11}/>
          <span className="mono">本轮引用了 {msg.contextRefs} 项上下文</span>
          <Icon name="chevron" size={10}/>
        </button>
      )}
    </div>
  );
};

const renderMarkdownish = (text: string) => {
  if (!text) return null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let table: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    nodes.push(
      <p key={`p-${nodes.length}`} style={{ margin: "0 0 10px" }}>
        {renderInlineMarkdown(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    const ListTag = listKind === "ol" ? "ol" : "ul";
    nodes.push(
      <ListTag key={`${ListTag}-${nodes.length}`} style={{ margin: "6px 0 12px", paddingLeft: 18 }}>
        {list.map((item, index) => (
          <li key={`${index}-${item}`} style={{ marginBottom: 4 }}>
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ListTag>,
    );
    list = [];
    listKind = null;
  };

  const flushTable = () => {
    if (table.length === 0) return;
    const rows = table.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, ""))));
    if (rows.length > 0) {
      const [head, ...body] = rows;
      nodes.push(
        <table key={`table-${nodes.length}`} style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 12px", fontSize: 13 }}>
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={`${index}-${cell}`} style={{ textAlign: "left", borderBottom: "1px solid var(--hairline)", padding: "4px 6px", color: "var(--fg-1)" }}>
                  {renderInlineMarkdown(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cellIndex}-${cell}`} style={{ borderBottom: "1px solid var(--hairline)", padding: "4px 6px", color: "var(--fg-1)" }}>
                    {renderInlineMarkdown(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
    }
    table = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBlocks();
      continue;
    }

    const tableRow = parseMarkdownTableRow(trimmed);
    if (tableRow) {
      flushParagraph();
      flushList();
      table.push(tableRow);
      continue;
    }

    flushTable();
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      nodes.push(
        <hr key={`hr-${nodes.length}`} style={{
          border: 0,
          borderTop: "1px solid var(--hairline)",
          margin: "14px 0",
        }} />,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 3);
      const Tag = `h${level}` as "h1" | "h2" | "h3";
      nodes.push(
        <Tag key={`h-${nodes.length}`} style={{
          margin: nodes.length === 0 ? "0 0 10px" : "16px 0 8px",
          fontSize: level === 1 ? "var(--t-18)" : level === 2 ? "var(--t-16)" : "var(--t-14)",
          lineHeight: 1.35,
          color: "var(--fg)",
          fontWeight: 650,
        }}>
          {renderInlineMarkdown(heading[2])}
        </Tag>,
      );
      continue;
    }

    const unorderedListItem = trimmed.match(/^[-*+]\s+(.+)$/);
    if (unorderedListItem) {
      flushParagraph();
      if (listKind === "ol") flushList();
      listKind = "ul";
      list.push(unorderedListItem[1]);
      continue;
    }

    const orderedListItem = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedListItem) {
      flushParagraph();
      if (listKind === "ul") flushList();
      listKind = "ol";
      list.push(orderedListItem[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushBlocks();
  return nodes;
};

const parseMarkdownTableRow = (line: string) => {
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  return line.slice(1, -1).split("|").map((cell) => cell.trim());
};

const renderInlineMarkdown = (text: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--fg)", fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
};

// ────────── Composer ──────────
export const Composer = ({ onSend, busy, onStop, onOpenContext, contextRefs = 0 }: any) => {
  const [val, setVal] = useStateWB("");
  const send = () => {
    if (!val.trim() || busy) return;
    onSend(val);
    setVal("");
  };
  return (
    <div style={{
      position: "sticky", bottom: 0,
      background: "linear-gradient(to bottom, transparent, var(--bg) 30%)",
      padding: "20px 24px 18px",
    }}>
      <div style={{ maxWidth: "var(--max-chat)", margin: "0 auto" }}>
        {/* Input */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border-2)",
          borderRadius: 8,
          padding: "10px 12px 8px",
          transition: "border-color .12s",
        }} onFocus={(e) => e.currentTarget.style.borderColor = "var(--border-3)"}
           onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-2)"}>
          <textarea
            aria-label="继续推演"
            value={val} onChange={(e: any) => setVal(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
            placeholder={busy ? "Agent 正在推演 …" : "继续推演这个设定。⌘ ↵ 发送"}
            disabled={busy}
            style={{
              width: "100%", background: "transparent", border: 0, outline: "none",
              resize: "none", color: "var(--fg)", fontSize: "var(--t-14)", lineHeight: 1.55,
              minHeight: 44, fontFamily: "var(--font-sans)",
            }}
            rows={2}
          />
          <div className="row gap-2" style={{ marginTop: 2 }}>
            <button className="sb-btn" onClick={onOpenContext} title="本轮上下文">
              <Icon name="layers" size={11}/>
              <span>上下文</span>
              <span className="mono sb-dim">{contextRefs || 0}</span>
            </button>
            <div style={{ flex: 1 }}/>
            {busy ? (
              <button className="btn sm" onClick={onStop} style={{ borderColor: "var(--brick-dim)", color: "var(--brick)" }}>
                <Icon name="stop" size={10}/>
                <span>停止</span>
              </button>
            ) : (
              <button className="btn primary sm" onClick={send} disabled={!val.trim()}>
                <span>发送</span>
                <span className="kbd" style={{ background: "rgba(0,0,0,0.15)" }}>⌘↵</span>
              </button>
            )}
          </div>
        </div>

        <div className="row gap-2" style={{ justifyContent: "center", marginTop: 8, fontSize: 11, color: "var(--fg-3)", whiteSpace: "nowrap" }}>
          <span>Agent 会推演并沉淀可保存建议</span>
          <span>·</span>
          <span>不会替你写完正文</span>
        </div>
      </div>
    </div>
  );
};

const ReadField = ({ label, children, mono }: any) => (
  <div>
    <div className="label" style={{ marginBottom: 4 }}>{label}</div>
    <div style={{
      fontSize: 13, color: "var(--fg)", padding: "8px 10px",
      background: "var(--bg-1)", borderRadius: 4, border: "1px solid var(--hairline)",
      fontFamily: mono ? "var(--font-mono)" : undefined,
      lineHeight: 1.6, whiteSpace: "pre-wrap",
    }}>
      {children}
    </div>
  </div>
);

// ────────── Detail drawer content ──────────
export const SuggestionDetail = ({ item, onSave, onClose, onDiscard, onBackToWorkbench, readonly = false, allSavedSeeds = [], allSavedConflicts = [], onJumpToItem }: any) => {
  const [title, setTitle] = useStateWB(item.title);
  const [body, setBody] = useStateWB(item.body || item.summary || "");
  const [hook, setHook] = useStateWB(item.hook || "");

  if (item.kind === "seed") {
    return (
      <div className="col" style={{ gap: 14 }}>
        {readonly && (
          <div className="row gap-2" style={{ marginBottom: -2 }}>
            <span className="badge violet">SEED</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>已归档 · 只读视图</span>
          </div>
        )}
        <div>
          <label className="label">标题</label>
          {readonly
            ? <div style={{ fontSize: "var(--t-16)", fontWeight: 600, fontFamily: "var(--font-serif)", color: "var(--fg)" }}>{title}</div>
            : <input className="input" value={title} onChange={(e: any) => setTitle(e.target.value)}/>}
        </div>
        <div>
          <label className="label">一句话钩子</label>
          {readonly
            ? <div style={{ fontSize: 14, color: "var(--fg-1)", fontStyle: "italic", lineHeight: 1.6 }}>" {hook} "</div>
            : <textarea className="textarea" value={hook} onChange={(e: any) => setHook(e.target.value)} rows={2}/>}
        </div>
        <div className="row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <ReadField label="触发事件">{item.trigger}</ReadField>
          <ReadField label="核心冲突">{item.conflict}</ReadField>
        </div>
        <div>
          <label className="label">潜在主角</label>
          <div style={{ fontSize: 13, color: "var(--fg-1)" }}>{item.protagonists}</div>
        </div>
        <div>
          <label className="label">未解问题</label>
          <ul className="col" style={{ paddingLeft: 16, margin: 0, gap: 6 }}>
            {item.questions.map((q: any, i: number) => (
              <li key={i} style={{ fontSize: 13, color: "var(--fg-1)" }}>{q}</li>
            ))}
          </ul>
        </div>
        {/* Upstream conflict link (readonly seed) */}
        {readonly && item.parentConflict && (() => {
          const parent = allSavedConflicts.find((c: any) => c.id === item.parentConflict);
          if (!parent) return null;
          return (
            <div>
              <div className="label">上游冲突</div>
              <button onClick={() => onJumpToItem && onJumpToItem(parent)} className="card hover"
                style={{
                  width: "100%", textAlign: "left", padding: "10px 12px", cursor: "pointer",
                  borderLeft: "2px solid var(--brick)", display: "flex", alignItems: "center", gap: 10,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row gap-2" style={{ marginBottom: 2 }}>
                    <span className="tag brick" style={{ fontSize: 10 }}>戏剧张力</span>
                  </div>
                  <div className="title-font" style={{ fontSize: "var(--t-13)", fontWeight: 600 }}>{parent.title}</div>
                  <div className="prose" style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 2, lineHeight: 1.5 }}>
                    {parent.summary}
                  </div>
                </div>
                <Icon name="chevron" size={12} style={{ color: "var(--fg-3)", flex: "none" }}/>
              </button>
            </div>
          );
        })()}
        {readonly ? (
          <div className="row gap-2" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <button className="btn ghost" onClick={onClose}>关闭</button>
            <button className="btn" onClick={onBackToWorkbench}>
              <Icon name="spark" size={12}/><span>在工作台中展开这个种子</span>
            </button>
          </div>
        ) : (
          <div className="row gap-2" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <button className="btn ghost danger" onClick={onDiscard}><Icon name="trash" size={11}/><span>丢弃</span></button>
            <div className="row gap-2">
              <button className="btn" onClick={onClose}>暂存</button>
              <button className="btn primary" onClick={() => onSave({ ...item, title, hook })}>
                <Icon name="save" size={12}/>
                <span>保存到种子池</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row gap-2">
        <span className={"tag " + (item.kind === "conflict" ? "brick" : "sage")}>
          {item.category}
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
          {readonly ? "已归档 · v1 · 只读视图" : "来源：Agent"}
        </span>
      </div>
      <div>
        <label className="label">标题</label>
        {readonly
          ? <div className="title-font" style={{ fontSize: "var(--t-18)", fontWeight: 600, color: "var(--fg)" }}>{title}</div>
          : <input className="input" value={title} onChange={(e: any) => setTitle(e.target.value)}/>}
      </div>
      <ReadField label="摘要">{item.summary}</ReadField>
      <div>
        <label className="label">正文 {!readonly && <span className="opt">可修改</span>}</label>
        {readonly
          ? <div style={{
              fontSize: 13, color: "var(--fg)", padding: "10px 12px",
              background: "var(--bg-1)", borderRadius: 4, border: "1px solid var(--hairline)",
              lineHeight: 1.65, whiteSpace: "pre-wrap",
            }}>{body || "（暂无展开正文 — 这条设定还是摘要级别）"}</div>
          : <textarea className="textarea" value={body} onChange={(e: any) => setBody(e.target.value)} rows={10}/>}
      </div>
      {item.relations && (
        <div>
          <label className="label">关联设定</label>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {item.relations.map((r: any) => (
              <span key={r} className="tag" title={readonly ? "点击查看关联条目（占位）" : ""}
                style={readonly ? { cursor: "pointer" } : undefined}>↳ {r}</span>
            ))}
          </div>
        </div>
      )}
      {/* Derived seeds (readonly conflict only) */}
      {readonly && item.kind === "conflict" && (() => {
        const derived = allSavedSeeds.filter((s: any) => s.parentConflict === item.id);
        return (
          <div>
            <div className="row gap-2" style={{ marginBottom: 6 }}>
              <span className="label" style={{ margin: 0 }}>衍生种子</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
                {derived.length} 个已沉淀{item.derivedSeeds ? ` · 上限 ${item.derivedSeeds.length}` : ""}
              </span>
            </div>
            {derived.length === 0 ? (
              <div style={{
                padding: "10px 12px", fontSize: 12, color: "var(--fg-2)",
                background: "var(--bg-1)", border: "1px dashed var(--hairline)", borderRadius: 4, lineHeight: 1.6,
              }}>
                这道张力还没有具体叙事素材。回工作台继续推演，让它孵化第一个。
              </div>
            ) : (
              <div className="col" style={{ gap: 6 }}>
                {derived.map((s: any) => (
                  <button key={s.id} onClick={() => onJumpToItem && onJumpToItem(s)} className="card hover"
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 12px", cursor: "pointer",
                      borderLeft: "2px solid var(--violet)", display: "flex", alignItems: "center", gap: 10,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="title-font" style={{ fontSize: "var(--t-13)", fontWeight: 600 }}>{s.title}</div>
                      <div className="prose" style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 2, lineHeight: 1.5, fontStyle: "italic" }}>
                        " {s.hook} "
                      </div>
                    </div>
                    <Icon name="chevron" size={12} style={{ color: "var(--fg-3)", flex: "none" }}/>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {!readonly && (
        <div>
          <label className="label">保存到</label>
          <select className="input">
            <option>{item.category}</option>
            <option>待定设定</option>
          </select>
        </div>
      )}
      {readonly ? (
        <div className="row gap-2" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <button className="btn ghost" onClick={onClose}>关闭</button>
          <button className="btn" onClick={onBackToWorkbench}>
            <Icon name="spark" size={12}/><span>在工作台中讨论</span>
          </button>
        </div>
      ) : (
        <div className="row gap-2" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <button className="btn ghost danger" onClick={onDiscard}><Icon name="trash" size={11}/><span>丢弃</span></button>
          <div className="row gap-2">
            <button className="btn" onClick={onClose}>标记待定</button>
            <button className="btn primary" onClick={() => onSave({ ...item, title, body })}>
              <Icon name="save" size={12}/>
              <span>保存到档案</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ────────── Context drawer content ──────────
export const ContextDrawer = () => (
  <div className="col" style={{ gap: 14 }}>
    <div className="row gap-2">
      <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>本轮 Agent 引用了下列上下文：</span>
    </div>
    {[
      { type: "世界规则", title: "记忆作为可交易资产", color: "sage" },
      { type: "势力",     title: "记忆银行（MemBank）", color: "sage" },
      { type: "冲突",     title: "记忆是财产还是人格？", color: "brick" },
      { type: "最近变更", title: "新增「情感剥离限制」", color: "amber" },
    ].map((c, i: number) => (
      <div key={i} className="card" style={{ padding: 10 }}>
        <div className="row gap-2" style={{ marginBottom: 4 }}>
          <span className={"tag " + c.color}>{c.type}</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>auto</span>
        </div>
        <div style={{ fontSize: "var(--t-13)", color: "var(--fg)" }}>{c.title}</div>
      </div>
    ))}
    <div className="hr" style={{ margin: "4px 0" }}/>
    <button className="btn ghost"><Icon name="plus" size={12}/><span>手动追加上下文</span></button>
  </div>
);

// ────────── Issues drawer (一致性问题 · 待修矛盾) ──────────
// Each issue can be triaged 3 ways: 修复 / 升格为冲突 / 忽略
export const IssuesDrawer = ({ issues, savedSettings, focusEntryId, onResolve, onPromote, onDiscard, onClose, onJumpToEntry }: any) => {
  const [expandedId, setExpandedId] = useStateWB<string | null>(null);

  // If we opened with a focused entry id, filter to only issues touching it
  const filtered = focusEntryId
    ? issues.filter((i: any) => (i.involves || []).includes(focusEntryId))
    : issues;

  const focusedEntry = focusEntryId ? savedSettings.find((s: any) => s.id === focusEntryId) : null;

  if (issues.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--fg-2)" }}>
        <Icon name="check" size={28} style={{ color: "var(--sage)", opacity: 0.5 }}/>
        <h3 style={{ marginTop: 12, color: "var(--fg-1)", fontSize: "var(--t-15)" }}>
          世界目前没有一致性问题
        </h3>
        <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
          继续推演时，Agent 发现的矛盾会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      {focusedEntry && (
        <div className="row gap-2" style={{
          padding: "8px 10px", background: "var(--amber-bg)",
          border: "1px solid var(--amber-dim)", borderRadius: 4,
          fontSize: 12, color: "var(--amber)",
        }}>
          <Icon name="asterisk" size={11}/>
          <span>聚焦：「{focusedEntry.title}」涉及 {filtered.length} 项问题</span>
          <span style={{ flex: 1 }}/>
          <button className="btn ghost sm" onClick={() => onJumpToEntry && onClose()}
            style={{ height: 20, fontSize: 11, padding: "0 6px" }}>
            查看全部 →
          </button>
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.55, padding: "0 2px" }}>
        每条问题可以三选一：<strong style={{ color: "var(--sage)" }}>修</strong>（去资产库改资产）/
        <strong style={{ color: "var(--brick)" }}> 留为冲突</strong>（沉淀为戏剧张力资产）/
        <strong style={{ color: "var(--fg-2)" }}> 弃</strong>。
      </div>

      <div className="col" style={{ gap: 8 }}>
        {filtered.map((issue: any) => {
          const involved = (issue.involves || [])
            .map((id: any) => savedSettings.find((s: any) => s.id === id))
            .filter(Boolean);
          const involvedUnsaved = (issue.involves || []).length - involved.length;
          const expanded = expandedId === issue.id;
          return (
            <div key={issue.id} className="card" style={{
              padding: 0, borderLeft: `2px solid ${issue.severity === "important" ? "var(--amber)" : "var(--fg-3)"}`,
            }}>
              <button onClick={() => setExpandedId(expanded ? null : issue.id)}
                style={{
                  width: "100%", background: "transparent", border: 0, padding: "12px 14px",
                  textAlign: "left", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10,
                }}>
                <Icon name={expanded ? "chevdown" : "chevron"} size={11}
                  style={{ color: "var(--fg-3)", flex: "none", marginTop: 4 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row gap-2" style={{ marginBottom: 4 }}>
                    <span className={"tag " + (issue.severity === "important" ? "amber" : "")}
                      style={{ fontSize: 10 }}>
                      {issue.severity === "important" ? "重要" : "一般"}
                    </span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
                      ISSUE-{issue.id.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: "var(--t-13)", fontWeight: 500, color: "var(--fg)", marginBottom: expanded ? 6 : 0 }}>
                    {issue.title}
                  </div>
                  {!expanded && (
                    <div className="prose" style={{
                      fontSize: 12, color: "var(--fg-2)", marginTop: 4, lineHeight: 1.5,
                      overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                      WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
                    }}>
                      {issue.description}
                    </div>
                  )}
                </div>
              </button>

              {expanded && (
                <div style={{ padding: "0 14px 12px 35px" }}>
                  <p className="prose" style={{ fontSize: 13, color: "var(--fg-1)", lineHeight: 1.65, marginBottom: 10 }}>
                    {issue.description}
                  </p>
                  <div className="row gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>涉及设定：</span>
                    {involved.length === 0 && involvedUnsaved > 0 && (
                      <span style={{ fontSize: 11, color: "var(--fg-3)", fontStyle: "italic" }}>
                        {involvedUnsaved} 项相关设定尚未保存到档案
                      </span>
                    )}
                    {involved.map((s: any) => (
                      <span key={s.id} onClick={() => onJumpToEntry && onJumpToEntry(s)}
                        className="tag sage" title="点击查看档案条目"
                        style={{ cursor: "pointer" }}>
                        ↳ {s.title}
                      </span>
                    ))}
                    {involved.length > 0 && involvedUnsaved > 0 && (
                      <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
                        · 另 {involvedUnsaved} 项未入档
                      </span>
                    )}
                  </div>
                  <div className="row gap-2">
                    <button className="btn sm" onClick={() => onResolve(issue)}
                      style={{ borderColor: "var(--sage-dim)", color: "var(--sage)", background: "var(--sage-bg)" }}>
                      <Icon name="check" size={11}/><span>标记为修复</span>
                    </button>
                    <button className="btn sm" onClick={() => onPromote(issue)}
                      style={{ borderColor: "var(--brick-dim)", color: "var(--brick)", background: "var(--brick-bg)" }}>
                      <Icon name="conflict" size={11}/><span>升格为冲突</span>
                    </button>
                    <div className="flex"/>
                    <button className="btn ghost sm" onClick={() => onDiscard(issue)}>
                      <Icon name="x" size={11}/><span>忽略</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
