import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import { tokenUsageSchema } from "@worlddock/domain";
import type { BillingAccountRecord, BillingRepository, UsageLedgerEntryRecord } from "./billing.repository";

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

  async onModuleDestroy() {
    await this.prisma.$disconnect();
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
