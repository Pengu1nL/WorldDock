import { ConflictException, Inject, Injectable, NotFoundException, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import type { StoredUser } from "../auth/auth.service";

export const ACCOUNT_REPOSITORY = Symbol("ACCOUNT_REPOSITORY");

export type AccountProfileRecord = {
  id: string;
  userId: string;
  displayName: string;
  handle: string;
  avatarObjectId: string | null;
  onboardingCompletedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountRepository = {
  findUserById(userId: string): Promise<StoredUser | null>;
  findProfileByUserId(userId: string): Promise<AccountProfileRecord | null>;
  findProfileByHandle(handle: string): Promise<AccountProfileRecord | null>;
  upsertProfile(userId: string, input: { displayName: string; handle: string }): Promise<AccountProfileRecord>;
  updateProfile(
    userId: string,
    input: Partial<Pick<AccountProfileRecord, "displayName" | "handle" | "avatarObjectId" | "onboardingCompletedAt" | "deletedAt">>,
  ): Promise<AccountProfileRecord | null>;
};

export type UpdateProfileInput = {
  displayName?: string;
  handle?: string;
};

@Injectable()
export class AccountService {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly repository: AccountRepository) {}

  async getProfile(userId: string) {
    return this.toResponse(await this.ensureProfile(userId));
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const current = await this.ensureProfile(userId);
    const nextHandle = input.handle?.toLowerCase();
    if (nextHandle && nextHandle !== current.handle) {
      const existing = await this.repository.findProfileByHandle(nextHandle);
      if (existing && existing.userId !== userId) {
        throw new ConflictException({
          code: "HANDLE_TAKEN",
          message: "Handle is already taken.",
        });
      }
    }

    const updated = await this.repository.updateProfile(userId, {
      displayName: input.displayName,
      handle: nextHandle,
    });
    if (!updated) throw this.notFound();
    return this.toResponse(updated);
  }

  async completeOnboarding(userId: string) {
    await this.ensureProfile(userId);
    const updated = await this.repository.updateProfile(userId, {
      onboardingCompletedAt: new Date(),
    });
    if (!updated) throw this.notFound();
    return this.toResponse(updated);
  }

  async scheduleAccountDeletion(userId: string) {
    await this.ensureProfile(userId);
    const updated = await this.repository.updateProfile(userId, {
      deletedAt: new Date(),
    });
    if (!updated) throw this.notFound();
    return this.toResponse(updated);
  }

  private async ensureProfile(userId: string) {
    const existing = await this.repository.findProfileByUserId(userId);
    if (existing) return existing;

    const user = await this.repository.findUserById(userId);
    if (!user) throw this.notFound();
    return this.repository.upsertProfile(userId, {
      displayName: user.name || user.email,
      handle: await this.nextAvailableHandle(user),
    });
  }

  private async nextAvailableHandle(user: StoredUser) {
    const base = normalizeHandle(user.email.split("@")[0] || user.name || "creator");
    let candidate = base;
    let suffix = 1;

    while (true) {
      const existing = await this.repository.findProfileByHandle(candidate);
      if (!existing || existing.userId === user.id) return candidate;
      suffix += 1;
      candidate = `${base.slice(0, Math.max(3, 32 - String(suffix).length - 1))}-${suffix}`;
    }
  }

  private toResponse(profile: AccountProfileRecord) {
    return {
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
      deletedAt: profile.deletedAt?.toISOString() ?? null,
    };
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "Account profile not found.",
    });
  }
}

@Injectable()
export class PrismaAccountRepository implements AccountRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async findUserById(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? { id: user.id, email: user.email, name: user.name, role: user.role as "user" | "admin" } : null;
  }

  async findProfileByUserId(userId: string) {
    return this.prisma.userProfile.findUnique({ where: { userId } });
  }

  async findProfileByHandle(handle: string) {
    return this.prisma.userProfile.findUnique({ where: { handle } });
  }

  async upsertProfile(userId: string, input: { displayName: string; handle: string }) {
    return this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
  }

  async updateProfile(userId: string, input: Parameters<AccountRepository["updateProfile"]>[1]) {
    const updated = await this.prisma.userProfile.updateMany({
      where: { userId },
      data: input,
    });
    if (updated.count === 0) return null;
    return this.findProfileByUserId(userId);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function normalizeHandle(input: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 32);

  if (normalized.length >= 3) return normalized;
  return `creator-${normalized || "user"}`.slice(0, 32);
}
