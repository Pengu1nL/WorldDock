-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "agent_runs_sessionId_idx" ON "agent_runs"("sessionId");
