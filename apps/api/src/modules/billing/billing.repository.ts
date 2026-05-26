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

export type BillingRepository = {
  findAccountByUserId(userId: string): Promise<BillingAccountRecord | null>;
  createAccount(input: { userId: string; freeCreditGrantedAt?: Date | null }): Promise<BillingAccountRecord>;
  markFreeCreditGranted(accountId: string, grantedAt: Date): Promise<BillingAccountRecord | null>;
  createLedgerEntry(input: Omit<UsageLedgerEntryRecord, "id" | "createdAt">): Promise<UsageLedgerEntryRecord>;
  listLedgerEntries(userId: string): Promise<UsageLedgerEntryRecord[]>;
  listLedgerEntriesForRun(agentRunId: string): Promise<UsageLedgerEntryRecord[]>;
};
