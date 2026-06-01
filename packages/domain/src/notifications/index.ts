import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "welcome",
  "low_balance",
  "agent_run_failed",
  "world_published",
  "repository_forked",
  "release_published",
  "billing_placeholder_clicked",
  "report_received",
  "support_feedback_submitted",
]);

export const notificationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: notificationTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const activityTargetTypeSchema = z.enum([
  "account",
  "agent_run",
  "billing",
  "fork",
  "release",
  "repository",
  "report",
  "support",
  "world",
]);

export const activityEventSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: notificationTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  targetType: activityTargetTypeSchema,
  targetId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type ActivityTargetType = z.infer<typeof activityTargetTypeSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;
