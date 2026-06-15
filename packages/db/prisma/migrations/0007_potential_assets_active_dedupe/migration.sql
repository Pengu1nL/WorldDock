-- CreateIndex
WITH ranked_active AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "sessionId", "type", lower("title")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "keptId",
    row_number() OVER (
      PARTITION BY "sessionId", "type", lower("title")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "rank"
  FROM "potential_assets"
  WHERE "status" = 'active'
),
duplicate_active AS (
  SELECT "id", "keptId"
  FROM ranked_active
  WHERE "rank" > 1
)
UPDATE "potential_assets" AS asset
SET
  "status" = 'dismissed',
  "metadata" = COALESCE(asset."metadata", '{}'::jsonb) || jsonb_build_object(
    'dedupedByMigration', '0007_potential_assets_active_dedupe',
    'dedupedAt', now(),
    'dedupeReason', 'duplicate active potential asset in same session/type/title',
    'dedupedIntoPotentialAssetId', duplicate_active."keptId"
  ),
  "updatedAt" = now()
FROM duplicate_active
WHERE asset."id" = duplicate_active."id";

CREATE UNIQUE INDEX "potential_assets_active_session_type_title_key"
ON "potential_assets"("sessionId", "type", lower("title"))
WHERE "status" = 'active';
