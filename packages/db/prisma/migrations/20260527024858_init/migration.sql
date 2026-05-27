-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worlds" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "mode" TEXT NOT NULL DEFAULT 'cloud',
    "maturity" INTEGER NOT NULL DEFAULT 0,
    "coverObjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worlds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_entries" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "relations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_seeds" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "trigger" TEXT,
    "conflict" TEXT NOT NULL,
    "protagonists" TEXT,
    "questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_seeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflicts" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "related" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "derivedSeeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consistency_issues" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "involves" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "severity" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consistency_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "mode" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT,
    "tokenUsage" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_events" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_suggestions" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suggestion" JSONB NOT NULL,
    "savedAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_refs" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "freeCreditGrantedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_ledger" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "tokenUsage" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "worldId" TEXT,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "license" TEXT NOT NULL,
    "moderationStatus" TEXT NOT NULL DEFAULT 'visible',
    "moderationReason" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_snapshots" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stars" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forks" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "sourceReleaseId" TEXT NOT NULL,
    "targetWorldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "licenseSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "reportId" TEXT,
    "moderatorId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "nextStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_objects" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "purpose" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "worldId" TEXT,
    "repositoryId" TEXT,
    "releaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "access_tokens_tokenHash_key" ON "access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "access_tokens_userId_idx" ON "access_tokens"("userId");

-- CreateIndex
CREATE INDEX "access_tokens_prefix_idx" ON "access_tokens"("prefix");

-- CreateIndex
CREATE INDEX "worlds_ownerId_idx" ON "worlds"("ownerId");

-- CreateIndex
CREATE INDEX "worlds_coverObjectId_idx" ON "worlds"("coverObjectId");

-- CreateIndex
CREATE INDEX "archive_entries_worldId_idx" ON "archive_entries"("worldId");

-- CreateIndex
CREATE INDEX "story_seeds_worldId_idx" ON "story_seeds"("worldId");

-- CreateIndex
CREATE INDEX "conflicts_worldId_idx" ON "conflicts"("worldId");

-- CreateIndex
CREATE INDEX "consistency_issues_worldId_idx" ON "consistency_issues"("worldId");

-- CreateIndex
CREATE INDEX "agent_runs_worldId_idx" ON "agent_runs"("worldId");

-- CreateIndex
CREATE INDEX "agent_runs_userId_idx" ON "agent_runs"("userId");

-- CreateIndex
CREATE INDEX "agent_events_runId_idx" ON "agent_events"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_events_runId_sequence_key" ON "agent_events"("runId", "sequence");

-- CreateIndex
CREATE INDEX "agent_suggestions_runId_idx" ON "agent_suggestions"("runId");

-- CreateIndex
CREATE INDEX "agent_suggestions_worldId_idx" ON "agent_suggestions"("worldId");

-- CreateIndex
CREATE INDEX "context_refs_runId_idx" ON "context_refs"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_accounts_userId_key" ON "billing_accounts"("userId");

-- CreateIndex
CREATE INDEX "usage_ledger_accountId_createdAt_idx" ON "usage_ledger"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_ledger_userId_idx" ON "usage_ledger"("userId");

-- CreateIndex
CREATE INDEX "usage_ledger_agentRunId_idx" ON "usage_ledger"("agentRunId");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_worldId_key" ON "repositories"("worldId");

-- CreateIndex
CREATE INDEX "repositories_ownerId_idx" ON "repositories"("ownerId");

-- CreateIndex
CREATE INDEX "repositories_moderationStatus_idx" ON "repositories"("moderationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_ownerName_slug_key" ON "repositories"("ownerName", "slug");

-- CreateIndex
CREATE INDEX "releases_repositoryId_idx" ON "releases"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "releases_repositoryId_version_key" ON "releases"("repositoryId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "release_snapshots_releaseId_key" ON "release_snapshots"("releaseId");

-- CreateIndex
CREATE INDEX "release_snapshots_repositoryId_idx" ON "release_snapshots"("repositoryId");

-- CreateIndex
CREATE INDEX "stars_userId_idx" ON "stars"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "stars_repositoryId_userId_key" ON "stars"("repositoryId", "userId");

-- CreateIndex
CREATE INDEX "forks_repositoryId_idx" ON "forks"("repositoryId");

-- CreateIndex
CREATE INDEX "forks_userId_idx" ON "forks"("userId");

-- CreateIndex
CREATE INDEX "forks_targetWorldId_idx" ON "forks"("targetWorldId");

-- CreateIndex
CREATE INDEX "outbox_events_type_idx" ON "outbox_events"("type");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_createdAt_idx" ON "outbox_events"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "reports_repositoryId_status_idx" ON "reports"("repositoryId", "status");

-- CreateIndex
CREATE INDEX "reports_reporterId_idx" ON "reports"("reporterId");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_actions_repositoryId_createdAt_idx" ON "moderation_actions"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_actions_reportId_idx" ON "moderation_actions"("reportId");

-- CreateIndex
CREATE INDEX "moderation_actions_moderatorId_idx" ON "moderation_actions"("moderatorId");

-- CreateIndex
CREATE UNIQUE INDEX "storage_objects_key_key" ON "storage_objects"("key");

-- CreateIndex
CREATE INDEX "storage_objects_ownerId_idx" ON "storage_objects"("ownerId");

-- CreateIndex
CREATE INDEX "storage_objects_status_createdAt_idx" ON "storage_objects"("status", "createdAt");

-- CreateIndex
CREATE INDEX "storage_objects_worldId_idx" ON "storage_objects"("worldId");

-- CreateIndex
CREATE INDEX "storage_objects_repositoryId_idx" ON "storage_objects"("repositoryId");

-- CreateIndex
CREATE INDEX "storage_objects_releaseId_idx" ON "storage_objects"("releaseId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_coverObjectId_fkey" FOREIGN KEY ("coverObjectId") REFERENCES "storage_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_entries" ADD CONSTRAINT "archive_entries_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_seeds" ADD CONSTRAINT "story_seeds_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts" ADD CONSTRAINT "conflicts_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consistency_issues" ADD CONSTRAINT "consistency_issues_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_suggestions" ADD CONSTRAINT "agent_suggestions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_suggestions" ADD CONSTRAINT "agent_suggestions_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_refs" ADD CONSTRAINT "context_refs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "billing_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_snapshots" ADD CONSTRAINT "release_snapshots_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_snapshots" ADD CONSTRAINT "release_snapshots_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stars" ADD CONSTRAINT "stars_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stars" ADD CONSTRAINT "stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forks" ADD CONSTRAINT "forks_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forks" ADD CONSTRAINT "forks_sourceReleaseId_fkey" FOREIGN KEY ("sourceReleaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forks" ADD CONSTRAINT "forks_targetWorldId_fkey" FOREIGN KEY ("targetWorldId") REFERENCES "worlds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forks" ADD CONSTRAINT "forks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
