import { parseWorldDockEnv } from "@worlddock/config";
import { createPrismaClient } from "@worlddock/db";
import { pathToFileURL } from "node:url";
import { configureMeilisearchRepositoryIndex, createMeilisearchSearchIndex } from "./meilisearch-index";
import { createModerationScanQueue, createModerationScanWorker, enqueuePendingModerationScanEvents } from "./moderation-scan";
import { initWorkerObservability } from "./observability";
import { createPrismaRepositorySearchSource } from "./repository-source";
import { rebuildRepositorySearchIndex } from "./search-indexing";
import { createRepositorySearchQueue, createRepositorySearchWorker, enqueuePendingSearchOutboxEvents } from "./search-indexing.queue";

export * from "./meilisearch-index";
export * from "./moderation-scan";
export * from "./observability";
export * from "./repository-source";
export * from "./search-indexing";
export * from "./search-indexing.queue";
export * from "./storage-cleanup";
export * from "./worker-alerts";

async function runSearchWorkerCommand(command: string) {
  initWorkerObservability();
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

  if (command === "enqueue-moderation") {
    const queue = createModerationScanQueue(env.REDIS_URL);
    try {
      const count = await enqueuePendingModerationScanEvents(source, queue);
      console.log(`Enqueued ${count} moderation scan job(s).`);
    } finally {
      await queue.close();
      await prisma.$disconnect();
    }
    return;
  }

  if (command === "work-moderation") {
    createModerationScanWorker({
      redisUrl: env.REDIS_URL,
      source: {
        async loadRepositoryForModeration(repositoryId) {
          const repository = await source.loadRepository(repositoryId);
          return repository ? {
            id: repository.id,
            name: repository.name,
            summary: repository.summary,
            tags: repository.tags,
          } : null;
        },
        async countOpenReports(repositoryId) {
          return prisma.report.count({ where: { repositoryId, status: "open" } });
        },
        async flagRepository(repositoryId, reason) {
          const repository = await prisma.publicRepository.findUnique({ where: { id: repositoryId } });
          if (!repository || repository.moderationStatus === "removed") return;
          const now = new Date();
          const action = await prisma.moderationAction.create({
            data: {
              repositoryId,
              reportId: null,
              moderatorId: null,
              action: "scan_flagged",
              reason,
              previousStatus: repository.moderationStatus,
              nextStatus: "limited",
            },
          });
          await prisma.publicRepository.update({
            where: { id: repositoryId },
            data: { moderationStatus: "limited", moderationReason: reason, moderatedAt: now },
          });
          await prisma.outboxEvent.create({
            data: {
              type: "repository.moderation_limited",
              aggregateId: repositoryId,
              payload: {
                repositoryId,
                actionId: action.id,
                previousStatus: repository.moderationStatus,
                nextStatus: "limited",
                reason,
              },
            },
          });
        },
      },
    });
    console.log("Moderation scan worker started.");
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
