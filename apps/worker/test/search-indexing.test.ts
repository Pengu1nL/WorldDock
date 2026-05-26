import { describe, expect, it, vi } from "vitest";
import { configureMeilisearchRepositoryIndex, createMeilisearchSearchIndex } from "../src/meilisearch-index";
import { mapRepositoryToSearchDocument, processSearchIndexingEvent, rebuildRepositorySearchIndex } from "../src/search-indexing";
import { enqueuePendingSearchOutboxEvents, SEARCH_INDEX_JOB_NAME } from "../src/search-indexing.queue";

const repository = {
  id: "repo_1",
  owner: "ren",
  slug: "memory-market",
  name: "Memory Market",
  summary: "记忆可以被买卖。",
  tags: ["记忆", "制度"],
  stars: 2,
  forks: 1,
  updated: "2026-05-26T12:00:00.000Z",
  version: "v1.0.0",
  visibility: "public" as const,
  license: "free-fork-attribution" as const,
  releases: [],
};

describe("search indexing processor", () => {
  it("maps public repositories into stable search documents", () => {
    const document = mapRepositoryToSearchDocument(repository);

    expect(document).toMatchObject({
      id: "repo_1",
      slug: "memory-market",
      version: "v1.0.0",
    });
    expect(document.searchableText).toContain("memory market");
  });

  it("upserts repository documents for repository outbox events", async () => {
    const index = { upsert: vi.fn(async () => {}), delete: vi.fn(async () => {}) };

    const result = await processSearchIndexingEvent(
      { id: "out_1", type: "repository.published", aggregateId: "repo_1", payload: {} },
      index,
      async () => repository,
    );

    expect(result).toBe("upserted");
    expect(index.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "repo_1" }));
  });

  it("can rebuild the repository search index", async () => {
    const index = { upsert: vi.fn(async () => {}), delete: vi.fn(async () => {}) };

    await rebuildRepositorySearchIndex([repository], index);

    expect(index.upsert).toHaveBeenCalledTimes(1);
  });

  it("uses replaceAll for full rebuild when the index supports it", async () => {
    const index = { upsert: vi.fn(async () => {}), delete: vi.fn(async () => {}), replaceAll: vi.fn(async () => {}) };

    await rebuildRepositorySearchIndex([repository], index);

    expect(index.replaceAll).toHaveBeenCalledWith([expect.objectContaining({ id: "repo_1" })]);
    expect(index.upsert).not.toHaveBeenCalled();
  });

  it("enqueues pending repository outbox events into BullMQ jobs", async () => {
    const queue = { add: vi.fn(async () => {}) };

    const count = await enqueuePendingSearchOutboxEvents({
      async listPending() {
        return [
          { id: "out_1", type: "repository.published", aggregateId: "repo_1", payload: {} },
          { id: "out_2", type: "billing.settled", aggregateId: "run_1", payload: {} },
        ];
      },
    }, queue);

    expect(count).toBe(1);
    expect(queue.add).toHaveBeenCalledWith(
      SEARCH_INDEX_JOB_NAME,
      { eventId: "out_1", eventType: "repository.published", repositoryId: "repo_1" },
      expect.objectContaining({ jobId: "out_1", attempts: 3 }),
    );
  });

  it("writes Meilisearch upsert, delete, and rebuild requests", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 202 });
    });
    const index = createMeilisearchSearchIndex({
      host: "http://search.local/",
      apiKey: "secret",
      fetch: fetchMock as typeof fetch,
    });

    await index.upsert(mapRepositoryToSearchDocument(repository));
    await index.delete("repo_1");
    await index.replaceAll?.([mapRepositoryToSearchDocument(repository)]);

    expect(requests.map((request) => request.url)).toEqual([
      "http://search.local/indexes/world_repositories/documents?primaryKey=id",
      "http://search.local/indexes/world_repositories/documents/repo_1",
      "http://search.local/indexes/world_repositories/documents",
      "http://search.local/indexes/world_repositories/documents?primaryKey=id",
    ]);
    expect(requests[0]?.init.headers).toMatchObject({ authorization: "Bearer secret" });
  });

  it("configures Meilisearch repository index settings", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 202 });
    });

    await configureMeilisearchRepositoryIndex({
      host: "http://search.local",
      apiKey: "secret",
      fetch: fetchMock as typeof fetch,
    });

    expect(requests[0]?.url).toBe("http://search.local/indexes/world_repositories/settings");
    expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({
      filterableAttributes: ["tags", "license"],
      sortableAttributes: ["stars", "forks", "updatedAt"],
    });
  });
});
