import { createHash, randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { hashPassword as betterAuthHashPassword, verifyPassword as betterAuthVerifyPassword } from "better-auth/crypto";

export const ACCESS_TOKEN_SCOPES = ["world:read", "world:write", "repository:push"] as const;
export type AccessTokenScope = typeof ACCESS_TOKEN_SCOPES[number];

export const AUTH_REPOSITORY = Symbol("AUTH_REPOSITORY");

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
};

export type StoredSession = {
  token: string;
  userId: string;
  expiresAt: Date;
};

export type StoredAccessToken = {
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
};

export type PublicAccessToken = Omit<StoredAccessToken, "tokenHash" | "userId">;

export type StoredPasswordAccount = {
  userId: string;
  passwordHash: string;
};

export type AuthRepository = {
  findUserById(id: string): Promise<StoredUser | null>;
  findUserByEmail?(email: string): Promise<StoredUser | null>;
  findSessionByToken(token: string): Promise<StoredSession | null>;
  deleteSession(token: string): Promise<void>;
  createSession?(input: StoredSession): Promise<StoredSession>;
  listAccessTokens(userId: string): Promise<StoredAccessToken[]>;
  createAccessToken(input: StoredAccessToken): Promise<StoredAccessToken>;
  findAccessTokenByHash(tokenHash: string): Promise<StoredAccessToken | null>;
  markAccessTokenUsed(id: string, usedAt: Date): Promise<void>;
  revokeAccessToken(userId: string, tokenId: string, revokedAt: Date): Promise<StoredAccessToken | null>;
  findPasswordAccountByEmail?(email: string): Promise<StoredPasswordAccount | null>;
  createPasswordUser?(input: {
    user: StoredUser;
    emailVerified: boolean;
    passwordHash: string;
    session: StoredSession;
  }): Promise<StoredUser>;
};

export type SessionSubject = {
  kind: "session";
  user: StoredUser;
  sessionToken: string;
};

export type AccessTokenSubject = {
  kind: "access-token";
  user: StoredUser;
  accessTokenId: string;
  scopes: string[];
};

export type AuthSubject = SessionSubject | AccessTokenSubject;

export type IssueAccessTokenInput = {
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
};

export type RegisterEmailPasswordInput = {
  email: string;
  password: string;
  name?: string;
};

export type LoginEmailPasswordInput = {
  email: string;
  password: string;
};

@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository) {}

  async registerEmailPassword(input: RegisterEmailPasswordInput) {
    const credentials = this.requireCredentialsRepository();
    const email = normalizeEmail(input.email);
    const password = normalizePassword(input.password);
    const existing = await credentials.findUserByEmail(email);
    if (existing) {
      throw new ConflictException({
        code: "EMAIL_TAKEN",
        message: "Email is already registered.",
      });
    }

    const now = new Date();
    const session = createSessionRecord(`user_${randomUUID().replaceAll("-", "")}`);
    const user = await credentials.createPasswordUser({
      user: {
        id: session.userId,
        email,
        name: input.name?.trim() || email.split("@")[0],
        role: "user",
      },
      emailVerified: false,
      passwordHash: await hashPassword(password),
      session: {
        ...session,
        expiresAt: new Date(now.getTime() + sessionMaxAgeMs),
      },
    });

    return {
      user,
      session: { token: session.token, expiresAt: session.expiresAt },
    };
  }

  async loginEmailPassword(input: LoginEmailPasswordInput) {
    const credentials = this.requireCredentialsRepository();
    const email = normalizeEmail(input.email);
    const account = await credentials.findPasswordAccountByEmail(email);
    if (!account || !await verifyPassword(input.password, account.passwordHash)) {
      throw this.authRequired();
    }

    const user = await this.repository.findUserById(account.userId);
    if (!user) throw this.authRequired();
    const session = createSessionRecord(user.id);
    const created = await credentials.createSession(session);
    return {
      user,
      session: { token: created.token, expiresAt: created.expiresAt },
    };
  }

  async authenticateBearer(token: string): Promise<AuthSubject> {
    if (token.startsWith("wdl_")) {
      return this.authenticateAccessToken(token);
    }

    const session = await this.repository.findSessionByToken(token);
    if (!session || session.expiresAt <= new Date()) {
      throw this.authRequired();
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user) throw this.authRequired();

    return {
      kind: "session",
      user,
      sessionToken: session.token,
    };
  }

  async logout(subject: AuthSubject) {
    if (subject.kind === "session") {
      await this.repository.deleteSession(subject.sessionToken);
    }
  }

  async listAccessTokens(userId: string): Promise<PublicAccessToken[]> {
    const tokens = await this.repository.listAccessTokens(userId);
    return tokens.map((token) => this.toPublicAccessToken(token));
  }

  async issueAccessToken(userId: string, input: IssueAccessTokenInput) {
    const user = await this.repository.findUserById(userId);
    if (!user) throw this.authRequired();

    const scopes = this.normalizeScopes(input.scopes);
    const prefix = randomBytes(5).toString("hex");
    const secret = randomBytes(24).toString("hex");
    const plaintextToken = `wdl_${prefix}_${secret}`;
    const now = new Date();
    const accessToken = await this.repository.createAccessToken({
      id: `at_${randomUUID().replaceAll("-", "")}`,
      userId,
      name: input.name,
      tokenHash: hashToken(plaintextToken),
      prefix,
      scopes,
      lastUsedAt: null,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      createdAt: now,
    });

    return {
      plaintextToken,
      accessToken: this.toPublicAccessToken(accessToken),
    };
  }

  async revokeAccessToken(userId: string, tokenId: string): Promise<PublicAccessToken | null> {
    const revoked = await this.repository.revokeAccessToken(userId, tokenId, new Date());
    return revoked ? this.toPublicAccessToken(revoked) : null;
  }

  assertSessionSubject(subject: AuthSubject): SessionSubject {
    if (subject.kind !== "session") {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "A user session is required for this action.",
      });
    }

    return subject;
  }

  assertScopes(subject: AuthSubject, requiredScopes: string[]) {
    if (requiredScopes.length === 0) return;
    if (subject.kind !== "access-token") return;

    const missing = requiredScopes.filter((scope) => !subject.scopes.includes(scope));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "Insufficient access token scope.",
        details: { requiredScopes, missing },
      });
    }
  }

  private async authenticateAccessToken(token: string): Promise<AccessTokenSubject> {
    const stored = await this.repository.findAccessTokenByHash(hashToken(token));
    if (!stored || stored.revokedAt || (stored.expiresAt && stored.expiresAt <= new Date())) {
      throw this.authRequired();
    }

    const user = await this.repository.findUserById(stored.userId);
    if (!user) throw this.authRequired();

    await this.repository.markAccessTokenUsed(stored.id, new Date());

    return {
      kind: "access-token",
      user,
      accessTokenId: stored.id,
      scopes: stored.scopes,
    };
  }

  private normalizeScopes(scopes: string[]): AccessTokenScope[] {
    const allowed = new Set<string>(ACCESS_TOKEN_SCOPES);
    return [...new Set(scopes)].map((scope) => {
      if (!allowed.has(scope)) {
        throw new ForbiddenException({
          code: "PERMISSION_DENIED",
          message: `Unsupported access token scope: ${scope}`,
        });
      }
      return scope as AccessTokenScope;
    });
  }

  private toPublicAccessToken(token: StoredAccessToken): PublicAccessToken {
    const { tokenHash: _tokenHash, userId: _userId, ...publicToken } = token;
    return publicToken;
  }

  authRequired() {
    return new UnauthorizedException({
      code: "AUTH_REQUIRED",
      message: "Authentication is required.",
    });
  }

  private requireCredentialsRepository() {
    if (
      !this.repository.findUserByEmail ||
      !this.repository.findPasswordAccountByEmail ||
      !this.repository.createPasswordUser ||
      !this.repository.createSession
    ) {
      throw new Error("Email/password auth repository is not configured.");
    }

    return {
      findUserByEmail: this.repository.findUserByEmail.bind(this.repository),
      findPasswordAccountByEmail: this.repository.findPasswordAccountByEmail.bind(this.repository),
      createPasswordUser: this.repository.createPasswordUser.bind(this.repository),
      createSession: this.repository.createSession.bind(this.repository),
    };
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const sessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

function createSessionRecord(userId: string): StoredSession {
  return {
    token: `session_${randomUUID().replaceAll("-", "")}`,
    userId,
    expiresAt: new Date(Date.now() + sessionMaxAgeMs),
  };
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new BadRequestException({
      code: "INVALID_EMAIL",
      message: "Email is invalid.",
    });
  }
  return normalized;
}

function normalizePassword(password: string) {
  if (password.length < 8) {
    throw new BadRequestException({
      code: "WEAK_PASSWORD",
      message: "Password must be at least 8 characters.",
    });
  }
  return password;
}

function hashPassword(password: string) {
  return betterAuthHashPassword(password);
}

function verifyPassword(password: string, encoded: string) {
  return betterAuthVerifyPassword({ password, hash: encoded });
}
