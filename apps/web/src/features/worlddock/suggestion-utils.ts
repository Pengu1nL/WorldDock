const DEFAULT_PROPOSAL_IDS = new Set([
  "",
  "pi_setting_proposal",
  "pi_seed_proposal",
  "pi_conflict_proposal",
  "setting_from_model",
]);

export function getSuggestionKey(item: any) {
  const agentSuggestionId = readText(item?.agentSuggestionId);
  if (agentSuggestionId) return agentSuggestionId;

  const id = readText(item?.id);
  if (id && !DEFAULT_PROPOSAL_IDS.has(id)) return id;

  return `${readText(item?.kind, "suggestion")}_${stableHash([
    item?.title,
    item?.summary,
    item?.body,
    item?.hook,
    item?.trigger,
    item?.conflict,
  ].map((part) => readText(part)).join("\n"))}`;
}

export function getSuggestionRenderKey(item: any, index: number) {
  return `${getSuggestionKey(item)}:${index}`;
}

export function normalizeSuggestionForSave(item: any) {
  if (!item || item.kind === "seed") {
    return {
      ...item,
      id: item?.id || getSuggestionKey(item),
    };
  }

  if (item.kind === "setting" || item.kind === "conflict") {
    const body = readText(item.body, item.summary, item.hook, "待整理建议。");
    const summary = summarizeMarkdownishText(readText(item.summary, body), 96);
    return {
      ...item,
      id: DEFAULT_PROPOSAL_IDS.has(readText(item.id)) ? getSuggestionKey(item) : item.id,
      summary,
      body,
    };
  }

  return item;
}

export function getSuggestionPreviewText(item: any) {
  if (item?.kind === "seed") {
    return summarizeMarkdownishText(readText(item.summary, item.hook, item.conflict), 120);
  }
  return summarizeMarkdownishText(readText(item?.summary, item?.body, item?.hook), 120);
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
