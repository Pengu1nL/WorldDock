-- Keep settlement/refund idempotent for a run without limiting other ledger activity.
CREATE UNIQUE INDEX "usage_ledger_agent_run_settled_once_idx"
  ON "usage_ledger" ("agentRunId")
  WHERE "agentRunId" IS NOT NULL AND "type" = 'model_run_settled';

CREATE UNIQUE INDEX "usage_ledger_agent_run_refunded_once_idx"
  ON "usage_ledger" ("agentRunId")
  WHERE "agentRunId" IS NOT NULL AND "type" = 'model_run_refunded';
