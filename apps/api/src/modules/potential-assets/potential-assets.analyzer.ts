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
}

const HEADING_PATTERN = /^#{2,3}\s+(.+?)\s*$/gm;
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
        const quote = truncate(`${block.title}\n${summary}`, MAX_QUOTE_LENGTH);

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
  const matches = Array.from(content.matchAll(HEADING_PATTERN));

  return matches
    .map((match, index) => {
      const title = match[1]?.trim() ?? "";
      const bodyStart = (match.index ?? 0) + match[0].length;
      const nextMatch = matches[index + 1];
      const bodyEnd = nextMatch?.index ?? content.length;

      return {
        title,
        body: content.slice(bodyStart, bodyEnd).trim(),
      };
    })
    .filter((block) => block.title.length > 0);
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
