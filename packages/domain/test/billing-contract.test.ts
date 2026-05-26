import { describe, expect, it } from "vitest";
import {
  billingBalanceSchema,
  usageLedgerEntrySchema,
  usageSummarySchema,
} from "../src";

describe("billing domain contract", () => {
  it("validates signed usage ledger entries", () => {
    const entry = usageLedgerEntrySchema.parse({
      id: "ule_1",
      accountId: "ba_1",
      userId: "user_1",
      agentRunId: "run_1",
      type: "model_run_reserved",
      amountCents: -100,
      tokenUsage: null,
      reason: "reserve agent run",
      createdAt: "2026-05-26T12:00:00.000Z",
    });

    expect(entry.amountCents).toBe(-100);
  });

  it("validates balance and usage summaries", () => {
    const balance = billingBalanceSchema.parse({
      userId: "user_1",
      currency: "CNY",
      balanceCents: 9950,
      lowBalanceThresholdCents: 500,
      updatedAt: "2026-05-26T12:00:00.000Z",
    });
    const usage = usageSummarySchema.parse({
      balance,
      lastAgentRun: {
        agentRunId: "run_1",
        tokenUsage: { inputTokens: 12, outputTokens: 30, totalTokens: 42 },
        costCents: 5,
        createdAt: "2026-05-26T12:00:00.000Z",
      },
      entries: [],
    });

    expect(usage.lastAgentRun?.costCents).toBe(5);
  });
});
