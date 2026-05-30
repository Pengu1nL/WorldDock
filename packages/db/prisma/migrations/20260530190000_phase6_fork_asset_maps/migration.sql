CREATE TABLE "fork_asset_maps" (
    "id" TEXT NOT NULL,
    "forkId" TEXT NOT NULL,
    "upstreamAssetId" TEXT NOT NULL,
    "targetAssetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fork_asset_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fork_asset_maps_forkId_upstreamAssetId_key" ON "fork_asset_maps"("forkId", "upstreamAssetId");
CREATE INDEX "fork_asset_maps_targetAssetId_idx" ON "fork_asset_maps"("targetAssetId");

ALTER TABLE "fork_asset_maps" ADD CONSTRAINT "fork_asset_maps_forkId_fkey" FOREIGN KEY ("forkId") REFERENCES "forks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
