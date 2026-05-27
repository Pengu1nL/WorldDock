import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApiApp } from "../src/configure-api-app";
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type StoredAccessToken,
  type StoredSession,
  type StoredUser,
} from "../src/modules/auth/auth.service";

describe("auth endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns AUTH_REQUIRED when /me is called without credentials", async () => {
    app = await createTestApp(createInMemoryAuthRepository());

    const response = await request(app.getHttpServer())
      .get("/v1/me")
      .set("x-request-id", "req_me_missing")
      .expect(401);

    expect(response.body).toMatchObject({
      code: "AUTH_REQUIRED",
      requestId: "req_me_missing",
    });
  });

  it("returns the current user for a valid session token", async () => {
    const repository = createInMemoryAuthRepository();
    repository.users.set("user_1", {
      id: "user_1",
      email: "writer@example.com",
      name: "Writer",
      role: "user",
    });
    repository.sessions.set("session_1", {
      token: "session_valid",
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    app = await createTestApp(repository);

    const response = await request(app.getHttpServer())
      .get("/v1/me")
      .set("authorization", "Bearer session_valid")
      .expect(200);

    expect(response.body).toMatchObject({
      user: {
        id: "user_1",
        email: "writer@example.com",
        name: "Writer",
      },
      auth: {
        kind: "session",
      },
    });
  });

  it("creates, lists, authenticates with, and revokes access tokens", async () => {
    const repository = createInMemoryAuthRepository();
    repository.users.set("user_1", {
      id: "user_1",
      email: "writer@example.com",
      name: "Writer",
      role: "user",
    });
    repository.sessions.set("session_1", {
      token: "session_valid",
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    app = await createTestApp(repository);

    const createResponse = await request(app.getHttpServer())
      .post("/v1/access-tokens")
      .set("authorization", "Bearer session_valid")
      .send({ name: "Local Push", scopes: ["repository:push"] })
      .expect(201);

    expect(createResponse.body.token).toMatch(/^wdl_[a-z0-9]+_[a-z0-9]+$/);
    expect(createResponse.body.accessToken).not.toHaveProperty("tokenHash");

    const listResponse = await request(app.getHttpServer())
      .get("/v1/access-tokens")
      .set("authorization", "Bearer session_valid")
      .expect(200);

    expect(listResponse.body.accessTokens).toHaveLength(1);
    expect(listResponse.body.accessTokens[0]).toMatchObject({
      name: "Local Push",
      scopes: ["repository:push"],
      revokedAt: null,
    });
    expect(listResponse.body.accessTokens[0]).not.toHaveProperty("token");

    await request(app.getHttpServer())
      .get("/v1/me")
      .set("authorization", `Bearer ${createResponse.body.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/v1/access-tokens/${createResponse.body.accessToken.id}`)
      .set("authorization", "Bearer session_valid")
      .expect(200);

    await request(app.getHttpServer())
      .get("/v1/me")
      .set("authorization", `Bearer ${createResponse.body.token}`)
      .expect(401);
  });

  it("registers and logs in with email/password sessions", async () => {
    const repository = createInMemoryAuthRepository();
    app = await createTestApp(repository);

    const registered = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({
        email: "writer@example.com",
        password: "correct horse battery",
        name: "Writer",
      })
      .expect(201);

    expect(registered.body.session.token).toMatch(/^session_/);
    expect(registered.body.user).toMatchObject({
      email: "writer@example.com",
      name: "Writer",
    });

    const me = await request(app.getHttpServer())
      .get("/v1/me")
      .set("authorization", `Bearer ${registered.body.session.token}`)
      .expect(200);

    expect(me.body.user.email).toBe("writer@example.com");

    const loggedIn = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "writer@example.com", password: "correct horse battery" })
      .expect(200);

    expect(loggedIn.body.session.token).toMatch(/^session_/);

    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "writer@example.com", password: "wrong password" })
      .expect(401);
  });
});

async function createTestApp(repository: AuthRepository) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AUTH_REPOSITORY)
    .useValue(repository)
    .compile();

  const testApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApiApp(testApp);
  await testApp.init();
  await testApp.getHttpAdapter().getInstance().ready();
  return testApp;
}

function createInMemoryAuthRepository() {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, StoredSession>();
  const accessTokens = new Map<string, StoredAccessToken>();
  const passwordAccounts = new Map<string, { userId: string; passwordHash: string }>();

  const repository: AuthRepository & {
    users: typeof users;
    sessions: typeof sessions;
    accessTokens: typeof accessTokens;
    passwordAccounts: typeof passwordAccounts;
  } = {
    users,
    sessions,
    accessTokens,
    passwordAccounts,
    async findUserById(id) {
      return users.get(id) ?? null;
    },
    async findUserByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findSessionByToken(token) {
      return [...sessions.values()].find((session) => session.token === token) ?? null;
    },
    async deleteSession(token) {
      sessions.delete(token);
    },
    async createSession(input) {
      sessions.set(input.token, input);
      return input;
    },
    async findPasswordAccountByEmail(email) {
      return passwordAccounts.get(email) ?? null;
    },
    async createPasswordUser(input) {
      users.set(input.user.id, input.user);
      passwordAccounts.set(input.user.email, { userId: input.user.id, passwordHash: input.passwordHash });
      sessions.set(input.session.token, input.session);
      return input.user;
    },
    async listAccessTokens(userId) {
      return [...accessTokens.values()].filter((token) => token.userId === userId);
    },
    async createAccessToken(input) {
      accessTokens.set(input.id, input);
      return input;
    },
    async findAccessTokenByHash(tokenHash) {
      return [...accessTokens.values()].find((token) => token.tokenHash === tokenHash) ?? null;
    },
    async markAccessTokenUsed(id, usedAt) {
      const token = accessTokens.get(id);
      if (token) token.lastUsedAt = usedAt;
    },
    async revokeAccessToken(userId, tokenId, revokedAt) {
      const token = accessTokens.get(tokenId);
      if (!token || token.userId !== userId) return null;
      token.revokedAt = revokedAt;
      return token;
    },
  };

  return repository;
}
