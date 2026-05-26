import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type { AuthRepository, StoredAccessToken } from "./auth.service";

@Injectable()
export class PrismaAuthRepository implements AuthRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? { id: user.id, email: user.email, name: user.name, role: user.role as "user" | "admin" } : null;
  }

  async findSessionByToken(token: string) {
    const session = await this.prisma.session.findUnique({ where: { token } });
    return session ? { token: session.token, userId: session.userId, expiresAt: session.expiresAt } : null;
  }

  async deleteSession(token: string) {
    await this.prisma.session.deleteMany({ where: { token } });
  }

  async listAccessTokens(userId: string) {
    return this.prisma.accessToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAccessToken(input: StoredAccessToken) {
    return this.prisma.accessToken.create({
      data: input,
    });
  }

  async findAccessTokenByHash(tokenHash: string) {
    return this.prisma.accessToken.findUnique({
      where: { tokenHash },
    });
  }

  async markAccessTokenUsed(id: string, usedAt: Date) {
    await this.prisma.accessToken.updateMany({
      where: { id },
      data: { lastUsedAt: usedAt },
    });
  }

  async revokeAccessToken(userId: string, tokenId: string, revokedAt: Date) {
    await this.prisma.accessToken.updateMany({
      where: { id: tokenId, userId },
      data: { revokedAt },
    });

    return this.prisma.accessToken.findFirst({
      where: { id: tokenId, userId },
    });
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
