export const REPOSITORY_SEARCH_CLIENT = Symbol("REPOSITORY_SEARCH_CLIENT");

export type RepositorySearchHit = {
  id: string;
};

export type RepositorySearchOptions = {
  tags?: string[];
  sort?: "relevance" | "stars" | "forks" | "updated";
};

export type RepositorySearchClient = {
  search(query: string, options?: RepositorySearchOptions): Promise<RepositorySearchHit[]>;
};

export class MeilisearchRepositorySearchClient implements RepositorySearchClient {
  private readonly host = process.env.MEILISEARCH_HOST ?? "http://localhost:7700";
  private readonly apiKey = process.env.MEILISEARCH_API_KEY;
  private readonly indexName = process.env.MEILISEARCH_REPOSITORY_INDEX ?? "world_repositories";

  async search(query: string, options: RepositorySearchOptions = {}): Promise<RepositorySearchHit[]> {
    const response = await fetch(`${this.host.replace(/\/$/, "")}/indexes/${this.indexName}/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        q: query,
        attributesToRetrieve: ["id"],
        ...(options.tags?.length ? { filter: options.tags.map((tag) => `tags = "${escapeFilterValue(tag)}"`).join(" AND ") } : {}),
        ...(toMeilisearchSort(options.sort).length ? { sort: toMeilisearchSort(options.sort) } : {}),
        limit: 50,
      }),
    });

    if (!response.ok) {
      throw new Error(`Meilisearch search failed with ${response.status}.`);
    }

    const payload = await response.json() as { hits?: Array<{ id?: unknown }> };
    return (payload.hits ?? [])
      .map((hit) => (typeof hit.id === "string" ? { id: hit.id } : null))
      .filter((hit): hit is RepositorySearchHit => Boolean(hit));
  }
}

function toMeilisearchSort(sort: RepositorySearchOptions["sort"]) {
  if (sort === "stars") return ["stars:desc"];
  if (sort === "forks") return ["forks:desc"];
  if (sort === "updated") return ["updatedAt:desc"];
  return [];
}

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
