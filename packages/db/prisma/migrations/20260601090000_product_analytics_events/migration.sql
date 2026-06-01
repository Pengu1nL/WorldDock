CREATE TABLE "product_analytics_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "anonymousId" TEXT,
    "route" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_analytics_events_name_occurredAt_idx" ON "product_analytics_events"("name", "occurredAt");
CREATE INDEX "product_analytics_events_anonymousId_occurredAt_idx" ON "product_analytics_events"("anonymousId", "occurredAt");
CREATE INDEX "product_analytics_events_userId_occurredAt_idx" ON "product_analytics_events"("userId", "occurredAt");

ALTER TABLE "product_analytics_events" ADD CONSTRAINT "product_analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
