CREATE TABLE "repository_collections" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'saved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_collections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "repository_collections_repositoryId_userId_name_key" ON "repository_collections"("repositoryId", "userId", "name");
CREATE INDEX "repository_collections_userId_createdAt_idx" ON "repository_collections"("userId", "createdAt");
CREATE INDEX "repository_collections_repositoryId_idx" ON "repository_collections"("repositoryId");

ALTER TABLE "repository_collections" ADD CONSTRAINT "repository_collections_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repository_collections" ADD CONSTRAINT "repository_collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
