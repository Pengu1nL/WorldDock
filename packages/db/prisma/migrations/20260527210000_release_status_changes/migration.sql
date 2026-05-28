ALTER TABLE "releases" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "releases" ADD COLUMN "changes" JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX "releases_status_idx" ON "releases"("status");
