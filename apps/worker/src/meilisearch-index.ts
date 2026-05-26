import type { RepositorySearchDocument, SearchIndex } from "./search-indexing";

export type MeilisearchIndexOptions = {
  host: string;
  apiKey?: string;
  indexName?: string;
  fetch?: typeof fetch;
};

export function createMeilisearchSearchIndex(options: MeilisearchIndexOptions): SearchIndex {
  const baseUrl = options.host.replace(/\/$/, "");
  const indexName = options.indexName ?? "world_repositories";
  const fetchImpl = options.fetch ?? fetch;

  async function request(method: string, path: string, body?: unknown) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Meilisearch ${method} ${path} failed with ${response.status}.`);
    }
  }

  return {
    async upsert(document: RepositorySearchDocument) {
      await request(
        "POST",
        `/indexes/${indexName}/documents?primaryKey=id`,
        [document],
      );
    },
    async delete(id: string) {
      await request("DELETE", `/indexes/${indexName}/documents/${encodeURIComponent(id)}`);
    },
    async replaceAll(documents: RepositorySearchDocument[]) {
      await request("DELETE", `/indexes/${indexName}/documents`);
      if (documents.length > 0) {
        await request(
          "POST",
          `/indexes/${indexName}/documents?primaryKey=id`,
          documents,
        );
      }
    },
  };
}

export async function configureMeilisearchRepositoryIndex(options: MeilisearchIndexOptions) {
  const baseUrl = options.host.replace(/\/$/, "");
  const indexName = options.indexName ?? "world_repositories";
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(`${baseUrl}/indexes/${indexName}/settings`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify({
      searchableAttributes: ["name", "summary", "owner", "slug", "tags", "searchableText"],
      filterableAttributes: ["tags", "license"],
      sortableAttributes: ["stars", "forks", "updatedAt"],
    }),
  });

  if (!response.ok) {
    throw new Error(`Meilisearch PATCH /indexes/${indexName}/settings failed with ${response.status}.`);
  }
}
