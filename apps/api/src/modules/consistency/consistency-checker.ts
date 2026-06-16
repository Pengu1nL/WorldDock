export type ConsistencyAssetInput = {
  assetId: string;
  type: string;
  name: string;
  summary?: string | null;
  markdown?: string | null;
};

export type ConsistencyEvidence = {
  assetId: string;
  quote: string;
  field: "name" | "summary" | "markdown";
};

export type ConsistencyIssue = {
  title: string;
  severity: "normal";
  subjectAssetIds: [string, string];
  keyword: string;
  evidence: [ConsistencyEvidence, ConsistencyEvidence];
};

type AssetIndexEntry = {
  asset: ConsistencyAssetInput;
  keywords: Set<string>;
  restrictiveEvidence: ConsistencyEvidence[];
  permissiveEvidence: ConsistencyEvidence[];
};

const RESTRICTIVE_MARKERS = ["必须", "需要", "只能", "禁止"] as const;
const PERMISSIVE_MARKERS = ["无需", "不需要", "可以不", "例外"] as const;
const CONTRADICTION_MARKERS = [
  ...RESTRICTIVE_MARKERS,
  ...PERMISSIVE_MARKERS,
];

export class ConsistencyChecker {
  check(assets: ConsistencyAssetInput[]): ConsistencyIssue[] {
    const index = assets.map((asset) => this.indexAsset(asset));
    const issues: ConsistencyIssue[] = [];
    const emitted = new Set<string>();

    for (let leftIndex = 0; leftIndex < index.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < index.length; rightIndex += 1) {
        const left = index[leftIndex];
        const right = index[rightIndex];
        const keywords = this.findSharedKeywords(left.keywords, right.keywords);

        for (const keyword of keywords) {
          const evidence = this.findContradictingEvidence(keyword, left, right);

          if (!evidence) {
            continue;
          }

          const issueKey = `${left.asset.assetId}:${right.asset.assetId}:${keyword}`;
          if (emitted.has(issueKey)) {
            continue;
          }

          emitted.add(issueKey);
          issues.push({
            title: `「${keyword}」存在潜在一致性冲突`,
            severity: "normal",
            subjectAssetIds: [left.asset.assetId, right.asset.assetId],
            keyword,
            evidence,
          });
        }
      }
    }

    return issues;
  }

  private indexAsset(asset: ConsistencyAssetInput): AssetIndexEntry {
    const fields = this.assetFields(asset);
    const keywords = new Set<string>();
    const restrictiveEvidence: ConsistencyEvidence[] = [];
    const permissiveEvidence: ConsistencyEvidence[] = [];
    const assetName = asset.name.trim();

    if (assetName) {
      keywords.add(assetName);
    }

    for (const field of fields) {
      for (const keyword of extractKeywords(field.text)) {
        keywords.add(keyword);
      }

      for (const span of splitEvidenceSpans(field.text)) {
        if (containsAny(span, PERMISSIVE_MARKERS)) {
          permissiveEvidence.push({
            assetId: asset.assetId,
            quote: span,
            field: field.field,
          });
          continue;
        }

        if (hasRestrictiveMarker(span)) {
          restrictiveEvidence.push({
            assetId: asset.assetId,
            quote: span,
            field: field.field,
          });
        }
      }
    }

    return {
      asset,
      keywords,
      restrictiveEvidence,
      permissiveEvidence,
    };
  }

  private assetFields(asset: ConsistencyAssetInput): Array<{
    field: ConsistencyEvidence["field"];
    text: string;
  }> {
    const fields: Array<{
      field: ConsistencyEvidence["field"];
      text: string;
    }> = [
      { field: "name", text: asset.name },
      { field: "summary", text: asset.summary ?? "" },
      { field: "markdown", text: asset.markdown ?? "" },
    ];

    return fields.filter((field) => field.text.trim().length > 0);
  }

  private findSharedKeywords(left: Set<string>, right: Set<string>): string[] {
    const shared = [...left].filter((keyword) => right.has(keyword));
    shared.sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-Hans-CN"));

    return shared;
  }

  private findContradictingEvidence(
    keyword: string,
    left: AssetIndexEntry,
    right: AssetIndexEntry,
  ): [ConsistencyEvidence, ConsistencyEvidence] | null {
    const leftRestrictive = this.findEvidenceForKeyword(keyword, left.restrictiveEvidence);
    const leftPermissive = this.findEvidenceForKeyword(keyword, left.permissiveEvidence);
    const rightRestrictive = this.findEvidenceForKeyword(keyword, right.restrictiveEvidence);
    const rightPermissive = this.findEvidenceForKeyword(keyword, right.permissiveEvidence);

    if (leftRestrictive && rightPermissive) {
      return [leftRestrictive, rightPermissive];
    }

    if (leftPermissive && rightRestrictive) {
      return [leftPermissive, rightRestrictive];
    }

    return null;
  }

  private findEvidenceForKeyword(
    keyword: string,
    evidence: ConsistencyEvidence[],
  ): ConsistencyEvidence | undefined {
    return evidence.find((entry) => containsKeyword(entry.quote, keyword));
  }
}

function extractKeywords(text: string): string[] {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  const keywords = new Set<string>();
  const englishTokens = normalizedText.match(/[A-Za-z0-9_]+/g) ?? [];
  for (const token of englishTokens) {
    keywords.add(token.toLowerCase());
  }

  const chineseSegments = normalizedText
    .split(/[^\u3400-\u9fffA-Za-z0-9_]+/u)
    .flatMap((segment) => extractChineseKeywordSegments(segment))
    .map((segment) => segment.trim())
    .filter((segment) => /[\u3400-\u9fff]/u.test(segment));

  for (const segment of chineseSegments) {
    keywords.add(segment);
  }

  return [...keywords].filter((keyword) => keyword.length > 1);
}

function extractChineseKeywordSegments(text: string): string[] {
  const markerPositions = CONTRADICTION_MARKERS.map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  const segment = markerPositions.length === 0 ? text : text.slice(0, markerPositions[0]);

  return createChineseSuffixes(segment);
}

function containsAny(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

function hasRestrictiveMarker(text: string): boolean {
  const textWithoutPermissiveMarkers = PERMISSIVE_MARKERS.reduce(
    (currentText, marker) => currentText.split(marker).join(""),
    text,
  );

  return containsAny(textWithoutPermissiveMarkers, RESTRICTIVE_MARKERS);
}

function createChineseSuffixes(text: string): string[] {
  const normalizedText = text.trim();
  const suffixes: string[] = [];

  for (let index = 0; index < normalizedText.length; index += 1) {
    const suffix = normalizedText.slice(index);
    if (suffix.length >= 4 || suffix.length === normalizedText.length) {
      suffixes.push(suffix);
    }
  }

  return suffixes;
}

function containsKeyword(longerKeyword: string, keyword: string): boolean {
  return longerKeyword !== keyword && longerKeyword.toLowerCase().includes(keyword.toLowerCase());
}

function splitEvidenceSpans(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/u)
    .map((span) => span.trim())
    .filter((span) => span.length > 0);
}
