-- A run can finish billing only once: either settled or refunded, never both.
WITH ranked_terminal_entries AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "agentRunId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
  FROM "usage_ledger"
  WHERE "agentRunId" IS NOT NULL
    AND "type" IN ('model_run_settled', 'model_run_refunded')
)
DELETE FROM "usage_ledger"
USING ranked_terminal_entries
WHERE "usage_ledger"."id" = ranked_terminal_entries."id"
  AND ranked_terminal_entries.row_number > 1;

CREATE UNIQUE INDEX "usage_ledger_agent_run_terminal_once_idx"
  ON "usage_ledger" ("agentRunId")
  WHERE "agentRunId" IS NOT NULL
    AND "type" IN ('model_run_settled', 'model_run_refunded');
