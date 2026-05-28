import { Injectable } from "@nestjs/common";
import { z } from "zod";

export const productEventSchema = z.object({
  name: z.string().min(1),
  context: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.string().datetime().optional(),
});

export type ProductEventRecord = {
  id: string;
  name: string;
  context: Record<string, unknown>;
  occurredAt: string;
};

const productEvents: ProductEventRecord[] = [];

@Injectable()
export class AnalyticsService {
  record(input: z.infer<typeof productEventSchema>) {
    const event = {
      id: `event_${productEvents.length + 1}`,
      name: input.name,
      context: input.context,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    };
    productEvents.push(event);
    return event;
  }
}
