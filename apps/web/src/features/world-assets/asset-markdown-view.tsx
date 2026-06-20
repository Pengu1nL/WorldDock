import type { ReactNode } from "react";

type AssetMarkdownViewProps = {
  markdown: string;
  skipFirstHeadingText?: string;
};

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; language?: string; text: string }
  | { type: "hr" }
  | { type: "table"; headers: string[]; rows: string[][] };

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export function AssetMarkdownView({
  markdown,
  skipFirstHeadingText,
}: AssetMarkdownViewProps) {
  const blocks = parseMarkdown(markdown);
  const visibleBlocks = shouldSkipFirstHeading(blocks, skipFirstHeadingText)
    ? blocks.slice(1)
    : blocks;

  if (visibleBlocks.length === 0) {
    return (
      <div className="prose" style={{ color: "var(--fg-3)", fontSize: "var(--t-13)" }}>
        暂无文档内容。
      </div>
    );
  }

  return (
    <div
      className="prose"
      style={{
        color: "var(--fg-1)",
        fontSize: "var(--t-14)",
        lineHeight: 1.72,
      }}
    >
      {visibleBlocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
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

      while (index < lines.length && !lines[index]?.trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence[1], text: codeLines.join("\n") });
      continue;
    }

    if (isThematicBreak(trimmed)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (isBlockquote(trimmed)) {
      const quoteLines: string[] = [];

      while (index < lines.length && isBlockquote((lines[index] ?? "").trim())) {
        quoteLines.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];

      tableLines.push(lines[index] ?? "");
      index += 2;

      while (index < lines.length && isPipeRow(lines[index] ?? "")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }

      const [headerLine, ...rowLines] = tableLines;
      blocks.push({
        type: "table",
        headers: parseTableCells(headerLine ?? ""),
        rows: rowLines.map(parseTableCells),
      });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    const list = getListItem(trimmed);
    if (list) {
      const items: string[] = [];

      while (index < lines.length) {
        const next = getListItem((lines[index] ?? "").trim());
        if (!next || next.ordered !== list.ordered) break;
        items.push(next.text);
        index += 1;
      }

      blocks.push({ type: "list", ordered: list.ordered, items });
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

function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.type === "heading") {
    const Tag = getHeadingTag(block.level);
    const marginTop = index === 0 ? 0 : block.level === 1 ? 28 : 22;

    return (
      <Tag
        key={`heading-${index}`}
        style={{
          color: "var(--fg)",
          fontSize: getHeadingSize(block.level),
          fontWeight: 650,
          lineHeight: 1.25,
          margin: `${marginTop}px 0 10px`,
        }}
      >
        {renderInlineMarkdown(block.text, `heading-${index}`)}
      </Tag>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={`paragraph-${index}`} style={{ margin: index === 0 ? 0 : "0 0 12px" }}>
        {renderInlineMarkdown(block.text, `paragraph-${index}`)}
      </p>
    );
  }

  if (block.type === "blockquote") {
    return (
      <blockquote
        key={`blockquote-${index}`}
        style={{
          background: "var(--surface-2)",
          borderLeft: "3px solid var(--accent)",
          color: "var(--fg-1)",
          margin: "0 0 16px",
          padding: "9px 12px",
        }}
      >
        {renderInlineMarkdown(block.text, `blockquote-${index}`)}
      </blockquote>
    );
  }

  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";

    return (
      <Tag
        key={`list-${index}`}
        style={{
          margin: "0 0 14px",
          paddingLeft: 22,
        }}
      >
        {block.items.map((item, itemIndex) => (
          <li key={`${item}-${itemIndex}`} style={{ marginBottom: 4 }}>
            {renderInlineMarkdown(item, `list-${index}-${itemIndex}`)}
          </li>
        ))}
      </Tag>
    );
  }

  if (block.type === "hr") {
    return (
      <hr
        key={`hr-${index}`}
        style={{
          border: 0,
          borderTop: "1px solid var(--hairline)",
          margin: "22px 0",
        }}
      />
    );
  }

  if (block.type === "code") {
    return (
      <pre
        key={`code-${index}`}
        className="mono"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--hairline)",
          borderRadius: 6,
          color: "var(--fg)",
          fontSize: 12,
          lineHeight: 1.6,
          margin: "0 0 16px",
          overflowX: "auto",
          padding: 12,
        }}
      >
        {block.language ? (
          <span style={{ color: "var(--fg-3)", display: "block", marginBottom: 8 }}>
            {block.language}
          </span>
        ) : null}
        <code>{block.text}</code>
      </pre>
    );
  }

  return (
    <div key={`table-${index}`} style={{ margin: "0 0 16px", overflowX: "auto" }}>
      <table
        style={{
          borderCollapse: "collapse",
          fontSize: "var(--t-12)",
          minWidth: "100%",
        }}
      >
        <thead>
          <tr>
            {block.headers.map((header, headerIndex) => (
              <th
                key={`${header}-${headerIndex}`}
                style={{
                  borderBottom: "1px solid var(--border-2)",
                  color: "var(--fg)",
                  fontWeight: 650,
                  padding: "7px 8px",
                  textAlign: "left",
                }}
              >
                {renderInlineMarkdown(header, `table-${index}-header-${headerIndex}`)}
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
                    padding: "7px 8px",
                    verticalAlign: "top",
                  }}
                >
                  {renderInlineMarkdown(row[cellIndex] ?? "", `table-${index}-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shouldSkipFirstHeading(blocks: MarkdownBlock[], skipFirstHeadingText?: string) {
  if (!skipFirstHeadingText) return false;
  const first = blocks[0];
  if (!first || first.type !== "heading" || first.level !== 1) return false;
  return normalizeText(first.text) === normalizeText(skipFirstHeadingText);
}

function getHeadingSize(level: number) {
  if (level === 1) return "var(--t-22)";
  if (level === 2) return "var(--t-18)";
  if (level === 3) return "var(--t-15)";
  return "var(--t-13)";
}

function getHeadingTag(level: number) {
  return HEADING_TAGS[Math.min(Math.max(level, 1), HEADING_TAGS.length) - 1];
}

function isBlockStart(lines: string[], index: number) {
  const trimmed = (lines[index] ?? "").trim();
  return Boolean(
    trimmed.match(/^#{1,6}\s+/)
      || trimmed.match(/^```/)
      || isThematicBreak(trimmed)
      || isBlockquote(trimmed)
      || getListItem(trimmed)
      || isTableStart(lines, index),
  );
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*.+?\*\*|__.+?__)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="mono" style={{ fontSize: "0.95em" }}>
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <strong key={key} style={{ color: "var(--fg)", fontWeight: 700 }}>
          {token.slice(2, -2)}
        </strong>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? nodes : text;
}

function getListItem(trimmed: string) {
  const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
  if (unordered) return { ordered: false, text: unordered[1].trim() };

  const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
  if (ordered) return { ordered: true, text: ordered[1].trim() };

  return null;
}

function isBlockquote(trimmed: string) {
  return trimmed.startsWith(">");
}

function isThematicBreak(trimmed: string) {
  return /^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed);
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

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}
