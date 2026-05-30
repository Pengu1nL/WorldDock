import { describe, expect, it } from "vitest";
import { BillingService, AGENT_RUN_RESERVE_CENTS } from "./billing.service";
import type { BillingAccountRecord, BillingRepository, UsageLedgerEntryRecord } from "./billing.repository";

describe("BillingService", () => {
  it("settles an agent run once when concurrent callers race", async () => {
    const repository = createRacyBillingRepository();
    const service = new BillingService(repository);

    await Promise.all([
      service.settleAgentRun("user_1", "run_1", { inputTokens: 12, outputTokens: 30, totalTokens: 42 }, { provider: "openai-compatible", model: "qwen3-32b" }),
      service.settleAgentRun("user_1", "run_1", { inputTokens: 12, outputTokens: 30, totalTokens: 42 }, { provider: "openai-compatible", model: "qwen3-32b" }),
    ]);

    const entries = await repository.listLedgerEntriesForRun("run_1");
    expect(entries.filter((entry) => entry.type === "model_run_settled")).toHaveLength(1);
  });

  it("creates only one terminal entry when settlement and refund race", async () => {
    const repository = createRacyBillingRepository();
    const service = new BillingService(repository);

    await Promise.all([
      service.settleAgentRun("user_1", "run_1", { inputTokens: 12, outputTokens: 30, totalTokens: 42 }, { provider: "openai-compatible", model: "qwen3-32b" }),
      service.refundAgentRun("user_1", "run_1", "provider_failed"),
    ]);

    const entries = await repository.listLedgerEntriesForRun("run_1");
    const terminalEntries = entries.filter((entry) => entry.type === "model_run_settled" || entry.type === "model_run_refunded");
    expect(terminalEntries).toHaveLength(1);
    expect(entries.reduce((total, entry) => total + entry.amountCents, 0)).toBeLessThanOrEqual(0);
  });

  it("does not settle a run that already has a refund terminal entry", async () => {
    const repository = createRacyBillingRepository({ synchronizeFirstRunLists: false });
    const service = new BillingService(repository);

    const refund = await service.refundAgentRun("user_1", "run_1", "provider_failed");
    const settlement = await service.settleAgentRun(
      "user_1",
      "run_1",
      { inputTokens: 12, outputTokens: 30, totalTokens: 42 },
      { provider: "openai-compatible", model: "qwen3-32b" },
    );

    const entries = await repository.listLedgerEntriesForRun("run_1");
    expect(refund?.type).toBe("model_run_refunded");
    expect(settlement).toBeNull();
    expect(entries.filter((entry) => entry.type === "model_run_settled")).toHaveLength(0);
    expect(entries.filter((entry) => entry.type === "model_run_refunded")).toHaveLength(1);
  });

  it("does not refund a run that already has a settlement terminal entry", async () => {
    const repository = createRacyBillingRepository({ synchronizeFirstRunLists: false });
    const service = new BillingService(repository);

    const settlement = await service.settleAgentRun(
      "user_1",
      "run_1",
      { inputTokens: 12, outputTokens: 30, totalTokens: 42 },
      { provider: "openai-compatible", model: "qwen3-32b" },
    );
    const refund = await service.refundAgentRun("user_1", "run_1", "provider_failed");

    const entries = await repository.listLedgerEntriesForRun("run_1");
    expect(settlement?.type).toBe("model_run_settled");
    expect(refund).toBeNull();
    expect(entries.filter((entry) => entry.type === "model_run_settled")).toHaveLength(1);
    expect(entries.filter((entry) => entry.type === "model_run_refunded")).toHaveLength(0);
  });
});

function createRacyBillingRepository(options: { synchronizeFirstRunLists?: boolean } = {}): BillingRepository {
  const synchronizeFirstRunLists = options.synchronizeFirstRunLists ?? true;
  const account: BillingAccountRecord = {
    id: "ba_1",
    userId: "user_1",
    currency: "CNY",
    freeCreditGrantedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const entries = new Map<string, UsageLedgerEntryRecord>([
    ["ule_1", {
      id: "ule_1",
      accountId: account.id,
      userId: account.userId,
      agentRunId: "run_1",
      type: "model_run_reserved",
      amountCents: -AGENT_RUN_RESERVE_CENTS,
      tokenUsage: null,
      reason: "reserve agent run",
      createdAt: new Date(),
    }],
  ]);
  const listWaiters: Array<() => void> = [];
  let runLedgerListCalls = 0;

  return {
    async findAccountByUserId(userId) {
      return userId === account.userId ? account : null;
    },
    async createAccount() {
      return account;
    },
    async markFreeCreditGranted() {
      return account;
    },
    async createLedgerEntry(input) {
      const entry = { id: `ule_${entries.size + 1}`, createdAt: new Date(), ...input };
      entries.set(entry.id, entry);
      return entry;
    },
    async createTerminalLedgerEntryOnce(input) {
      const existing = [...entries.values()].find((entry) => entry.agentRunId === input.agentRunId && isTerminalEntry(entry));
      if (existing) return existing;
      const entry = { id: `ule_${entries.size + 1}`, createdAt: new Date(), ...input };
      entries.set(entry.id, entry);
      return entry;
    },
    async listLedgerEntries(userId) {
      return [...entries.values()].filter((entry) => entry.userId === userId);
    },
    async listLedgerEntriesForRun(agentRunId) {
      const snapshot = [...entries.values()].filter((entry) => entry.agentRunId === agentRunId);
      runLedgerListCalls += 1;
      if (synchronizeFirstRunLists && runLedgerListCalls <= 2) {
        await new Promise<void>((resolve) => {
          listWaiters.push(resolve);
          if (listWaiters.length === 2) listWaiters.splice(0).forEach((waiter) => waiter());
        });
      }
      return snapshot;
    },
    async createPlaceholderIntent(input) {
      return { id: "bpi_1", createdAt: new Date(), status: "captured", ...input };
    },
    async listPlaceholderIntents() {
      return [];
    },
  };
}

function isTerminalEntry(entry: UsageLedgerEntryRecord) {
  return entry.type === "model_run_settled" || entry.type === "model_run_refunded";
}
