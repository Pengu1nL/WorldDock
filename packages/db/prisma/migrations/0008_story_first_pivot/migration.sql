-- CreateTable
CREATE TABLE "narratives" (
    "id" TEXT NOT NULL,
    "worldId" TEXT,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "visualStyle" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "narratives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "narrativeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narrative_assets" (
    "id" TEXT NOT NULL,
    "narrativeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appearance" TEXT,
    "mood" TEXT,
    "visualPrompt" TEXT,
    "nameEmbedding" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "narrative_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narrative_asset_versions" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "narrative_asset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narrative_asset_relations" (
    "id" TEXT NOT NULL,
    "narrativeId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "targetAssetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "narrative_asset_relations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "agent_sessions"
ADD COLUMN "narrativeId" TEXT,
ADD COLUMN "chapterId" TEXT;

-- CreateIndex
CREATE INDEX "narratives_worldId_idx" ON "narratives"("worldId");

-- CreateIndex
CREATE INDEX "narratives_status_idx" ON "narratives"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_narrativeId_order_key" ON "chapters"("narrativeId", "order");

-- CreateIndex
CREATE INDEX "chapters_narrativeId_idx" ON "chapters"("narrativeId");

-- CreateIndex
CREATE INDEX "chapters_narrativeId_status_idx" ON "chapters"("narrativeId", "status");

-- CreateIndex
CREATE INDEX "narrative_assets_narrativeId_idx" ON "narrative_assets"("narrativeId");

-- CreateIndex
CREATE INDEX "narrative_assets_narrativeId_kind_idx" ON "narrative_assets"("narrativeId", "kind");

-- CreateIndex
CREATE INDEX "narrative_assets_narrativeId_name_idx" ON "narrative_assets"("narrativeId", "name");

-- CreateIndex
CREATE INDEX "narrative_asset_versions_assetId_idx" ON "narrative_asset_versions"("assetId");

-- CreateIndex
CREATE INDEX "narrative_asset_versions_chapterId_idx" ON "narrative_asset_versions"("chapterId");

-- CreateIndex
CREATE INDEX "narrative_asset_relations_narrativeId_idx" ON "narrative_asset_relations"("narrativeId");

-- CreateIndex
CREATE INDEX "narrative_asset_relations_sourceAssetId_idx" ON "narrative_asset_relations"("sourceAssetId");

-- CreateIndex
CREATE INDEX "narrative_asset_relations_targetAssetId_idx" ON "narrative_asset_relations"("targetAssetId");

-- CreateIndex
CREATE INDEX "agent_sessions_worldId_narrativeId_idx" ON "agent_sessions"("worldId", "narrativeId");

-- CreateIndex
CREATE INDEX "agent_sessions_worldId_chapterId_idx" ON "agent_sessions"("worldId", "chapterId");

-- AddForeignKey
ALTER TABLE "narratives" ADD CONSTRAINT "narratives_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "narratives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrative_assets" ADD CONSTRAINT "narrative_assets_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "narratives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrative_asset_versions" ADD CONSTRAINT "narrative_asset_versions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "narrative_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrative_asset_versions" ADD CONSTRAINT "narrative_asset_versions_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrative_asset_relations" ADD CONSTRAINT "narrative_asset_relations_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "narratives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrative_asset_relations" ADD CONSTRAINT "narrative_asset_relations_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "narrative_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrative_asset_relations" ADD CONSTRAINT "narrative_asset_relations_targetAssetId_fkey" FOREIGN KEY ("targetAssetId") REFERENCES "narrative_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "narratives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
