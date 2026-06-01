CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activity_events_userId_dedupeKey_key" ON "activity_events"("userId", "dedupeKey");
CREATE INDEX "activity_events_userId_createdAt_idx" ON "activity_events"("userId", "createdAt");
CREATE INDEX "activity_events_type_createdAt_idx" ON "activity_events"("type", "createdAt");
CREATE INDEX "activity_events_targetType_targetId_idx" ON "activity_events"("targetType", "targetId");

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
