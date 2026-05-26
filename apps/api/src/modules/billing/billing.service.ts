import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { TokenUsage } from "@worlddock/domain";
import { BILLING_REPOSITORY, type BillingAccountRecord, type BillingRepository, type UsageLedgerEntryRecord } from "./billing.repository";

export const INITIAL_FREE_CREDIT_CENTS = 10_000;
export const LOW_BALANCE_THRESHOLD_CENTS = 500;
export const AGENT_RUN_RESERVE_CENTS = 100;

@Injectable()
export class BillingService {
  constructor(@Inject(BILLING_REPOSITORY) private readonly billing: BillingRepository) {}

  async getBalance(userId: string) {
    const account = await this.ensureAccount(userId);
    const entries = await this.billing.listLedgerEntries(userId);
    return this.toBalance(userId, entries, account.updatedAt);
  }

  async getUsage(userId: string) {
    const account = await this.ensureAccount(userId);
    const entries = await this.billing.listLedgerEntries(userId);
    return {
      balance: this.toBalance(userId, entries, account.updatedAt),
      lastAgentRun: this.findLastAgentRun(entries),
      entries,
    };
  }

  async assertCanReserve(userId: string) {
    const balance = await this.getBalance(userId);
    if (balance.balanceCents < AGENT_RUN_RESERVE_CENTS) {
      throw new HttpException({
        code: "INSUFFICIENT_BALANCE",
        message: "Insufficient balance for Agent Run.",
      }, 402);
    }
  }

  async reserveAgentRun(userId: string, agentRunId: string) {
    const account = await this.ensureAccount(userId);
    await this.assertCanReserve(userId);
    return this.billing.createLedgerEntry({
      accountId: account.id,
      userId,
      agentRunId,
      type: "model_run_reserved",
      amountCents: -AGENT_RUN_RESERVE_CENTS,
      tokenUsage: null,
      reason: "reserve agent run",
    });
  }

  async settleAgentRun(userId: string, agentRunId: string, tokenUsage: TokenUsage) {
    const account = await this.ensureAccount(userId);
    const entries = await this.billing.listLedgerEntriesForRun(agentRunId);
    if (entries.some((entry) => entry.type === "model_run_settled")) return null;

    const reservedCents = this.reservedCents(entries);
    const costCents = calculateAgentRunCostCents(tokenUsage);
    return this.billing.createLedgerEntry({
      accountId: account.id,
      userId,
      agentRunId,
      type: "model_run_settled",
      amountCents: reservedCents - costCents,
      tokenUsage,
      reason: "settle agent run",
    });
  }

  async refundAgentRun(userId: string, agentRunId: string, reason: string) {
    const account = await this.ensureAccount(userId);
    const entries = await this.billing.listLedgerEntriesForRun(agentRunId);
    if (entries.some((entry) => entry.type === "model_run_refunded")) return null;
    if (entries.some((entry) => entry.type === "model_run_settled")) return null;

    const reservedCents = this.reservedCents(entries);
    if (reservedCents <= 0) return null;
    return this.billing.createLedgerEntry({
      accountId: account.id,
      userId,
      agentRunId,
      type: "model_run_refunded",
      amountCents: reservedCents,
      tokenUsage: null,
      reason,
    });
  }

  private async ensureAccount(userId: string): Promise<BillingAccountRecord> {
    const existing = await this.billing.findAccountByUserId(userId);
    const account = existing ?? await this.billing.createAccount({ userId });
    if (account.freeCreditGrantedAt) return account;

    const grantedAt = new Date();
    await this.billing.createLedgerEntry({
      accountId: account.id,
      userId,
      agentRunId: null,
      type: "credit_granted",
      amountCents: INITIAL_FREE_CREDIT_CENTS,
      tokenUsage: null,
      reason: "initial free credit",
    });
    return await this.billing.markFreeCreditGranted(account.id, grantedAt) ?? { ...account, freeCreditGrantedAt: grantedAt };
  }

  private toBalance(userId: string, entries: UsageLedgerEntryRecord[], updatedAt: Date) {
    return {
      userId,
      currency: "CNY" as const,
      balanceCents: entries.reduce((total, entry) => total + entry.amountCents, 0),
      lowBalanceThresholdCents: LOW_BALANCE_THRESHOLD_CENTS,
      updatedAt,
    };
  }

  private findLastAgentRun(entries: UsageLedgerEntryRecord[]) {
    const settled = entries.find((entry) => entry.type === "model_run_settled" && entry.agentRunId && entry.tokenUsage);
    if (!settled?.agentRunId || !settled.tokenUsage) return null;

    const runEntries = entries.filter((entry) => entry.agentRunId === settled.agentRunId);
    return {
      agentRunId: settled.agentRunId,
      tokenUsage: settled.tokenUsage,
      costCents: calculateSettledCostCents(runEntries),
      createdAt: settled.createdAt,
    };
  }

  private reservedCents(entries: UsageLedgerEntryRecord[]) {
    return -entries
      .filter((entry) => entry.type === "model_run_reserved")
      .reduce((total, entry) => total + entry.amountCents, 0);
  }
}

export function calculateAgentRunCostCents(tokenUsage: TokenUsage) {
  if (tokenUsage.totalTokens <= 0) return 0;
  return Math.max(1, Math.ceil(tokenUsage.totalTokens / 10));
}

function calculateSettledCostCents(entries: UsageLedgerEntryRecord[]) {
  const reserved = -entries
    .filter((entry) => entry.type === "model_run_reserved")
    .reduce((total, entry) => total + entry.amountCents, 0);
  const settlementAdjustment = entries
    .filter((entry) => entry.type === "model_run_settled")
    .reduce((total, entry) => total + entry.amountCents, 0);
  return Math.max(0, reserved - settlementAdjustment);
}
