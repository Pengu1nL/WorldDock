import type { PrismaClient } from "@worlddock/db";
import { licenseSchema, moderationStatusSchema, type PublicRepository } from "@worlddock/domain";
import type { SearchOutboxEvent } from "./search-indexing";

type PrismaOutboxEvent = {
  id: string;
  type: string;
  aggregateId: string;
  payload: unknown;
};

type PrismaRepositoryRecord = {
  id: string;
};

export type RepositorySearchSource = {
  listPending(limit?: number): Promise<SearchOutboxEvent[]>;
  markProcessed(eventId: string, processedAt: Date): Promise<unknown>;
  loadRepository(repositoryId: string): Promise<PublicRepository | null>;
  listRepositories(): Promise<PublicRepository[]>;
};

export function createPrismaRepositorySearchSource(prisma: PrismaClient): RepositorySearchSource {
  async function loadRepository(repositoryId: string): Promise<PublicRepository | null> {
    const repository = await prisma.publicRepository.findUnique({ where: { id: repositoryId } });
    if (!repository) return null;
    if (repository.moderationStatus === "removed") return null;
    const latestRelease = await prisma.repositoryRelease.findFirst({
      where: { repositoryId },
      orderBy: { createdAt: "desc" },
    });
    return {
      id: repository.id,
      owner: repository.ownerName,
      slug: repository.slug,
      name: repository.name,
      summary: repository.summary,
      readme: repository.summary,
      tags: repository.tags,
      stars: repository.stars,
      forks: repository.forks,
      updated: repository.updatedAt.toISOString(),
      version: latestRelease?.version ?? "v0.0.0",
      visibility: "public" as const,
      license: licenseSchema.parse(repository.license),
      moderationStatus: moderationStatusSchema.parse(repository.moderationStatus),
      moderationReason: repository.moderationReason,
      releases: [],
    };
  }

  return {
    async listPending(limit = 100) {
      const events = await prisma.outboxEvent.findMany({
        where: {
          processedAt: null,
          type: { startsWith: "repository." },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return (events as PrismaOutboxEvent[]).map((event) => ({
        id: event.id,
        type: event.type,
        aggregateId: event.aggregateId,
        payload: event.payload,
      }));
    },
    async markProcessed(eventId: string, processedAt: Date) {
      return prisma.outboxEvent.updateMany({
        where: { id: eventId, processedAt: null },
        data: { processedAt },
      });
    },
    loadRepository,
    async listRepositories() {
      const repositories = await prisma.publicRepository.findMany({
        orderBy: { updatedAt: "desc" },
      });
      const loaded = await Promise.all((repositories as PrismaRepositoryRecord[]).map((repository) => loadRepository(repository.id)));
      return loaded.filter((repository): repository is PublicRepository => Boolean(repository));
    },
  };
}
