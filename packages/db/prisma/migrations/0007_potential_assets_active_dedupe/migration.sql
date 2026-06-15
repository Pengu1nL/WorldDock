-- CreateIndex
CREATE UNIQUE INDEX "potential_assets_active_session_type_title_key"
ON "potential_assets"("sessionId", "type", lower("title"))
WHERE "status" = 'active';
