import type { OfficialWorldAssetType } from "@worlddock/contract/assets";
import type { PotentialAssetEvidence } from "@worlddock/contract/potential-assets";

export interface PotentialAssetAnalyzerMessage {
  id: string;
  role: string;
  content: string;
}

export interface PotentialAssetsAnalyzerInput {
  worldId: string;
  sessionId: string;
  runId?: string | null;
  messages: PotentialAssetAnalyzerMessage[];
}

export interface PotentialAssetAnalyzerResult {
  worldId: string;
  sessionId: string;
  runId?: string | null;
  type: OfficialWorldAssetType;
  title: string;
  summary: string;
  evidence: PotentialAssetEvidence[];
}

interface MarkdownBlock {
  title: string;
  body: string;
  rawText: string;
}

interface FenceState {
  marker: "`" | "~";
  length: number;
}

interface FenceLine {
  marker: "`" | "~";
  length: number;
  rest: string;
}

const HEADING_PATTERN = /^#{2,3}\s+(.+?)\s*$/;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const MAX_SUMMARY_LENGTH = 240;
const MAX_QUOTE_LENGTH = 240;
const CONFIDENCE = 0.62;

export class PotentialAssetsAnalyzer {
  extract(input: PotentialAssetsAnalyzerInput): PotentialAssetAnalyzerResult[] {
    return input.messages.flatMap((message) => {
      if (message.role !== "assistant") {
        return [];
      }

      return parseMarkdownBlocks(message.content).map((block) => {
        const summary = truncate(firstParagraph(block.body) || block.title, MAX_SUMMARY_LENGTH);
        const quote = truncate(normalizeWhitespace(block.rawText), MAX_QUOTE_LENGTH);

        return {
          worldId: input.worldId,
          sessionId: input.sessionId,
          runId: input.runId,
          type: classifyAssetType(`${block.title}\n${summary}`),
          title: block.title,
          summary,
          evidence: [{
            messageId: message.id,
            quote,
            confidence: CONFIDENCE,
          }],
        };
      });
    });
  }
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const headings = findHeadingsOutsideFences(content);

  return headings
    .map((heading, index) => {
      const nextHeading = headings[index + 1];
      const bodyEnd = nextHeading?.start ?? content.length;

      return {
        title: heading.title,
        body: content.slice(heading.end, bodyEnd).trim(),
        rawText: content.slice(heading.start, bodyEnd).trim(),
      };
    })
    .filter((block) => block.title.length > 0);
}

function findHeadingsOutsideFences(content: string): Array<{ title: string; start: number; end: number }> {
  const lines = content.match(/[^\n]*(?:\n|$)/g) ?? [];
  const headings: Array<{ title: string; start: number; end: number }> = [];
  let offset = 0;
  let fence: FenceState | null = null;

  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }

    const lineWithoutBreak = line.replace(/\r?\n$/, "");
    const fenceLine = parseFenceLine(lineWithoutBreak);

    if (fenceLine) {
      if (isClosingFence(fence, fenceLine)) {
        fence = null;
        offset += line.length;
        continue;
      }

      if (fence === null) {
        fence = {
          marker: fenceLine.marker,
          length: fenceLine.length,
        };
      }
    }

    if (fence !== null) {
      offset += line.length;
      continue;
    }

    const headingMatch = lineWithoutBreak.match(HEADING_PATTERN);
    const title = headingMatch?.[1]?.trim();

    if (title) {
      headings.push({
        title,
        start: offset,
        end: offset + line.length,
      });
    }

    offset += line.length;
  }

  return headings;
}

function parseFenceLine(line: string): FenceLine | null {
  const match = line.match(FENCE_PATTERN);
  const markerRun = match?.[1];

  if (!markerRun) {
    return null;
  }

  return {
    marker: markerRun[0] as "`" | "~",
    length: markerRun.length,
    rest: match[2] ?? "",
  };
}

function isClosingFence(fence: FenceState | null, fenceLine: FenceLine): boolean {
  return fence !== null
    && fenceLine.marker === fence.marker
    && fenceLine.length >= fence.length
    && fenceLine.rest.trim().length === 0;
}

function firstParagraph(body: string): string {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return normalizeWhitespace(paragraph ?? "");
}

function classifyAssetType(text: string): OfficialWorldAssetType {
  if (/(组织|势力|机构|联合|公司)/.test(text)) {
    return "organization";
  }

  if (/(地点|城市|区域|港|塔)/.test(text)) {
    return "location";
  }

  if (/(事件|战争|事故|仪式)/.test(text)) {
    return "event";
  }

  if (/(角色|人物|主角|居民)/.test(text)) {
    return "character";
  }

  return "rule";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}
