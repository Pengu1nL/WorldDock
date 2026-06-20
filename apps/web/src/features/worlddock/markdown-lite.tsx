import type { ReactNode } from "react";

type MarkdownLiteProps = {
  text: string;
  emptyFallback?: ReactNode;
};

type MarkdownBlock =
  | { type: "blockquote"; lines: string[] }
  | { type: "code"; language?: string; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "hr" }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export function MarkdownLite({ text, emptyFallback = null }: MarkdownLiteProps) {
  if (!text.trim()) {
    if (emptyFallback === null || emptyFallback === undefined) return null;
    return <p style={{ margin: 0, color: "var(--fg-3)" }}>{emptyFallback}</p>;
  }

  return <>{parseMarkdown(text).map(renderBlock)}</>;
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence[1], text: codeLines.join("\n") });
      continue;
    }

    if (isTableStart(lines, index)) {
      const headerLine = lines[index] ?? "";
      const rowLines: string[] = [];
      index += 2;

      while (index < lines.length && isPipeRow(lines[index] ?? "")) {
        rowLines.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push({
        type: "table",
        headers: parseTableCells(headerLine),
        rows: rowLines.map(parseTableCells),
      });
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length) {
        const quoteLine = (lines[index] ?? "").trim();
        if (!quoteLine.startsWith(">")) break;
        quoteLines.push(quoteLine.replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    const firstListItem = getListItem(trimmed);
    if (firstListItem) {
      const items: string[] = [];

      while (index < lines.length) {
        const next = getListItem((lines[index] ?? "").trim());
        if (!next || next.ordered !== firstListItem.ordered) break;
        items.push(next.text);
        index += 1;
      }

      blocks.push({ type: "list", ordered: firstListItem.ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const nextLine = lines[index] ?? "";
      const nextTrimmed = nextLine.trim();

      if (!nextTrimmed) break;
      if (paragraphLines.length > 0 && isBlockStart(lines, index)) break;

      paragraphLines.push(nextTrimmed);
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderBlock(block: MarkdownBlock, index: number) {
  if (block.type === "heading") {
    const Tag = HEADING_TAGS[Math.min(Math.max(block.level, 1), HEADING_TAGS.length) - 1];
    const marginTop = index === 0 ? 0 : block.level <= 2 ? 16 : 12;

    return (
      <Tag
        key={`heading-${index}`}
        style={{
          color: "var(--fg)",
          fontSize: getHeadingSize(block.level),
          fontWeight: 650,
          lineHeight: 1.35,
          margin: `${marginTop}px 0 8px`,
        }}
      >
        {renderInlineMarkdown(block.text)}
      </Tag>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={`paragraph-${index}`} style={{ margin: index === 0 ? 0 : "0 0 10px" }}>
        {renderInlineMarkdown(block.text)}
      </p>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";

    return (
      <ListTag key={`list-${index}`} style={{ margin: "4px 0 12px", paddingLeft: 20 }}>
        {block.items.map((item, itemIndex) => (
          <li key={`${itemIndex}-${item}`} style={{ marginBottom: 4 }}>
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "code") {
    return (
      <pre
        key={`code-${index}`}
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--hairline)",
          borderRadius: 4,
          margin: "8px 0 12px",
          overflowX: "auto",
          padding: "10px 12px",
        }}
      >
        {block.language ? (
          <span className="mono" style={{ color: "var(--fg-3)", display: "block", fontSize: 11, marginBottom: 6 }}>
            {block.language}
          </span>
        ) : null}
        <code className="mono" style={{ color: "var(--fg-1)", fontSize: 12, lineHeight: 1.6 }}>
          {block.text}
        </code>
      </pre>
    );
  }

  if (block.type === "blockquote") {
    return (
      <blockquote
        key={`quote-${index}`}
        style={{
          borderLeft: "2px solid var(--border-2)",
          color: "var(--fg-2)",
          margin: "6px 0 12px",
          paddingLeft: 12,
        }}
      >
        {block.lines.map((line, lineIndex) => (
          <p key={`${lineIndex}-${line}`} style={{ margin: lineIndex === 0 ? 0 : "6px 0 0" }}>
            {renderInlineMarkdown(line)}
          </p>
        ))}
      </blockquote>
    );
  }

  if (block.type === "table") {
    return (
      <div key={`table-${index}`} style={{ margin: "8px 0 12px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "var(--t-12)", minWidth: "100%" }}>
          <thead>
            <tr>
              {block.headers.map((header, headerIndex) => (
                <th
                  key={`${headerIndex}-${header}`}
                  style={{
                    borderBottom: "1px solid var(--border-2)",
                    color: "var(--fg)",
                    fontWeight: 650,
                    padding: "6px 8px",
                    textAlign: "left",
                  }}
                >
                  {renderInlineMarkdown(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {block.headers.map((_, cellIndex) => (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    style={{
                      borderBottom: "1px solid var(--hairline)",
                      color: "var(--fg-1)",
                      padding: "6px 8px",
                      verticalAlign: "top",
                    }}
                  >
                    {renderInlineMarkdown(row[cellIndex] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <hr
      key={`hr-${index}`}
      style={{
        border: 0,
        borderTop: "1px solid var(--hairline)",
        margin: "14px 0",
      }}
    />
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+?\*\*|__[^_]+?__|\[[^\]\n]+?\]\([^)]+?\)|\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)/g;
  let lastIndex = 0;
  let tokenIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    nodes.push(renderInlineToken(token, tokenIndex));
    tokenIndex += 1;
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderInlineToken(token: string, index: number): ReactNode {
  if (token.startsWith("`") && token.endsWith("`")) {
    return (
      <code
        key={`code-${index}`}
        className="mono"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--hairline)",
          borderRadius: 4,
          color: "var(--fg)",
          fontSize: "0.92em",
          padding: "1px 4px",
        }}
      >
        {token.slice(1, -1)}
      </code>
    );
  }

  if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
    return (
      <strong key={`strong-${index}`} style={{ color: "var(--fg)", fontWeight: 650 }}>
        {renderInlineMarkdown(token.slice(2, -2))}
      </strong>
    );
  }

  const link = token.match(/^\[([^\]\n]+?)\]\(([^)]+?)\)$/);
  if (link) {
    const href = link[2].trim();
    if (!isSafeHref(href)) return token;

    return (
      <a
        key={`link-${index}`}
        href={href}
        rel={isExternalHref(href) ? "noreferrer" : undefined}
        style={{ color: "var(--slate)", textDecoration: "underline", textUnderlineOffset: 2 }}
        target={isExternalHref(href) ? "_blank" : undefined}
      >
        {renderInlineMarkdown(link[1])}
      </a>
    );
  }

  if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
    return (
      <em key={`em-${index}`} style={{ color: "var(--fg-1)" }}>
        {renderInlineMarkdown(token.slice(1, -1))}
      </em>
    );
  }

  return token;
}

function isBlockStart(lines: string[], index: number) {
  const trimmed = (lines[index] ?? "").trim();
  return Boolean(
    trimmed.match(/^```/)
      || trimmed.match(/^#{1,6}\s+/)
      || trimmed.match(/^(?:-{3,}|\*{3,}|_{3,})$/)
      || trimmed.startsWith(">")
      || getListItem(trimmed)
      || isTableStart(lines, index),
  );
}

function getListItem(trimmed: string) {
  const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
  if (unordered) return { ordered: false, text: unordered[1].trim() };

  const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
  if (ordered) return { ordered: true, text: ordered[1].trim() };

  return null;
}

function isTableStart(lines: string[], index: number) {
  const current = lines[index] ?? "";
  const separator = (lines[index + 1] ?? "").trim();
  return isPipeRow(current) && isTableSeparator(separator);
}

function isPipeRow(line: string) {
  return line.includes("|") && parseTableCells(line).length > 1;
}

function isTableSeparator(line: string) {
  if (!line.includes("|")) return false;
  const cells = parseTableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function getHeadingSize(level: number) {
  if (level === 1) return "var(--t-18)";
  if (level === 2) return "var(--t-16)";
  if (level === 3) return "var(--t-14)";
  return "var(--t-13)";
}

function isSafeHref(href: string) {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href);
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}
