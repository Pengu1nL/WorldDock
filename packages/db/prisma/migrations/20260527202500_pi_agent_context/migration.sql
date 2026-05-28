-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE "agent_runs" ADD COLUMN "piSessionId" TEXT;

-- AlterTable
ALTER TABLE "context_refs" ADD COLUMN "level" TEXT NOT NULL DEFAULT 'card';
ALTER TABLE "context_refs" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'initial';

-- CreateIndex
CREATE INDEX "agent_runs_piSessionId_idx" ON "agent_runs"("piSessionId");

-- CreateIndex
CREATE INDEX "context_refs_runId_level_idx" ON "context_refs"("runId", "level");
