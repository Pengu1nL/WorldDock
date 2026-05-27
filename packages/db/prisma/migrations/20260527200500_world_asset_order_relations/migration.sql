-- AlterTable
ALTER TABLE "archive_entries" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "story_seeds" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "conflicts" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "world_asset_relations" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "targetAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_asset_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "world_asset_relations_worldId_sourceAssetId_targetAssetId_key" ON "world_asset_relations"("worldId", "sourceAssetId", "targetAssetId");

-- CreateIndex
CREATE INDEX "world_asset_relations_worldId_sourceAssetId_idx" ON "world_asset_relations"("worldId", "sourceAssetId");

-- CreateIndex
CREATE INDEX "world_asset_relations_worldId_targetAssetId_idx" ON "world_asset_relations"("worldId", "targetAssetId");

-- AddForeignKey
ALTER TABLE "world_asset_relations" ADD CONSTRAINT "world_asset_relations_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
