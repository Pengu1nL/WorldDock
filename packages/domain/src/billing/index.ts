import { z } from "zod";
import { tokenUsageSchema } from "../agent";

export const usageLedgerEntryTypeSchema = z.enum([
  "credit_granted",
  "model_run_reserved",
  "model_run_settled",
  "model_run_refunded",
  "admin_adjusted",
]);

export const billingAccountSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  currency: z.literal("CNY"),
  freeCreditGrantedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const usageLedgerEntrySchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  userId: z.string().min(1),
  agentRunId: z.string().min(1).nullable().optional(),
  type: usageLedgerEntryTypeSchema,
  amountCents: z.number().int(),
  tokenUsage: tokenUsageSchema.nullable().optional(),
  reason: z.string().min(1).nullable().optional(),
  createdAt: z.string().datetime(),
});

export const billingBalanceSchema = z.object({
  userId: z.string().min(1),
  currency: z.literal("CNY"),
  balanceCents: z.number().int(),
  lowBalanceThresholdCents: z.number().int().min(0),
  updatedAt: z.string().datetime(),
});

export const usageSummarySchema = z.object({
  balance: billingBalanceSchema,
  lastAgentRun: z.object({
    agentRunId: z.string().min(1),
    tokenUsage: tokenUsageSchema,
    costCents: z.number().int().min(0),
    createdAt: z.string().datetime(),
  }).nullable(),
  entries: z.array(usageLedgerEntrySchema),
});

export type UsageLedgerEntryType = z.infer<typeof usageLedgerEntryTypeSchema>;
export type BillingAccount = z.infer<typeof billingAccountSchema>;
export type UsageLedgerEntry = z.infer<typeof usageLedgerEntrySchema>;
export type BillingBalance = z.infer<typeof billingBalanceSchema>;
export type UsageSummary = z.infer<typeof usageSummarySchema>;
