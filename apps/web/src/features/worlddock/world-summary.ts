const WORLD_CARD_SUMMARY_MAX_CHARS = 56;
const SUMMARY_LABEL_RE = /^(?:核心设定|核心矛盾|初始灵感|风格关键词|避开的方向)\s*[:：]\s*/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function getWorldCardSummary(summary: unknown) {
  return compactWorldSummary(summary, WORLD_CARD_SUMMARY_MAX_CHARS) || "这个世界还没有概括。";
}

export function getWorldStoredSummary(input: { shortSummary?: string; coreSetting?: string; inspiration: string }) {
  return (
    compactWorldSummary(input.shortSummary, WORLD_CARD_SUMMARY_MAX_CHARS) ||
    compactWorldSummary(input.coreSetting, WORLD_CARD_SUMMARY_MAX_CHARS) ||
    compactWorldSummary(input.inspiration, WORLD_CARD_SUMMARY_MAX_CHARS) ||
    "一个仍在生成中的世界。"
  );
}

export function formatWorldUpdatedDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "--";
  const match = text.match(ISO_DATE_RE);
  if (!match) return text;
  return `${match[1].slice(2)}-${match[2]}-${match[3]}`;
}

function compactWorldSummary(value: unknown, maxChars: number) {
  const cleaned = firstMeaningfulLine(String(value ?? ""));
  if (!cleaned) return "";
  const sentence = cleaned.match(/^(.{1,80}?[。！？!?])/)?.[1] ?? cleaned;
  return truncateChars(sentence, maxChars);
}

function firstMeaningfulLine(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.replace(SUMMARY_LABEL_RE, "").trim())
    .find(Boolean) ?? "";
}

function truncateChars(value: string, maxChars: number) {
  const chars = Array.from(value.trim());
  if (chars.length <= maxChars) return value.trim();
  return `${chars.slice(0, maxChars - 1).join("").replace(/[，,、；;：:\s]+$/, "")}…`;
}
