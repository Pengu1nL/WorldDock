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

export type ProductEventName = typeof PRODUCT_EVENTS[keyof typeof PRODUCT_EVENTS];

export function trackProductEvent(name: ProductEventName, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  void fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/v1/analytics/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, context, occurredAt: new Date().toISOString() }),
  }).catch(() => {});
}
