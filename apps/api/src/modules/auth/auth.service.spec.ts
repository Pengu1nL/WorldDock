import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_SCOPES,
  AuthService,
  type AuthRepository,
} from "./auth.service";

describe("AuthService", () => {
  it("issues access tokens as one-time plaintext values and stores only a hash", async () => {
    const repository = createInMemoryAuthRepository();
    repository.users.set("user_1", {
      id: "user_1",
      email: "writer@example.com",
      name: "Writer",
      role: "user",
    });

    const service = new AuthService(repository);
    const issued = await service.issueAccessToken("user_1", {
      name: "Local Push",
      scopes: ["repository:push"],
    });

    expect(issued.plaintextToken).toMatch(/^wdl_[a-z0-9]+_[a-z0-9]+$/);
    expect(issued.accessToken).toMatchObject({
      name: "Local Push",
      prefix: expect.any(String),
      scopes: ["repository:push"],
      revokedAt: null,
    });
    expect(repository.accessTokens.get(issued.accessToken.id)?.tokenHash).not.toBe(issued.plaintextToken);
  });

  it("rejects access token subjects without the required scope", async () => {
    const repository = createInMemoryAuthRepository();
    repository.users.set("user_1", {
      id: "user_1",
      email: "writer@example.com",
      name: "Writer",
      role: "user",
    });

    const service = new AuthService(repository);
    const issued = await service.issueAccessToken("user_1", {
      name: "Read only",
      scopes: ["world:read"],
    });
    const subject = await service.authenticateBearer(issued.plaintextToken);

    expect(() => service.assertScopes(subject, ["repository:push"])).toThrow(ForbiddenException);
  });

  it("rejects revoked access tokens", async () => {
    const repository = createInMemoryAuthRepository();
    repository.users.set("user_1", {
      id: "user_1",
      email: "writer@example.com",
      name: "Writer",
      role: "user",
    });

    const service = new AuthService(repository);
    const issued = await service.issueAccessToken("user_1", {
      name: "Local Push",
      scopes: [...ACCESS_TOKEN_SCOPES],
    });

    await service.revokeAccessToken("user_1", issued.accessToken.id);

    await expect(service.authenticateBearer(issued.plaintextToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createInMemoryAuthRepository() {
  const users = new Map<string, { id: string; email: string; name: string; role: "user" | "admin" }>();
  const sessions = new Map<string, { token: string; userId: string; expiresAt: Date }>();
  const accessTokens = new Map<string, {
    id: string;
    userId: string;
    name: string;
    tokenHash: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }>();

  const repository: AuthRepository & {
    users: typeof users;
    sessions: typeof sessions;
    accessTokens: typeof accessTokens;
  } = {
    users,
    sessions,
    accessTokens,
    async findUserById(id) {
      return users.get(id) ?? null;
    },
    async findSessionByToken(token) {
      return [...sessions.values()].find((session) => session.token === token) ?? null;
    },
    async deleteSession(token) {
      sessions.delete(token);
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
