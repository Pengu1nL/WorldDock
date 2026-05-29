-- AlterTable
ALTER TABLE "worlds" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "worlds_ownerId_deletedAt_idx" ON "worlds"("ownerId", "deletedAt");
