import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import {
  BILLING_REPOSITORY,
  type BillingAccountRecord,
  type BillingPlaceholderIntentRecord,
  type BillingRepository,
  type UsageLedgerEntryRecord,
} from "../src/modules/billing/billing.repository";
import { BillingModule } from "../src/modules/billing/billing.module";

describe("billing alpha endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns alpha entitlements and captures waitlist-only payment intents", async () => {
    const auth = createInMemoryAuthRepository();
    const billing = createInMemoryBillingRepository();
    addSession(auth, "session_user_1", "user_1");
    app = await createTestApp(auth, billing);

    const entitlements = await request(app.getHttpServer())
      .get("/v1/billing/entitlements")
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(entitlements.body.entitlements).toMatchObject({
      betaPayments: false,
      stripeCheckout: false,
      stripeCustomerPortal: false,
      stripeWebhooks: false,
    });

    const intent = await request(app.getHttpServer())
      .post("/v1/billing/placeholder-intents")
      .set("authorization", "Bearer session_user_1")
      .send({ plan: "creator" })
      .expect(201);
    expect(intent.body.intent).toMatchObject({ userId: "user_1", plan: "creator", source: "alpha_ui", status: "captured" });

    const usage = await request(app.getHttpServer())
      .get("/v1/billing/usage")
      .set("authorization", "Bearer session_user_1")
      .expect(200);
    expect(usage.body.usage.placeholderIntents).toContainEqual(expect.objectContaining({ plan: "creator" }));
  });
});

async function createTestApp(authRepository: AuthRepository, billingRepository: BillingRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [BillingModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(BILLING_REPOSITORY)
    .useValue(billingRepository)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function addSession(repository: ReturnType<typeof createInMemoryAuthRepository>, token: string, userId: string) {
  repository.users.set(userId, { id: userId, email: `${userId}@example.com`, name: userId, role: "user" });
  repository.sessions.set(token, { token, userId, expiresAt: new Date(Date.now() + 60_000) });
}

function createInMemoryAuthRepository() {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, StoredSession>();
  const accessTokens = new Map<string, StoredAccessToken>();
  return {
    users,
    sessions,
    accessTokens,
    async findUserById(id: string) { return users.get(id) ?? null; },
    async findSessionByToken(token: string) { return sessions.get(token) ?? null; },
    async deleteSession(token: string) { sessions.delete(token); },
    async listAccessTokens(userId: string) { return [...accessTokens.values()].filter((item) => item.userId === userId); },
    async createAccessToken(input: StoredAccessToken) { accessTokens.set(input.id, input); return input; },
    async findAccessTokenByHash(tokenHash: string) { return [...accessTokens.values()].find((item) => item.tokenHash === tokenHash) ?? null; },
    async markAccessTokenUsed(id: string, usedAt: Date) { const token = accessTokens.get(id); if (token) token.lastUsedAt = usedAt; },
    async revokeAccessToken(userId: string, tokenId: string, revokedAt: Date) {
      const token = accessTokens.get(tokenId);
      if (!token || token.userId !== userId) return null;
      token.revokedAt = revokedAt;
      return token;
    },
  } satisfies AuthRepository & { users: typeof users; sessions: typeof sessions; accessTokens: typeof accessTokens };
}

function createInMemoryBillingRepository() {
  const accounts = new Map<string, BillingAccountRecord>();
  const entries = new Map<string, UsageLedgerEntryRecord>();
  const placeholderIntents = new Map<string, BillingPlaceholderIntentRecord>();
  const repository: BillingRepository = {
    async findAccountByUserId(userId) { return [...accounts.values()].find((account) => account.userId === userId) ?? null; },
    async createAccount(input) {
      const now = new Date();
      const account = { id: `ba_${accounts.size + 1}`, userId: input.userId, currency: "CNY" as const, freeCreditGrantedAt: input.freeCreditGrantedAt ?? null, createdAt: now, updatedAt: now };
      accounts.set(account.id, account);
      return account;
    },
    async markFreeCreditGranted(accountId, grantedAt) { const account = accounts.get(accountId); if (!account) return null; const next = { ...account, freeCreditGrantedAt: grantedAt, updatedAt: new Date() }; accounts.set(accountId, next); return next; },
    async createLedgerEntry(input) { const entry = { id: `ule_${entries.size + 1}`, createdAt: new Date(), ...input }; entries.set(entry.id, entry); return entry; },
    async listLedgerEntries(userId) { return [...entries.values()].filter((entry) => entry.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); },
    async listLedgerEntriesForRun(agentRunId) { return [...entries.values()].filter((entry) => entry.agentRunId === agentRunId); },
    async createPlaceholderIntent(input) {
      const intent = { id: `bpi_${placeholderIntents.size + 1}`, createdAt: new Date(), status: input.status ?? "captured" as const, ...input };
      placeholderIntents.set(intent.id, intent);
      return intent;
    },
    async listPlaceholderIntents(userId) { return [...placeholderIntents.values()].filter((intent) => intent.userId === userId); },
  };
  return repository;
}
