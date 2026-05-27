import type { WorldAssetBrief, WorldAssetCard, WorldContextRef, WorldManifest } from "@worlddock/domain/agent/context";

export type AgentContextItem = WorldAssetCard & {
  keywords?: string[];
  score: number;
};

export function rankAssetCards(input: {
  prompt: string;
  items: AgentContextItem[];
  maxItems: number;
}) {
  const prompt = input.prompt.toLowerCase();
  return [...input.items]
    .map((item) => ({
      ...item,
      score: item.score + (prompt.includes(item.title.toLowerCase()) ? 10 : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, input.maxItems);
}

export function selectInitialWorldContext(input: {
  prompt: string;
  manifest: WorldManifest;
  cards: WorldAssetCard[];
  briefs: WorldAssetBrief[];
  maxCards?: number;
  maxBriefs?: number;
}): WorldContextRef[] {
  const rankedCards = rankAssetCards({
    prompt: input.prompt,
    items: input.cards.map((card) => ({ ...card, score: card.score ?? 0 })),
    maxItems: input.maxCards ?? 8,
  });
  const rankedBriefIds = new Set(rankedCards.slice(0, input.maxBriefs ?? 3).map((card) => card.targetId));

  return [
    {
      level: "manifest",
      kind: "world",
      title: input.manifest.name,
      excerpt: input.manifest.summary,
      targetId: input.manifest.worldId,
      source: "initial",
    },
    ...rankedCards.map((card): WorldContextRef => ({
      level: "card",
      kind: card.kind,
      title: card.title,
      excerpt: card.excerpt,
      targetId: card.targetId,
      source: "initial",
    })),
    ...input.briefs
      .filter((brief) => rankedBriefIds.has(brief.targetId))
      .map((brief): WorldContextRef => ({
        level: "brief",
        kind: brief.kind,
        title: brief.title,
        excerpt: brief.summary,
        targetId: brief.targetId,
        source: "initial",
      })),
  ];
}
