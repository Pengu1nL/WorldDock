-- CreateIndex
CREATE INDEX "agent_sessions_worldId_updatedAt_id_idx" ON "agent_sessions"("worldId", "updatedAt" DESC, "id" ASC);
