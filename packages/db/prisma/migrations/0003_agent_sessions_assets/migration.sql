-- AlterTable
ALTER TABLE "consistency_issues" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "consistency_issues" ADD COLUMN "subjectAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "consistency_issues" ADD COLUMN "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "consistency_issues" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "consistency_issues" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_session_subjects" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'primary',
    "title" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_session_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_session_context_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_session_context_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_session_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'complete',
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_session_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "potential_assets" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "runId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'active',
    "promotedAssetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "potential_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_world_assets" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "official_world_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_world_asset_revisions" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "markdown" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_world_asset_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_world_asset_indexes" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_world_asset_indexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_asset_patch_batches" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "issueId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "world_asset_patch_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_asset_patches" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "batchId" TEXT,
    "beforeRevisionId" TEXT,
    "afterRevisionId" TEXT,
    "beforeMarkdown" TEXT NOT NULL,
    "afterMarkdown" TEXT NOT NULL,
    "diff" TEXT,
    "assetVersionFrom" INTEGER NOT NULL,
    "assetVersionTo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "world_asset_patches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consistency_issues_worldId_status_idx" ON "consistency_issues"("worldId", "status");

-- CreateIndex
CREATE INDEX "agent_sessions_worldId_kind_status_idx" ON "agent_sessions"("worldId", "kind", "status");

-- CreateIndex
CREATE INDEX "agent_sessions_worldId_current_idx" ON "agent_sessions"("worldId", "current");

-- CreateIndex
CREATE INDEX "agent_session_subjects_sessionId_idx" ON "agent_session_subjects"("sessionId");

-- CreateIndex
CREATE INDEX "agent_session_context_items_sessionId_idx" ON "agent_session_context_items"("sessionId");

-- CreateIndex
CREATE INDEX "agent_session_messages_sessionId_idx" ON "agent_session_messages"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_session_messages_sessionId_sequence_key" ON "agent_session_messages"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "potential_assets_worldId_sessionId_idx" ON "potential_assets"("worldId", "sessionId");

-- CreateIndex
CREATE INDEX "potential_assets_worldId_type_status_idx" ON "potential_assets"("worldId", "type", "status");

-- CreateIndex
CREATE INDEX "potential_assets_runId_idx" ON "potential_assets"("runId");

-- CreateIndex
CREATE INDEX "potential_assets_promotedAssetId_idx" ON "potential_assets"("promotedAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "official_world_assets_worldId_documentKey_key" ON "official_world_assets"("worldId", "documentKey");

-- CreateIndex
CREATE INDEX "official_world_assets_worldId_type_status_idx" ON "official_world_assets"("worldId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "official_world_asset_revisions_assetId_version_key" ON "official_world_asset_revisions"("assetId", "version");

-- CreateIndex
CREATE INDEX "official_world_asset_revisions_worldId_assetId_idx" ON "official_world_asset_revisions"("worldId", "assetId");

-- CreateIndex
CREATE INDEX "official_world_asset_indexes_worldId_assetId_idx" ON "official_world_asset_indexes"("worldId", "assetId");

-- CreateIndex
CREATE INDEX "world_asset_patch_batches_worldId_sessionId_idx" ON "world_asset_patch_batches"("worldId", "sessionId");

-- CreateIndex
CREATE INDEX "world_asset_patch_batches_worldId_status_idx" ON "world_asset_patch_batches"("worldId", "status");

-- CreateIndex
CREATE INDEX "world_asset_patch_batches_issueId_idx" ON "world_asset_patch_batches"("issueId");

-- CreateIndex
CREATE INDEX "world_asset_patches_worldId_assetId_idx" ON "world_asset_patches"("worldId", "assetId");

-- CreateIndex
CREATE INDEX "world_asset_patches_worldId_batchId_idx" ON "world_asset_patches"("worldId", "batchId");

-- CreateIndex
CREATE INDEX "world_asset_patches_worldId_status_idx" ON "world_asset_patches"("worldId", "status");

-- CreateIndex
CREATE INDEX "world_asset_patches_assetId_status_idx" ON "world_asset_patches"("assetId", "status");

-- CreateIndex
CREATE INDEX "world_asset_patches_batchId_idx" ON "world_asset_patches"("batchId");

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session_subjects" ADD CONSTRAINT "agent_session_subjects_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session_context_items" ADD CONSTRAINT "agent_session_context_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session_messages" ADD CONSTRAINT "agent_session_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potential_assets" ADD CONSTRAINT "potential_assets_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potential_assets" ADD CONSTRAINT "potential_assets_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potential_assets" ADD CONSTRAINT "potential_assets_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "potential_assets" ADD CONSTRAINT "potential_assets_promotedAssetId_fkey" FOREIGN KEY ("promotedAssetId") REFERENCES "official_world_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_world_assets" ADD CONSTRAINT "official_world_assets_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_world_asset_revisions" ADD CONSTRAINT "official_world_asset_revisions_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_world_asset_revisions" ADD CONSTRAINT "official_world_asset_revisions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "official_world_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_world_asset_indexes" ADD CONSTRAINT "official_world_asset_indexes_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_world_asset_indexes" ADD CONSTRAINT "official_world_asset_indexes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "official_world_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_asset_patch_batches" ADD CONSTRAINT "world_asset_patch_batches_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_asset_patch_batches" ADD CONSTRAINT "world_asset_patch_batches_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_asset_patch_batches" ADD CONSTRAINT "world_asset_patch_batches_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "consistency_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_asset_patches" ADD CONSTRAINT "world_asset_patches_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_asset_patches" ADD CONSTRAINT "world_asset_patches_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "official_world_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_asset_patches" ADD CONSTRAINT "world_asset_patches_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "world_asset_patch_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
