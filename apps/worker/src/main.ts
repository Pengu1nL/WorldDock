import { parseWorldDockEnv } from "@worlddock/config";
import { createPrismaClient } from "@worlddock/db";
import { pathToFileURL } from "node:url";
import { configureMeilisearchRepositoryIndex, createMeilisearchSearchIndex } from "./meilisearch-index";
import { createPrismaRepositorySearchSource } from "./repository-source";
import { rebuildRepositorySearchIndex } from "./search-indexing";
import { createRepositorySearchQueue, createRepositorySearchWorker, enqueuePendingSearchOutboxEvents } from "./search-indexing.queue";

export * from "./meilisearch-index";
export * from "./repository-source";
export * from "./search-indexing";
export * from "./search-indexing.queue";

async function runSearchWorkerCommand(command: string) {
  const env = parseWorldDockEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const source = createPrismaRepositorySearchSource(prisma);
  const index = createMeilisearchSearchIndex({
    host: env.MEILISEARCH_HOST,
    apiKey: env.MEILISEARCH_API_KEY,
  });

  if (command === "enqueue-search") {
    const queue = createRepositorySearchQueue(env.REDIS_URL);
    try {
      const count = await enqueuePendingSearchOutboxEvents(source, queue);
      console.log(`Enqueued ${count} repository search indexing job(s).`);
    } finally {
      await queue.close();
      await prisma.$disconnect();
    }
    return;
  }

  if (command === "rebuild-search") {
    try {
      await configureMeilisearchRepositoryIndex({
        host: env.MEILISEARCH_HOST,
        apiKey: env.MEILISEARCH_API_KEY,
      });
      await rebuildRepositorySearchIndex(await source.listRepositories(), index);
      console.log("Rebuilt repository search index.");
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  createRepositorySearchWorker({
    redisUrl: env.REDIS_URL,
    index,
    source,
  });
  console.log("Repository search indexing worker started.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSearchWorkerCommand(process.argv[2] ?? "work-search").catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
