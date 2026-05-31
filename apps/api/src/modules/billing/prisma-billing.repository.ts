import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { tokenUsageSchema } from "@worlddock/domain";
import type { BillingAccountRecord, BillingPlaceholderIntentRecord, BillingRepository, UsageLedgerEntryRecord } from "./billing.repository";

@Injectable()
export class PrismaBillingRepository implements BillingRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async findAccountByUserId(userId: string) {
    const account = await this.prisma.billingAccount.findUnique({ where: { userId } });
    return account ? mapAccount(account) : null;
  }

  async createAccount(input: Parameters<BillingRepository["createAccount"]>[0]) {
    const account = await this.prisma.billingAccount.create({
      data: {
        userId: input.userId,
        freeCreditGrantedAt: input.freeCreditGrantedAt ?? null,
      },
    });
    return mapAccount(account);
  }

  async markFreeCreditGranted(accountId: string, grantedAt: Date) {
    const updated = await this.prisma.billingAccount.updateMany({
      where: { id: accountId },
      data: { freeCreditGrantedAt: grantedAt },
    });
    if (updated.count === 0) return null;
    const account = await this.prisma.billingAccount.findUnique({ where: { id: accountId } });
    return account ? mapAccount(account) : null;
  }

  async createLedgerEntry(input: Parameters<BillingRepository["createLedgerEntry"]>[0]) {
    const entry = await this.prisma.usageLedgerEntry.create({ data: input as never });
    return mapLedgerEntry(entry);
  }

  async createTerminalLedgerEntryOnce(input: Parameters<BillingRepository["createTerminalLedgerEntryOnce"]>[0]) {
    try {
      return await this.createLedgerEntry(input);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.prisma.usageLedgerEntry.findFirst({
        where: { agentRunId: input.agentRunId, type: { in: ["model_run_settled", "model_run_refunded"] } },
        orderBy: { createdAt: "asc" },
      });
      if (!existing) throw error;
      return mapLedgerEntry(existing);
    }
  }

  async createTerminalLedgerEntryAndUpdateRun(input: Parameters<BillingRepository["createTerminalLedgerEntryAndUpdateRun"]>[0]) {
    try {
      return await this.createTerminalLedgerEntryAndUpdateRunInTransaction(input);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.updateRunForExistingTerminalEntry(input);
      if (!existing.found) throw error;
      return existing.entry;
    }
  }

  async listLedgerEntries(userId: string) {
    const entries = await this.prisma.usageLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return entries.map(mapLedgerEntry);
  }

  async listLedgerEntriesForRun(agentRunId: string) {
    const entries = await this.prisma.usageLedgerEntry.findMany({
      where: { agentRunId },
      orderBy: { createdAt: "asc" },
    });
    return entries.map(mapLedgerEntry);
  }

  async createPlaceholderIntent(input: Parameters<BillingRepository["createPlaceholderIntent"]>[0]) {
    const intent = await this.prisma.billingPlaceholderIntent.create({
      data: {
        ...input,
        status: input.status ?? "captured",
      },
    });
    return mapPlaceholderIntent(intent);
  }

  async listPlaceholderIntents(userId: string) {
    const intents = await this.prisma.billingPlaceholderIntent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return intents.map(mapPlaceholderIntent);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  private async createTerminalLedgerEntryAndUpdateRunInTransaction(input: Parameters<BillingRepository["createTerminalLedgerEntryAndUpdateRun"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.usageLedgerEntry.findFirst({
        where: { agentRunId: input.entry.agentRunId, type: { in: ["model_run_settled", "model_run_refunded"] } },
        orderBy: { createdAt: "asc" },
      });
      if (existing) return await this.claimRunForExistingTerminalEntry(tx, existing, input);

      const updated = await tx.agentRun.updateMany({
        where: { id: input.entry.agentRunId, status: input.expectedRunStatus },
        data: input.runUpdate as never,
      });
      if (updated.count === 0) return null;

      const entry = await tx.usageLedgerEntry.create({ data: input.entry as never });
      return mapLedgerEntry(entry);
    });
  }

  private async updateRunForExistingTerminalEntry(input: Parameters<BillingRepository["createTerminalLedgerEntryAndUpdateRun"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.usageLedgerEntry.findFirst({
        where: { agentRunId: input.entry.agentRunId, type: { in: ["model_run_settled", "model_run_refunded"] } },
        orderBy: { createdAt: "asc" },
      });
      if (!existing) return { found: false as const, entry: null };
      return { found: true as const, entry: await this.claimRunForExistingTerminalEntry(tx, existing, input) };
    });
  }

  private async claimRunForExistingTerminalEntry(
    tx: Pick<PrismaClient, "agentRun" | "usageLedgerEntry">,
    existing: Parameters<typeof mapLedgerEntry>[0],
    input: Parameters<BillingRepository["createTerminalLedgerEntryAndUpdateRun"]>[0],
  ) {
    if (existing.type !== input.entry.type) return null;

    const updated = await tx.agentRun.updateMany({
      where: { id: input.entry.agentRunId, status: input.expectedRunStatus },
      data: input.runUpdate as never,
    });
    if (updated.count === 0) {
      const run = await tx.agentRun.findUnique({ where: { id: input.entry.agentRunId } });
      if (run?.status !== input.runUpdate.status) return null;
    }
    return mapLedgerEntry(existing);
  }
}

function mapAccount(record: {
  id: string;
  userId: string;
  currency: string;
  freeCreditGrantedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): BillingAccountRecord {
  return {
    ...record,
    currency: parseCurrency(record.currency),
  };
}

function mapLedgerEntry(record: {
  id: string;
  accountId: string;
  userId: string;
  agentRunId: string | null;
  type: string;
  amountCents: number;
  tokenUsage: unknown;
  reason: string | null;
  createdAt: Date;
}): UsageLedgerEntryRecord {
  return {
    id: record.id,
    accountId: record.accountId,
    userId: record.userId,
    agentRunId: record.agentRunId,
    type: parseEntryType(record.type),
    amountCents: record.amountCents,
    tokenUsage: record.tokenUsage ? tokenUsageSchema.parse(record.tokenUsage) : null,
    reason: record.reason,
    createdAt: record.createdAt,
  };
}

function parseCurrency(value: string): BillingAccountRecord["currency"] {
  if (value === "CNY") return value;
  throw new Error(`Unknown billing currency: ${value}`);
}

function parseEntryType(value: string): UsageLedgerEntryRecord["type"] {
  if (
    value === "credit_granted" ||
    value === "model_run_reserved" ||
    value === "model_run_settled" ||
    value === "model_run_refunded" ||
    value === "admin_adjusted"
  ) {
    return value;
  }
  throw new Error(`Unknown usage ledger entry type: ${value}`);
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function mapPlaceholderIntent(record: {
  id: string;
  userId: string;
  accountId: string;
  plan: string;
  source: string;
  status: string;
  createdAt: Date;
}): BillingPlaceholderIntentRecord {
  return {
    ...record,
    status: parsePlaceholderStatus(record.status),
  };
}

function parsePlaceholderStatus(value: string): BillingPlaceholderIntentRecord["status"] {
  if (value === "captured") return value;
  throw new Error(`Unknown billing placeholder intent status: ${value}`);
}
