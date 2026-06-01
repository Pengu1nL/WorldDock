import { Inject, Injectable, NotFoundException, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@worlddock/db";
import {
  activityTargetTypeSchema,
  notificationTypeSchema,
  type ActivityTargetType,
  type NotificationType,
} from "@worlddock/domain";
import { captureException } from "../../common/observability";
import type { AuthSubject } from "../auth/auth.service";

export const NOTIFICATIONS_REPOSITORY = Symbol("NOTIFICATIONS_REPOSITORY");

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

export type NotificationRecord = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type SupportFeedbackRecord = {
  id: string;
  userId: string;
  message: string;
  context: unknown;
  status: "open" | "closed";
  createdAt: Date;
};

export type ActivityEventRecord = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetType: ActivityTargetType;
  targetId: string | null;
  metadata: JsonObject;
  dedupeKey: string | null;
  createdAt: Date;
};

export type UserEventInput = {
  type: NotificationType;
  title: string;
  body: string;
  targetType: ActivityTargetType;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey: string;
  notify?: boolean;
};

export type NotificationsRepository = {
  upsertNotification(input: Omit<NotificationRecord, "id" | "readAt" | "createdAt">): Promise<NotificationRecord>;
  listNotifications(userId: string): Promise<NotificationRecord[]>;
  markNotificationRead(userId: string, notificationId: string, readAt: Date): Promise<NotificationRecord | null>;
  createSupportFeedback(input: Omit<SupportFeedbackRecord, "id" | "status" | "createdAt">): Promise<SupportFeedbackRecord>;
  upsertActivityEvent(input: Omit<ActivityEventRecord, "id" | "createdAt">): Promise<ActivityEventRecord>;
  listActivityEvents(userId: string, limit: number): Promise<ActivityEventRecord[]>;
};

@Injectable()
export class NotificationsService {
  constructor(@Inject(NOTIFICATIONS_REPOSITORY) private readonly repository: NotificationsRepository) {}

  async list(subject: AuthSubject) {
    await this.ensureWelcome(subject);
    const notifications = await this.repository.listNotifications(subject.user.id);
    return {
      notifications: notifications.map(toNotificationResponse),
      unreadCount: notifications.filter((notification) => !notification.readAt).length,
    };
  }

  async markRead(subject: AuthSubject, notificationId: string) {
    const notification = await this.repository.markNotificationRead(subject.user.id, notificationId, new Date());
    if (!notification) throw new NotFoundException({ code: "NOT_FOUND", message: "Notification not found." });
    return toNotificationResponse(notification);
  }

  async listActivity(subject: AuthSubject) {
    await this.ensureWelcome(subject);
    const activity = await this.repository.listActivityEvents(subject.user.id, 50);
    return { activity: activity.map(toActivityResponse) };
  }

  async submitFeedback(subject: AuthSubject, input: { message: string; context: Record<string, unknown> }) {
    const feedback = await this.repository.createSupportFeedback({
      userId: subject.user.id,
      message: input.message,
      context: input.context,
    });
    const event = await this.safeEmitUserEvent(subject.user.id, {
      type: "support_feedback_submitted",
      title: "反馈已收到",
      body: "Alpha 团队会在产品节奏中处理这条反馈。",
      targetType: "support",
      targetId: feedback.id,
      metadata: { feedbackId: feedback.id, context: input.context },
      dedupeKey: `support-feedback:${feedback.id}`,
    });
    return { feedback: toFeedbackResponse(feedback), notification: event?.notification ?? null };
  }

  async emitUserEvent(userId: string, input: UserEventInput) {
    const activity = await this.repository.upsertActivityEvent({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: toJsonObject(input.metadata ?? {}),
      dedupeKey: input.dedupeKey,
    });
    const notification =
      input.notify === false
        ? null
        : await this.createNotification(userId, {
            type: input.type,
            title: input.title,
            body: input.body,
            dedupeKey: input.dedupeKey,
          });
    return {
      activity: toActivityResponse(activity),
      notification: notification ? toNotificationResponse(notification) : null,
    };
  }

  async safeEmitUserEvent(userId: string, input: UserEventInput) {
    try {
      return await this.emitUserEvent(userId, input);
    } catch (error) {
      captureException(error, {
        tags: {
          feature: "notifications",
          notificationType: input.type,
          targetType: input.targetType,
        },
        extra: {
          userId,
          targetId: input.targetId ?? null,
          dedupeKey: input.dedupeKey,
        },
      });
      return null;
    }
  }

  async createNotification(userId: string, input: {
    type: NotificationType;
    title: string;
    body: string;
    dedupeKey?: string;
  }) {
    return this.repository.upsertNotification({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey ?? `${input.type}:${userId}`,
    });
  }

  private async ensureWelcome(subject: AuthSubject) {
    await this.emitUserEvent(subject.user.id, {
      type: "welcome",
      title: "欢迎来到 WorldDock Alpha",
      body: "你的站内通知会显示发布、余额、反馈和协作事件。",
      targetType: "account",
      targetId: subject.user.id,
      metadata: {},
      dedupeKey: `welcome:${subject.user.id}`,
    });
  }
}

@Injectable()
export class PrismaNotificationsRepository implements NotificationsRepository, OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient();

  async upsertNotification(input: Parameters<NotificationsRepository["upsertNotification"]>[0]) {
    const notification = input.dedupeKey !== null
      ? await this.prisma.notification.upsert({
          where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
          create: input,
          update: { title: input.title, body: input.body, type: input.type },
        })
      : await this.prisma.notification.create({ data: input });
    return mapNotification(notification);
  }

  async listNotifications(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return notifications.map(mapNotification);
  }

  async markNotificationRead(userId: string, notificationId: string, readAt: Date) {
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt },
    });
    if (updated.count === 0) return null;
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    return notification ? mapNotification(notification) : null;
  }

  async createSupportFeedback(input: Parameters<NotificationsRepository["createSupportFeedback"]>[0]) {
    const feedback = await this.prisma.supportFeedback.create({ data: input as never });
    return mapFeedback(feedback);
  }

  async upsertActivityEvent(input: Parameters<NotificationsRepository["upsertActivityEvent"]>[0]) {
    const data = { ...input, metadata: toJsonObject(input.metadata) };
    const activity = input.dedupeKey !== null
      ? await this.prisma.activityEvent.upsert({
          where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
          create: data,
          update: {
            type: input.type,
            title: input.title,
            body: input.body,
            targetType: input.targetType,
            targetId: input.targetId,
            metadata: data.metadata,
          },
        })
      : await this.prisma.activityEvent.create({ data });
    return mapActivity(activity);
  }

  async listActivityEvents(userId: string, limit: number) {
    const events = await this.prisma.activityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return events.map(mapActivity);
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

function mapNotification(record: {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    ...record,
    type: notificationTypeSchema.parse(record.type),
  };
}

function mapFeedback(record: {
  id: string;
  userId: string;
  message: string;
  context: unknown;
  status: string;
  createdAt: Date;
}): SupportFeedbackRecord {
  return {
    ...record,
    status: record.status === "closed" ? "closed" : "open",
  };
}

function mapActivity(record: {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  dedupeKey: string | null;
  createdAt: Date;
}): ActivityEventRecord {
  return {
    ...record,
    type: notificationTypeSchema.parse(record.type),
    targetType: activityTargetTypeSchema.parse(record.targetType),
    metadata: toJsonObject(record.metadata),
  };
}

function toNotificationResponse(notification: NotificationRecord) {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

function toActivityResponse(activity: ActivityEventRecord) {
  return {
    id: activity.id,
    userId: activity.userId,
    type: activity.type,
    title: activity.title,
    body: activity.body,
    targetType: activity.targetType,
    targetId: activity.targetId,
    metadata: activity.metadata,
    createdAt: activity.createdAt.toISOString(),
  };
}

function toFeedbackResponse(feedback: SupportFeedbackRecord) {
  return {
    ...feedback,
    createdAt: feedback.createdAt.toISOString(),
  };
}

function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, toJsonValue(item, new WeakSet<object>())] as const)
      .filter((entry): entry is readonly [string, JsonValue] => entry[1] !== undefined),
  );
}

function toJsonValue(value: unknown, seen: WeakSet<object>): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;

  seen.add(value);
  if (Array.isArray(value)) {
    const items = value
      .map((item) => toJsonValue(item, seen))
      .filter((item): item is JsonValue => item !== undefined);
    seen.delete(value);
    return items;
  }

  const object = Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, toJsonValue(item, seen)] as const)
      .filter((entry): entry is readonly [string, JsonValue] => entry[1] !== undefined),
  );
  seen.delete(value);
  return object;
}
