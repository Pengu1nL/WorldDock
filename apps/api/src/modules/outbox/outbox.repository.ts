export const OUTBOX_REPOSITORY = Symbol("OUTBOX_REPOSITORY");

export type OutboxEventRecord = {
  id: string;
  type: string;
  aggregateId: string;
  payload: unknown;
  createdAt: Date;
  processedAt: Date | null;
};

export type OutboxRepository = {
  createEvent(input: Omit<OutboxEventRecord, "id" | "createdAt" | "processedAt">): Promise<OutboxEventRecord>;
  listPending(): Promise<OutboxEventRecord[]>;
  markProcessed(id: string, processedAt: Date): Promise<OutboxEventRecord | null>;
};
