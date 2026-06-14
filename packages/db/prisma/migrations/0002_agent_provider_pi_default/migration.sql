UPDATE "agent_runs" SET "provider" = 'pi' WHERE "provider" <> 'pi';
ALTER TABLE "agent_runs" ALTER COLUMN "provider" SET DEFAULT 'pi';
