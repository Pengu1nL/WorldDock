import { z } from "zod";

export const PRODUCT_EVENTS = {
  signedUp: "signed_up",
  onboardingCompleted: "onboarding_completed",
  worldCreated: "world_created",
  agentRunStarted: "agent_run_started",
  suggestionSaved: "suggestion_saved",
  worldPublished: "world_published",
  repositoryForked: "repository_forked",
  alphaFeedbackSubmitted: "alpha_feedback_submitted",
  billingPlaceholderClicked: "billing_placeholder_clicked",
} as const;

export const productEventNameSchema = z.enum([
  PRODUCT_EVENTS.signedUp,
  PRODUCT_EVENTS.onboardingCompleted,
  PRODUCT_EVENTS.worldCreated,
  PRODUCT_EVENTS.agentRunStarted,
  PRODUCT_EVENTS.suggestionSaved,
  PRODUCT_EVENTS.worldPublished,
  PRODUCT_EVENTS.repositoryForked,
  PRODUCT_EVENTS.alphaFeedbackSubmitted,
  PRODUCT_EVENTS.billingPlaceholderClicked,
]);

export const productEventInputSchema = z.object({
  name: productEventNameSchema,
  context: z.record(z.string(), z.unknown()).default({}),
  anonymousId: z.string().min(1).optional(),
  route: z.string().min(1).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const productEventSchema = z.object({
  id: z.string().min(1),
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
