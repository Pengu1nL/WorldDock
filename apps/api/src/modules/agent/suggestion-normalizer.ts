import type { WorldSuggestion } from "@worlddock/domain";
import { normalizeSettingCategory } from "../worlds/setting-category";

const DEFAULT_PROPOSAL_IDS = new Set([
  "",
  "pi_setting_proposal",
  "pi_seed_proposal",
  "pi_conflict_proposal",
  "setting_from_model",
]);

const DEFAULT_SETTING_BODY = "待整理设定建议。";
const DEFAULT_CONFLICT_BODY = "待整理冲突建议。";

export function normalizeWorldSuggestion(suggestion: WorldSuggestion): WorldSuggestion {
  if (suggestion.kind === "setting") {
    const body = readText(suggestion.body, suggestion.summary, DEFAULT_SETTING_BODY);
    const summary = summarizeMarkdownishText(readText(suggestion.summary, body), 96);
    const category = normalizeSettingCategory(suggestion.category, suggestion.title, summary, body);
    return {
      ...suggestion,
      id: normalizeSuggestionId(suggestion, [suggestion.title, summary, body]),
      category,
      summary,
      body,
    };
  }

  if (suggestion.kind === "conflict") {
    const body = readText(suggestion.body, suggestion.summary, DEFAULT_CONFLICT_BODY);
    const summary = summarizeMarkdownishText(readText(suggestion.summary, body), 96);
    return {
      ...suggestion,
      id: normalizeSuggestionId(suggestion, [suggestion.title, summary, body]),
      summary,
      body,
    };
  }

  return {
    ...suggestion,
    id: normalizeSuggestionId(suggestion, [
      suggestion.title,
      suggestion.hook,
      suggestion.trigger,
      suggestion.conflict,
    ]),
  };
}

export function summarizeMarkdownishText(value: string, max = 120) {
  const candidates = value
    .split(/\r?\n/)
    .map((line) => {
      const raw = line.trim();
      return {
        raw,
        text: cleanMarkdownLine(raw),
        isHeading: /^#{1,6}\s+/.test(raw),
        isList: /^[-*+]\s+/.test(raw) || /^\d+[.)]\s+/.test(raw),
        isTable: /^\|.*\|$/.test(raw),
      };
    })
    .filter((line) => line.text.length > 0);

  const preferred =
    candidates.find((line) => !line.isHeading && !line.isList && !line.isTable) ??
    candidates.find((line) => !line.isTable) ??
    candidates[0];

  return excerpt(firstSentence(preferred?.text ?? cleanMarkdownLine(value)), max) || "待整理摘要。";
}

function normalizeSuggestionId(suggestion: WorldSuggestion, parts: string[]) {
  const id = String(suggestion.id ?? "").trim();
  if (id && !DEFAULT_PROPOSAL_IDS.has(id)) return id;
  return `${suggestion.kind}_${stableHash(parts.join("\n"))}`;
}

function readText(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function cleanMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  for (let index = 0; index < normalized.length; index += 1) {
    if ("。！？!?".includes(normalized[index])) return normalized.slice(0, index + 1);
  }
  return normalized;
}

function excerpt(text: string, max: number) {
  const normalized = text.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(1, max - 1)).trim()}…`;
}

function stableHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
