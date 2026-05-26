import type { PublicRepository } from "@worlddock/domain";

export type RepositorySearchDocument = {
  id: string;
  owner: string;
  slug: string;
  name: string;
  summary: string;
  tags: string[];
  license: string;
  stars: number;
  forks: number;
  version: string;
  updatedAt: string;
  searchableText: string;
};

export type SearchIndex = {
  upsert(document: RepositorySearchDocument): Promise<void>;
  delete(id: string): Promise<void>;
  replaceAll?(documents: RepositorySearchDocument[]): Promise<void>;
};

export type SearchOutboxEvent = {
  id: string;
  type: string;
  aggregateId: string;
  payload: unknown;
};

export function mapRepositoryToSearchDocument(repository: PublicRepository): RepositorySearchDocument {
  return {
    id: repository.id,
    owner: repository.owner,
    slug: repository.slug,
    name: repository.name,
    summary: repository.summary,
    tags: repository.tags,
    license: repository.license,
    stars: repository.stars,
    forks: repository.forks,
    version: repository.version,
    updatedAt: repository.updated,
    searchableText: [
      repository.name,
      repository.summary,
      repository.owner,
      repository.slug,
      repository.tags.join(" "),
    ].join(" ").toLowerCase(),
  };
}

export async function processSearchIndexingEvent(
  event: SearchOutboxEvent,
  index: SearchIndex,
  loadRepository: (repositoryId: string) => Promise<PublicRepository | null>,
) {
  if (!event.type.startsWith("repository.")) return "ignored" as const;

  const repository = await loadRepository(event.aggregateId);
  if (!repository) {
    await index.delete(event.aggregateId);
    return "deleted" as const;
  }

  await index.upsert(mapRepositoryToSearchDocument(repository));
  return "upserted" as const;
}

export async function rebuildRepositorySearchIndex(
  repositories: PublicRepository[],
  index: SearchIndex,
) {
  const documents = repositories.map(mapRepositoryToSearchDocument);
  if (index.replaceAll) {
    await index.replaceAll(documents);
    return;
  }

  for (const document of documents) {
    await index.upsert(document);
  }
}
