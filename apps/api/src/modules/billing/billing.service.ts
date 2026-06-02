import { HttpException, Inject, Injectable } from "@nestjs/common";
import { calculateModelRunCostCents, type ModelPrice, type TokenUsage } from "@worlddock/domain";
import { captureException } from "../../common/observability";
import { NotificationsService } from "../notifications/notifications.service";
import { BILLING_REPOSITORY, type AgentRunTerminalUpdateInput, type BillingAccountRecord, type BillingRepository, type UsageLedgerEntryRecord } from "./billing.repository";

export const INITIAL_FREE_CREDIT_CENTS = 10_000;
export const LOW_BALANCE_THRESHOLD_CENTS = 500;
export const AGENT_RUN_RESERVE_CENTS = 100;

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly billing: BillingRepository,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

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
      placeholderIntents: await this.billing.listPlaceholderIntents(userId),
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

  async settleAgentRun(
    userId: string,
    agentRunId: string,
    tokenUsage: TokenUsage,
    priceInput: { provider?: ModelPrice["provider"] | string | null; model?: string | null } = {},
  ) {
    const account = await this.ensureAccount(userId);
    const entries = await this.billing.listLedgerEntriesForRun(agentRunId);
    const existingTerminal = entries.find(isTerminalEntry);
    if (existingTerminal) return existingTerminal.type === "model_run_settled" ? existingTerminal : null;

    const reservedCents = this.reservedCents(entries);
    const costCents = calculateAgentRunCostCents(tokenUsage, priceInput);
    const terminalEntry = await this.billing.createTerminalLedgerEntryOnce({
      accountId: account.id,
      userId,
      agentRunId,
      type: "model_run_settled",
      amountCents: reservedCents - costCents,
      tokenUsage,
      reason: "settle agent run",
    });
    return terminalEntry.type === "model_run_settled" ? terminalEntry : null;
  }

  async settleAgentRunAndComplete(
    userId: string,
    agentRunId: string,
    tokenUsage: TokenUsage,
    priceInput: { provider?: ModelPrice["provider"] | string | null; model?: string | null } = {},
  ) {
    return this.settleAgentRunAndUpdateStatus(userId, agentRunId, tokenUsage, priceInput, {
      status: "completed",
      tokenUsage,
      completedAt: new Date(),
      failedAt: null,
      cancelledAt: null,
      errorCode: null,
      errorMessage: null,
    });
  }

  async refundAgentRun(userId: string, agentRunId: string, reason: string) {
    const account = await this.ensureAccount(userId);
    const entries = await this.billing.listLedgerEntriesForRun(agentRunId);
    const existingTerminal = entries.find(isTerminalEntry);
    if (existingTerminal) return existingTerminal.type === "model_run_refunded" ? existingTerminal : null;

    const reservedCents = this.reservedCents(entries);
    if (reservedCents <= 0) return null;
    const terminalEntry = await this.billing.createTerminalLedgerEntryOnce({
      accountId: account.id,
      userId,
      agentRunId,
      type: "model_run_refunded",
      amountCents: reservedCents,
      tokenUsage: null,
      reason,
    });
    return terminalEntry.type === "model_run_refunded" ? terminalEntry : null;
  }

  async refundAgentRunAndFail(userId: string, agentRunId: string, reason: string, failure: { code: string; message: string }) {
    return this.refundAgentRunAndUpdateStatus(userId, agentRunId, reason, {
      status: "failed",
      tokenUsage: null,
      completedAt: null,
      failedAt: new Date(),
      cancelledAt: null,
      errorCode: failure.code,
      errorMessage: failure.message,
    });
  }

  async refundAgentRunAndCancel(userId: string, agentRunId: string, reason: string) {
    return this.refundAgentRunAndUpdateStatus(userId, agentRunId, reason, {
      status: "cancelled",
      tokenUsage: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: new Date(),
      errorCode: null,
      errorMessage: null,
    });
  }

  async capturePlaceholderIntent(userId: string, plan: string) {
    const account = await this.ensureAccount(userId);
    const intent = await this.billing.createPlaceholderIntent({
      accountId: account.id,
      userId,
      plan,
      source: "alpha_ui",
    });
    await this.notifications.safeEmitUserEvent(userId, {
      type: "billing_placeholder_clicked",
      title: "Beta 支付候补已记录",
      body: `你已登记 ${plan} 方案，Alpha 阶段不会发起真实扣款。`,
      targetType: "billing",
      targetId: intent.id,
      metadata: { plan, intentId: intent.id },
      dedupeKey: `billing-placeholder:${intent.id}`,
    });
    return intent;
  }

  private async settleAgentRunAndUpdateStatus(
    userId: string,
    agentRunId: string,
    tokenUsage: TokenUsage,
    priceInput: { provider?: ModelPrice["provider"] | string | null; model?: string | null },
    runUpdate: AgentRunTerminalUpdateInput,
  ) {
    const account = await this.ensureAccount(userId);
    const entries = await this.billing.listLedgerEntriesForRun(agentRunId);
    const reservedCents = this.reservedCents(entries);
    const costCents = calculateAgentRunCostCents(tokenUsage, priceInput);
    const terminalEntry = await this.billing.createTerminalLedgerEntryAndUpdateRun({
      entry: {
        accountId: account.id,
        userId,
        agentRunId,
        type: "model_run_settled",
        amountCents: reservedCents - costCents,
        tokenUsage,
        reason: "settle agent run",
      },
      expectedRunStatus: "running",
      runUpdate,
    });
    if (terminalEntry?.type === "model_run_settled") await this.safeEmitLowBalanceIfNeeded(userId, agentRunId);
    return terminalEntry?.type === "model_run_settled" ? terminalEntry : null;
  }

  private async refundAgentRunAndUpdateStatus(
    userId: string,
    agentRunId: string,
    reason: string,
    runUpdate: AgentRunTerminalUpdateInput,
  ) {
    const account = await this.ensureAccount(userId);
    const entries = await this.billing.listLedgerEntriesForRun(agentRunId);
    const reservedCents = this.reservedCents(entries);
    if (reservedCents <= 0) return null;
    const terminalEntry = await this.billing.createTerminalLedgerEntryAndUpdateRun({
      entry: {
        accountId: account.id,
        userId,
        agentRunId,
        type: "model_run_refunded",
        amountCents: reservedCents,
        tokenUsage: null,
        reason,
      },
      expectedRunStatus: "running",
      runUpdate,
    });
    return terminalEntry?.type === "model_run_refunded" ? terminalEntry : null;
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

  private async emitLowBalanceIfNeeded(userId: string, agentRunId: string) {
    const balance = await this.getBalance(userId);
    if (balance.balanceCents > balance.lowBalanceThresholdCents) return;
    await this.notifications.safeEmitUserEvent(userId, {
      type: "low_balance",
      title: "创作点余额偏低",
      body: `当前余额为 ¥${(balance.balanceCents / 100).toFixed(2)}，Alpha 阶段不会自动扣款。`,
      targetType: "billing",
      targetId: agentRunId,
      metadata: {
        balanceCents: balance.balanceCents,
        lowBalanceThresholdCents: balance.lowBalanceThresholdCents,
      },
      dedupeKey: `low-balance:${userId}:${agentRunId}`,
    });
  }

  private async safeEmitLowBalanceIfNeeded(userId: string, agentRunId: string) {
    try {
      await this.emitLowBalanceIfNeeded(userId, agentRunId);
    } catch (error) {
      captureException(error, {
        tags: { feature: "billing", notificationType: "low_balance" },
        extra: { userId, agentRunId },
      });
    }
  }
}

export function calculateAgentRunCostCents(
  tokenUsage: TokenUsage,
  priceInput: { provider?: ModelPrice["provider"] | string | null; model?: string | null } = {},
) {
  const modelPrice = normalizeModelPriceInput(priceInput);
  return calculateModelRunCostCents({
    provider: modelPrice.provider,
    model: modelPrice.model,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
  });
}

function normalizeModelPriceInput(input: { provider?: ModelPrice["provider"] | string | null; model?: string | null }) {
  const model = normalizeModelName(input.model ?? "qwen3-32b");
  if (input.provider === "openai" || model.startsWith("gpt-")) return { provider: "openai" as const, model };
  if (input.provider === "anthropic" || model.startsWith("claude")) return { provider: "anthropic" as const, model };
  if (input.provider === "openai-compatible") return { provider: "openai-compatible" as const, model };
  if (model === "mock") return { provider: "openai-compatible" as const, model: "qwen3-32b" };
  return { provider: "openai-compatible" as const, model };
}

function normalizeModelName(model: string) {
  if (model.startsWith("openai/")) return model.replace("openai/", "");
  if (model.startsWith("anthropic/")) return model.replace("anthropic/", "");
  return model;
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

function isTerminalEntry(entry: UsageLedgerEntryRecord) {
  return entry.type === "model_run_settled" || entry.type === "model_run_refunded";
}
