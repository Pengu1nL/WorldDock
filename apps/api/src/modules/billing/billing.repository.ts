import type { TokenUsage, UsageLedgerEntryType } from "@worlddock/domain";

export const BILLING_REPOSITORY = Symbol("BILLING_REPOSITORY");

export type BillingAccountRecord = {
  id: string;
  userId: string;
  currency: "CNY";
  freeCreditGrantedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UsageLedgerEntryRecord = {
  id: string;
  accountId: string;
  userId: string;
  agentRunId?: string | null;
  type: UsageLedgerEntryType;
  amountCents: number;
  tokenUsage?: TokenUsage | null;
  reason?: string | null;
  createdAt: Date;
};

export type BillingPlaceholderIntentRecord = {
  id: string;
  userId: string;
  accountId: string;
  plan: string;
  source: string;
  status: "captured";
  createdAt: Date;
};

export type TerminalLedgerEntryInput = Omit<UsageLedgerEntryRecord, "id" | "createdAt" | "agentRunId" | "type"> & {
  agentRunId: string;
  type: Extract<UsageLedgerEntryType, "model_run_settled" | "model_run_refunded">;
};

export type AgentRunTerminalUpdateInput = {
  status: "completed" | "failed" | "cancelled";
  tokenUsage?: TokenUsage | null;
  completedAt?: Date | null;
  failedAt?: Date | null;
  cancelledAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type TerminalLedgerAndRunUpdateInput = {
  entry: TerminalLedgerEntryInput;
  expectedRunStatus: "running";
  runUpdate: AgentRunTerminalUpdateInput;
};

export type BillingRepository = {
  findAccountByUserId(userId: string): Promise<BillingAccountRecord | null>;
  createAccount(input: { userId: string; freeCreditGrantedAt?: Date | null }): Promise<BillingAccountRecord>;
  markFreeCreditGranted(accountId: string, grantedAt: Date): Promise<BillingAccountRecord | null>;
  createLedgerEntry(input: Omit<UsageLedgerEntryRecord, "id" | "createdAt">): Promise<UsageLedgerEntryRecord>;
  createTerminalLedgerEntryOnce(input: TerminalLedgerEntryInput): Promise<UsageLedgerEntryRecord>;
  createTerminalLedgerEntryAndUpdateRun(input: TerminalLedgerAndRunUpdateInput): Promise<UsageLedgerEntryRecord | null>;
  listLedgerEntries(userId: string): Promise<UsageLedgerEntryRecord[]>;
  listLedgerEntriesForRun(agentRunId: string): Promise<UsageLedgerEntryRecord[]>;
  createPlaceholderIntent(input: Omit<BillingPlaceholderIntentRecord, "id" | "createdAt" | "status"> & Partial<Pick<BillingPlaceholderIntentRecord, "status">>): Promise<BillingPlaceholderIntentRecord>;
  listPlaceholderIntents(userId: string): Promise<BillingPlaceholderIntentRecord[]>;
};
