-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "worlds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "mode" TEXT NOT NULL DEFAULT 'local',
    "maturity" INTEGER NOT NULL DEFAULT 0,
    "coverObjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "worlds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_entries" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "relations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_seeds" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "trigger" TEXT,
    "conflict" TEXT NOT NULL,
    "protagonists" TEXT,
    "questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_seeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflicts" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "related" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "derivedSeeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consistency_issues" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "involves" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "severity" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consistency_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_asset_relations" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "targetAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_asset_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "mode" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "piSessionId" TEXT,
    "tokenUsage" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_events" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_suggestions" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suggestion" JSONB NOT NULL,
    "savedAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_refs" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "targetId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'card',
    "source" TEXT NOT NULL DEFAULT 'initial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_storage_objects" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'local',
    "key" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_connections" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "hubUrl" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hub_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worlds_coverObjectId_idx" ON "worlds"("coverObjectId");

-- CreateIndex
CREATE INDEX "archive_entries_worldId_idx" ON "archive_entries"("worldId");

-- CreateIndex
CREATE INDEX "story_seeds_worldId_idx" ON "story_seeds"("worldId");

-- CreateIndex
CREATE INDEX "conflicts_worldId_idx" ON "conflicts"("worldId");

-- CreateIndex
CREATE INDEX "consistency_issues_worldId_idx" ON "consistency_issues"("worldId");

-- CreateIndex
CREATE INDEX "world_asset_relations_worldId_sourceAssetId_idx" ON "world_asset_relations"("worldId", "sourceAssetId");

-- CreateIndex
CREATE INDEX "world_asset_relations_worldId_targetAssetId_idx" ON "world_asset_relations"("worldId", "targetAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "world_asset_relations_worldId_sourceAssetId_targetAssetId_key" ON "world_asset_relations"("worldId", "sourceAssetId", "targetAssetId");

-- CreateIndex
CREATE INDEX "agent_runs_worldId_idx" ON "agent_runs"("worldId");

-- CreateIndex
CREATE INDEX "agent_runs_piSessionId_idx" ON "agent_runs"("piSessionId");

-- CreateIndex
CREATE INDEX "agent_events_runId_idx" ON "agent_events"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_events_runId_sequence_key" ON "agent_events"("runId", "sequence");

-- CreateIndex
CREATE INDEX "agent_suggestions_runId_idx" ON "agent_suggestions"("runId");

-- CreateIndex
CREATE INDEX "agent_suggestions_worldId_idx" ON "agent_suggestions"("worldId");

-- CreateIndex
CREATE INDEX "context_refs_runId_idx" ON "context_refs"("runId");

-- CreateIndex
CREATE INDEX "context_refs_runId_level_idx" ON "context_refs"("runId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "local_storage_objects_key_key" ON "local_storage_objects"("key");

-- AddForeignKey
ALTER TABLE "archive_entries" ADD CONSTRAINT "archive_entries_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_seeds" ADD CONSTRAINT "story_seeds_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts" ADD CONSTRAINT "conflicts_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consistency_issues" ADD CONSTRAINT "consistency_issues_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_asset_relations" ADD CONSTRAINT "world_asset_relations_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_suggestions" ADD CONSTRAINT "agent_suggestions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_suggestions" ADD CONSTRAINT "agent_suggestions_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_refs" ADD CONSTRAINT "context_refs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

