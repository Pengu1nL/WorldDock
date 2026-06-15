export type LineDiffOperation =
  | { type: "context"; text: string; lineFrom: number; lineTo: number }
  | { type: "remove"; text: string; lineFrom: number }
  | { type: "add"; text: string; lineTo: number };

export function createLineDiff(beforeMarkdown: string, afterMarkdown: string): LineDiffOperation[] {
  const beforeLines = splitLines(beforeMarkdown);
  const afterLines = splitLines(afterMarkdown);
  const lengths = buildLcsLengths(beforeLines, afterLines);
  const operations: LineDiffOperation[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      operations.push({
        type: "context",
        text: beforeLines[beforeIndex],
        lineFrom: beforeIndex + 1,
        lineTo: afterIndex + 1,
      });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (lengths[beforeIndex + 1][afterIndex] >= lengths[beforeIndex][afterIndex + 1]) {
      operations.push({
        type: "remove",
        text: beforeLines[beforeIndex],
        lineFrom: beforeIndex + 1,
      });
      beforeIndex += 1;
      continue;
    }

    operations.push({
      type: "add",
      text: afterLines[afterIndex],
      lineTo: afterIndex + 1,
    });
    afterIndex += 1;
  }

  while (beforeIndex < beforeLines.length) {
    operations.push({
      type: "remove",
      text: beforeLines[beforeIndex],
      lineFrom: beforeIndex + 1,
    });
    beforeIndex += 1;
  }

  while (afterIndex < afterLines.length) {
    operations.push({
      type: "add",
      text: afterLines[afterIndex],
      lineTo: afterIndex + 1,
    });
    afterIndex += 1;
  }

  return operations;
}

export function parseLineDiff(diff: string | null | undefined): LineDiffOperation[] | null {
  if (!diff) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(diff) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.flatMap((operation): LineDiffOperation[] => {
    if (!isRecord(operation) || typeof operation.type !== "string" || typeof operation.text !== "string") return [];
    if (operation.type === "context" && typeof operation.lineFrom === "number" && typeof operation.lineTo === "number") {
      return [{ type: "context", text: operation.text, lineFrom: operation.lineFrom, lineTo: operation.lineTo }];
    }
    if (operation.type === "remove" && typeof operation.lineFrom === "number") {
      return [{ type: "remove", text: operation.text, lineFrom: operation.lineFrom }];
    }
    if (operation.type === "add" && typeof operation.lineTo === "number") {
      return [{ type: "add", text: operation.text, lineTo: operation.lineTo }];
    }
    return [];
  });
}

function splitLines(markdown: string) {
  return markdown.split("\n").map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
}

function buildLcsLengths(beforeLines: string[], afterLines: string[]) {
  const lengths = Array.from({ length: beforeLines.length + 1 }, () => Array(afterLines.length + 1).fill(0) as number[]);

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lengths[beforeIndex][afterIndex] = beforeLines[beforeIndex] === afterLines[afterIndex]
        ? lengths[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(lengths[beforeIndex + 1][afterIndex], lengths[beforeIndex][afterIndex + 1]);
    }
  }

  return lengths;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
