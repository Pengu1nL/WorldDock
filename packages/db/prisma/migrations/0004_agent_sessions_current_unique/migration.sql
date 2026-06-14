-- CreateIndex
CREATE UNIQUE INDEX "agent_sessions_current_world_exploration_worldId_key"
ON "agent_sessions"("worldId")
WHERE "kind" = 'world_exploration' AND "current" = true;
