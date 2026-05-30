import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import { AUTH_REPOSITORY, type AuthRepository, type StoredAccessToken, type StoredSession, type StoredUser } from "../src/modules/auth/auth.service";
import { ACCOUNT_REPOSITORY, type AccountProfileRecord, type AccountRepository } from "../src/modules/account/account.service";

describe("account endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates, reads, updates, and completes onboarding for a user profile", async () => {
    const auth = createInMemoryAuthRepository();
    const accounts = createInMemoryAccountRepository(auth.users);
    addSession(auth, "session_user_1", "user_1", "writer@example.com", "Writer");
    app = await createTestApp(auth, accounts);

    const initial = await request(app.getHttpServer())
      .get("/v1/account/profile")
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(initial.body.profile).toMatchObject({
      userId: "user_1",
      displayName: "Writer",
      handle: "writer",
      onboardingCompletedAt: null,
    });

    const updated = await request(app.getHttpServer())
      .patch("/v1/account/profile")
      .set("authorization", "Bearer session_user_1")
      .send({ displayName: "Ren Writer", handle: "ren-writer" })
      .expect(200);

    expect(updated.body.profile).toMatchObject({
      displayName: "Ren Writer",
      handle: "ren-writer",
    });

    const completed = await request(app.getHttpServer())
      .patch("/v1/account/onboarding/complete")
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(completed.body.profile.onboardingCompletedAt).toEqual(expect.any(String));
  });

  it("allows browser CORS preflight for onboarding PATCH requests", async () => {
    const auth = createInMemoryAuthRepository();
    const accounts = createInMemoryAccountRepository(auth.users);
    app = await createTestApp(auth, accounts);

    const response = await request(app.getHttpServer())
      .options("/v1/account/onboarding/complete")
      .set("origin", "http://localhost:3000")
      .set("access-control-request-method", "PATCH")
      .set("access-control-request-headers", "authorization")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(response.headers["access-control-allow-headers"]).toContain("authorization");
  });

  it("rejects duplicate handles", async () => {
    const auth = createInMemoryAuthRepository();
    const accounts = createInMemoryAccountRepository(auth.users);
    addSession(auth, "session_user_1", "user_1", "first@example.com", "First");
    addSession(auth, "session_user_2", "user_2", "second@example.com", "Second");
    await accounts.upsertProfile("user_1", { displayName: "First", handle: "taken" });
    app = await createTestApp(auth, accounts);

    const response = await request(app.getHttpServer())
      .patch("/v1/account/profile")
      .set("authorization", "Bearer session_user_2")
      .send({ handle: "taken" })
      .expect(409);

    expect(response.body).toMatchObject({
      code: "HANDLE_TAKEN",
    });
  });

  it("soft deletes the account profile", async () => {
    const auth = createInMemoryAuthRepository();
    const accounts = createInMemoryAccountRepository(auth.users);
    addSession(auth, "session_user_1", "user_1", "writer@example.com", "Writer");
    app = await createTestApp(auth, accounts);

    const response = await request(app.getHttpServer())
      .delete("/v1/account")
      .set("authorization", "Bearer session_user_1")
      .expect(200);

    expect(response.body.profile.deletedAt).toEqual(expect.any(String));
  });
});

async function createTestApp(authRepository: AuthRepository, accountRepository: AccountRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(authRepository)
    .overrideProvider(ACCOUNT_REPOSITORY)
    .useValue(accountRepository)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function addSession(
  repository: ReturnType<typeof createInMemoryAuthRepository>,
  token: string,
  userId: string,
  email: string,
  name: string,
) {
  repository.users.set(userId, { id: userId, email, name, role: "user" });
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
    async listAccessTokens(userId: string) { return [...accessTokens.values()].filter((token) => token.userId === userId); },
    async createAccessToken(input: StoredAccessToken) { accessTokens.set(input.id, input); return input; },
    async findAccessTokenByHash(tokenHash: string) { return [...accessTokens.values()].find((token) => token.tokenHash === tokenHash) ?? null; },
    async markAccessTokenUsed(id: string, usedAt: Date) { const token = accessTokens.get(id); if (token) token.lastUsedAt = usedAt; },
    async revokeAccessToken(userId: string, tokenId: string, revokedAt: Date) {
      const token = accessTokens.get(tokenId);
      if (!token || token.userId !== userId) return null;
      token.revokedAt = revokedAt;
      return token;
    },
  } satisfies AuthRepository & { users: typeof users; sessions: typeof sessions; accessTokens: typeof accessTokens };
}

function createInMemoryAccountRepository(users: Map<string, StoredUser>) {
  const profiles = new Map<string, AccountProfileRecord>();

  return {
    profiles,
    async findUserById(userId: string) {
      return users.get(userId) ?? null;
    },
    async findProfileByUserId(userId: string) {
      return profiles.get(userId) ?? null;
    },
    async findProfileByHandle(handle: string) {
      return [...profiles.values()].find((profile) => profile.handle === handle) ?? null;
    },
    async upsertProfile(userId: string, input: { displayName: string; handle: string }) {
      const now = new Date();
      const existing = profiles.get(userId);
      const profile: AccountProfileRecord = {
        id: existing?.id ?? `profile_${profiles.size + 1}`,
        userId,
        displayName: input.displayName,
        handle: input.handle,
        avatarObjectId: existing?.avatarObjectId ?? null,
        onboardingCompletedAt: existing?.onboardingCompletedAt ?? null,
        deletedAt: existing?.deletedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      profiles.set(userId, profile);
      return profile;
    },
    async updateProfile(userId: string, input: Partial<Pick<AccountProfileRecord, "displayName" | "handle" | "avatarObjectId" | "onboardingCompletedAt" | "deletedAt">>) {
      const existing = profiles.get(userId);
      if (!existing) return null;
      const profile = { ...existing, ...input, updatedAt: new Date() };
      profiles.set(userId, profile);
      return profile;
    },
  } satisfies AccountRepository & { profiles: typeof profiles };
}
