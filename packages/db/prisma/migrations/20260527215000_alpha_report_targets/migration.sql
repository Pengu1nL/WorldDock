ALTER TABLE "reports" ADD COLUMN "targetType" TEXT NOT NULL DEFAULT 'repository';
ALTER TABLE "reports" ADD COLUMN "targetId" TEXT;

UPDATE "reports" SET "targetId" = "repositoryId" WHERE "targetId" IS NULL;

ALTER TABLE "reports" ALTER COLUMN "targetId" SET NOT NULL;
ALTER TABLE "reports" ALTER COLUMN "repositoryId" DROP NOT NULL;

CREATE INDEX "reports_targetType_targetId_status_idx" ON "reports"("targetType", "targetId", "status");
CREATE INDEX "reports_reporterId_targetType_targetId_createdAt_idx" ON "reports"("reporterId", "targetType", "targetId", "createdAt");
