import { z } from "zod";

export const PRODUCT_EVENTS = [
  "signed_up",
  "onboarding_completed",
  "world_created",
  "agent_run_started",
  "suggestion_saved",
  "world_published",
  "repository_forked",
  "alpha_feedback_submitted",
  "billing_placeholder_clicked",
] as const;

export const productEventNameSchema = z.enum(PRODUCT_EVENTS);

export const productEventInputSchema = z.object({
  userId: z.string().min(1).optional(),
  name: productEventNameSchema,
  context: z.record(z.string(), z.unknown()).default({}),
  anonymousId: z.string().min(1).optional(),
  route: z.string().min(1).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const productEventSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).nullable(),
  name: productEventNameSchema,
  context: z.record(z.string(), z.unknown()),
  anonymousId: z.string().min(1).nullable(),
  route: z.string().min(1).nullable(),
  userAgent: z.string().min(1).nullable(),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type ProductEventName = z.infer<typeof productEventNameSchema>;
export type ProductEventInput = z.infer<typeof productEventInputSchema>;
export type ProductEvent = z.infer<typeof productEventSchema>;
