-- A run can finish billing only once: either settled or refunded, never both.
CREATE UNIQUE INDEX "usage_ledger_agent_run_terminal_once_idx"
  ON "usage_ledger" ("agentRunId")
  WHERE "agentRunId" IS NOT NULL
    AND "type" IN ('model_run_settled', 'model_run_refunded');
