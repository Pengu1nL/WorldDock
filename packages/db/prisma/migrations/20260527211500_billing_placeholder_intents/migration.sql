CREATE TABLE "billing_placeholder_intents" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'alpha_ui',
  "status" TEXT NOT NULL DEFAULT 'captured',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_placeholder_intents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_placeholder_intents_userId_createdAt_idx" ON "billing_placeholder_intents"("userId", "createdAt");
CREATE INDEX "billing_placeholder_intents_accountId_idx" ON "billing_placeholder_intents"("accountId");
ALTER TABLE "billing_placeholder_intents" ADD CONSTRAINT "billing_placeholder_intents_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "billing_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
