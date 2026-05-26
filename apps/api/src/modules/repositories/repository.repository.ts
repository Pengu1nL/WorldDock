import type { ReleaseDiff, ReleaseSnapshot } from "@worlddock/domain";

export const REPOSITORY_REPOSITORY = Symbol("REPOSITORY_REPOSITORY");

export type PublicRepositoryRecord = {
  id: string;
  worldId?: string | null;
  ownerId: string;
  ownerName: string;
  slug: string;
  name: string;
  summary: string;
  tags: string[];
  license: string;
  stars: number;
  forks: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ReleaseRecord = {
  id: string;
  repositoryId: string;
  version: string;
  note: string;
  license: string;
  diff: ReleaseDiff;
  source: "cloud-publish" | "local-push";
  createdAt: Date;
};

export type ReleaseSnapshotRecord = {
  id: string;
  repositoryId: string;
  releaseId: string;
  snapshot: ReleaseSnapshot;
  createdAt: Date;
};

export type ForkRecord = {
  id: string;
  repositoryId: string;
  sourceReleaseId: string;
  targetWorldId: string;
  userId: string;
  licenseSnapshot: string;
  createdAt: Date;
};

export type RepositoryRepository = {
  findById(id: string): Promise<PublicRepositoryRecord | null>;
  findByWorldId(worldId: string): Promise<PublicRepositoryRecord | null>;
  createRepository(input: Omit<PublicRepositoryRecord, "id" | "stars" | "forks" | "createdAt" | "updatedAt">): Promise<PublicRepositoryRecord>;
  updateRepository(id: string, input: Partial<Pick<PublicRepositoryRecord, "name" | "summary" | "tags" | "license">>): Promise<PublicRepositoryRecord | null>;
  listPublic(): Promise<PublicRepositoryRecord[]>;
  findPublicByOwnerSlug(ownerName: string, slug: string): Promise<PublicRepositoryRecord | null>;
  createRelease(input: Omit<ReleaseRecord, "id" | "createdAt">): Promise<ReleaseRecord>;
  listReleases(repositoryId: string): Promise<ReleaseRecord[]>;
  createSnapshot(input: Omit<ReleaseSnapshotRecord, "id" | "createdAt">): Promise<ReleaseSnapshotRecord>;
  findSnapshotByReleaseId(releaseId: string): Promise<ReleaseSnapshotRecord | null>;
  starRepository(repositoryId: string, userId: string): Promise<PublicRepositoryRecord | null>;
  unstarRepository(repositoryId: string, userId: string): Promise<PublicRepositoryRecord | null>;
  createFork(input: Omit<ForkRecord, "id" | "createdAt">): Promise<ForkRecord>;
  listForksForRepository(repositoryId: string): Promise<ForkRecord[]>;
};
